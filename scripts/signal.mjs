#!/usr/bin/env node
/**
 * Abundance 2.0 — calcul du régime.
 *
 * Récupère les clôtures quotidiennes (SMH, GLD) et l'écart de crédit, calcule le
 * régime (RISK ON / NEUTRAL / RISK OFF) et réécrit state.json.
 * S'exécute dans GitHub Actions — côté serveur, donc pas de CORS.
 *
 * Règles :
 *   - Le 200 jours est le patron : au-dessus = risque autorisé, en dessous = risque réduit.
 *   - Confirmation à 50 jours (momentum) + force relative SMH vs GLDM (rapport > sa MA 200).
 *   - SMH > 200j ET SMH > 50j ET SMH/GLDM > sa MA 200  -> RISK ON
 *   - SMH <= 200j                                         -> RISK OFF
 *   - Sinon                                               -> NEUTRAL
 *   - Disjoncteur de crédit : force le RISK OFF (il ne peut aller que vers la sécurité).
 *
 * Node 20+ (global fetch). Aucune dépendance.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CFG = {
  risk: "SMH",
  hedge: "GLD",
  maLongue: 200,   // le patron
  maCourt: 50,     // confirmation / momentum
  confirmDays: 2,  // fermetures consécutives pour changer de régime
};

const STATE_PATH = new URL("../state.json", import.meta.url).pathname;

/* ----------------------------------------------------------------- fetch */

export function parseYahoo(json) {
  const res = json?.chart?.result?.[0];
  if (!res) {
    const err = json?.chart?.error?.description ?? "no result in response";
    throw new Error(`Yahoo returned no data: ${err}`);
  }
  const ts = res.timestamp;
  const adj = res.indicators?.adjclose?.[0]?.adjclose;
  const raw = res.indicators?.quote?.[0]?.close;
  const closes = adj ?? raw;
  if (!Array.isArray(ts) || !Array.isArray(closes)) {
    throw new Error("Yahoo response missing timestamp or close series");
  }
  if (!adj) console.warn("  ! adjclose missing, falling back to unadjusted closes");

  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && isFinite(c) && c > 0) {
      bars.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
    }
  }
  if (!bars.length) throw new Error("No usable price rows");
  return bars.sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function fetchSymbol(symbol, tries = 3) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&events=div%2Csplit`;
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; plan-signal/1.0)", Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const bars = parseYahoo(await r.json());
      console.log(`  ${symbol}: ${bars.length} barres, dernière ${bars.at(-1).date} @ ${bars.at(-1).close.toFixed(2)}`);
      return bars;
    } catch (e) {
      lastErr = e;
      console.warn(`  ${symbol} essai ${i}/${tries} échoué: ${e.message}`);
      if (i < tries) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw new Error(`${symbol}: ${lastErr.message}`);
}

/* ---------------------------------------------------------------- régime */

export function alignSeries(a, b) {
  const m = new Map(b.map((x) => [x.date, x.close]));
  return a
    .filter((x) => m.has(x.date) && x.close > 0 && m.get(x.date) > 0)
    .map((x) => ({ date: x.date, a: x.close, b: m.get(x.date) }))
    .sort((x, y) => (x.date < y.date ? -1 : 1));
}

export function sma(v, n) {
  const out = new Array(v.length).fill(null);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= n) s -= v[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

export function computeRegime(riskBars, hedgeBars, cfg = CFG) {
  const j = alignSeries(riskBars, hedgeBars);
  if (j.length < cfg.maLongue + 1) {
    throw new Error(`Besoin de ${cfg.maLongue + 1} séances communes, ${j.length} reçues`);
  }
  const riskCloses = j.map((p) => p.a);
  const ratios = j.map((p) => p.a / p.b);
  const ma200 = sma(riskCloses, cfg.maLongue);
  const ma50 = sma(riskCloses, cfg.maCourt);
  const ratioMa200 = sma(ratios, cfg.maLongue);

  function cible(i) {
    if (ma200[i] === null) return null;
    const auDessus200 = riskCloses[i] > ma200[i];
    const auDessus50 = ma50[i] !== null && riskCloses[i] > ma50[i];
    const relOk = ratioMa200[i] !== null && ratios[i] > ratioMa200[i];
    if (!auDessus200) return "OFF";
    if (auDessus50 && relOk) return "ON";
    return "NEUTRAL";
  }

  let state = "NEUTRAL", pend = null, cnt = 0;
  const flips = [];
  let dernier = null;

  for (let i = 0; i < j.length; i++) {
    const want = cible(i);
    if (want === null) continue;
    if (want !== state) {
      if (pend === want) cnt++; else { pend = want; cnt = 1; }
      if (cnt >= cfg.confirmDays) {
        flips.push({ date: j[i].date, from: state, to: want });
        state = want; pend = null; cnt = 0;
      }
    } else { pend = null; cnt = 0; }

    dernier = {
      date: j[i].date,
      smhClose: Math.round(riskCloses[i] * 100) / 100,
      smhMa200: Math.round(ma200[i] * 100) / 100,
      smhMa50: ma50[i] !== null ? Math.round(ma50[i] * 100) / 100 : null,
      smhVs200Pct: Math.round((riskCloses[i] / ma200[i] - 1) * 1000) / 10,
      smhVs50Pct: ma50[i] !== null ? Math.round((riskCloses[i] / ma50[i] - 1) * 1000) / 10 : null,
      ratioSmhGld: Math.round(ratios[i] * 1000) / 1000,
      ratioMa200: ratioMa200[i] !== null ? Math.round(ratioMa200[i] * 1000) / 1000 : null,
      ratioVs200Pct: ratioMa200[i] !== null ? Math.round((ratios[i] / ratioMa200[i] - 1) * 1000) / 10 : null,
    };
  }
  return { state, dernier, flips, pending: pend ? { state: pend, count: cnt } : null, sessions: j.length };
}

/* ------------------------------------------------------------------ main */

const TITRES = ["VT","GLDM","MCHI","SMH","IBIT","SGOV","AIPO","BCI"];

/**
 * Valide qu'un nouveau prix est raisonnable comparé au prix précédent.
 * Rejette les variations de plus de 50 % en une journée (probablement une
 * erreur de données) et prévient au-delà de 20 %.
 */
function validatePrice(symbol, newPrice, prevPrice) {
  if (!prevPrice || prevPrice <= 0) return true;

  const changePct = Math.abs((newPrice - prevPrice) / prevPrice);
  const changePercent = (changePct * 100).toFixed(1);

  if (changePct > 0.50) {
    console.warn(`  ⚠ ${symbol}: REJETÉ — ${newPrice} vs ${prevPrice} (${changePercent}% de variation, seuil de 50 % dépassé)`);
    return false;
  }
  if (changePct > 0.20) {
    console.warn(`  ⚠ ${symbol}: Forte variation — ${newPrice} vs ${prevPrice} (${changePercent}%)`);
  }
  return true;
}

/* ============================ DISJONCTEUR DE CRÉDIT ============================
 * ICE BofA US High Yield OAS, via FRED. Quotidien, gratuit, sans clé.
 * Se déclenche quand l'écart dépasse sa moyenne 200 jours de 50 % pendant 2
 * fermetures. Se réarme sous 1,20x. Il ne peut QUE mettre à l'abri — jamais vers le risque.
 */
const FRED_SERIE = "BAMLH0A0HYM2";
const DISJ = { maLength: 200, seuilHaut: 1.50, seuilBas: 1.20, confirm: 2 };

export function parseFred(csv) {
  const lignes = csv.trim().split(/\r?\n/);
  if (lignes.length < 2) throw new Error("FRED: réponse vide");
  const bars = [];
  for (let i = 1; i < lignes.length; i++) {
    const [d, v] = lignes[i].split(",");
    const x = parseFloat(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(x) && x > 0) {
      bars.push({ date: d, close: x });
    }
  }
  if (!bars.length) throw new Error("FRED: aucune ligne exploitable");
  return bars.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function evaluerDisjoncteur(bars, actifAvant = false, cfg = DISJ) {
  if (bars.length < cfg.maLength + cfg.confirm) {
    throw new Error(`Disjoncteur: ${cfg.maLength + cfg.confirm} jours requis, ${bars.length} reçus`);
  }
  const v = bars.map((b) => b.close);
  const ma = sma(v, cfg.maLength);
  let actif = actifAvant, cnt = 0, dernier = null;

  for (let i = 0; i < v.length; i++) {
    if (ma[i] === null) continue;
    const ratio = v[i] / ma[i];
    if (!actif) {
      if (ratio > cfg.seuilHaut) { cnt++; if (cnt >= cfg.confirm) { actif = true; cnt = 0; } }
      else cnt = 0;
    } else if (ratio < cfg.seuilBas) {
      actif = false; cnt = 0;
    }
    dernier = { date: bars[i].date, valeur: v[i], ma: ma[i], ratio };
  }
  return { actif, dernier };
}

async function fetchFred() {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${FRED_SERIE}`;
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; plan-signal/1.0)" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const bars = parseFred(await r.text());
      console.log(`  ${FRED_SERIE}: ${bars.length} jours, dernier ${bars.at(-1).date} @ ${bars.at(-1).close}`);
      return bars;
    } catch (e) {
      console.warn(`  FRED essai ${i}/3: ${e.message}`);
      if (i < 3) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  return null;
}

async function fetchPrices(prevPrices = {}) {
  const out = {};
  for (const t of TITRES) {
    try {
      const bars = await fetchSymbol(t, 2);
      const newPrice = Math.round(bars.at(-1).close * 100) / 100;
      if (validatePrice(t, newPrice, prevPrices[t])) {
        out[t] = newPrice;
      } else {
        console.warn(`  prix ${t}: VALIDATION ÉCHOUÉE — ancien prix conservé`);
        if (prevPrices[t]) out[t] = prevPrices[t];
      }
    } catch (e) {
      console.warn(`  prix ${t}: ÉCHEC (${e.message}) — ancien prix conservé`);
    }
  }
  return out;
}

async function main() {
  console.log(`Abundance 2.0 — régime ${CFG.risk}/${CFG.hedge}, patron ${CFG.maLongue} jours, confirmation ${CFG.confirmDays} fermetures\n`);

  const [risk, hedge] = await Promise.all([fetchSymbol(CFG.risk), fetchSymbol(CFG.hedge)]);
  const sig = computeRegime(risk, hedge);

  const today = new Date().toISOString().slice(0, 10);
  const ageDays = Math.floor((Date.now() - new Date(sig.dernier.date + "T00:00:00Z").getTime()) / 86400000);
  if (ageDays > 7) throw new Error(`Données vieilles de ${ageDays} jours — refus d'écrire.`);

  console.log("\nDisjoncteur de crédit :");
  const oas = await fetchFred();

  let prev = {};
  if (existsSync(STATE_PATH)) {
    try { prev = JSON.parse(readFileSync(STATE_PATH, "utf8")); } catch {}
  }
  const prevLu = prev;

  console.log("\nPrix de clôture :");
  const prixNeufs = await fetchPrices(prev.prix ?? {});

  // Le disjoncteur est l'exception à la discipline hebdomadaire : il peut se
  // déclencher n'importe quel jour, car il ne peut QU'aller vers la sécurité.
  let disj = { actif: false, ratio: null, date: "", indisponible: true };
  if (oas) {
    try {
      const prevActif = (prevLu.disjoncteur && prevLu.disjoncteur.actif) === true;
      const d = evaluerDisjoncteur(oas, prevActif);
      disj = {
        actif: d.actif,
        ratio: Math.round(d.dernier.ratio * 100) / 100,
        date: d.dernier.date,
        indisponible: false,
      };
      console.log(`  écart/moyenne200 = ${disj.ratio}x  ->  ${d.actif ? "DÉCLENCHÉ" : "normal"}`);
    } catch (e) {
      console.warn(`  disjoncteur non évalué: ${e.message}`);
    }
  } else {
    console.warn("  FRED indisponible — disjoncteur inactif ce tour, ancien état conservé");
    if (prevLu.disjoncteur) disj = { ...prevLu.disjoncteur, indisponible: true };
  }

  // Les prix se rafraîchissent chaque jour, mais le régime ne change que le
  // jour du signal (samedi). Le 200 jours bouge lentement : pas de va-et-vient.
  const jourSignal = process.env.JOUR_SIGNAL === "1";
  let regimeEffectif = jourSignal ? sig.state : (prev.regime ?? sig.state);
  if (disj.actif) regimeEffectif = "OFF";   // le disjoncteur prime sur tout
  const changed = prev.regime !== regimeEffectif;
  if (!jourSignal && prev.regime && prev.regime !== sig.state) {
    console.log(`  (régime calculé ${sig.state} mais on garde ${prev.regime} — changement le samedi seulement)`);
  }
  const lastFlip = sig.flips.at(-1);

  const next = {
    regime: regimeEffectif,
    // Une fois vrai, reste vrai tant qu'un humain ne l'a pas remis à false.
    actionRequise: changed ? true : prev.actionRequise === true,
    changeLe: changed ? today : (prev.changeLe ?? lastFlip?.date ?? today),
    verifieLe: today,
    note: prev.note ?? "",
    // Fusion : un symbole en échec conserve son prix précédent plutôt que disparaître.
    prix: { ...(prev.prix ?? {}), ...prixNeufs },
    prixDate: Object.keys(prixNeufs).length ? sig.dernier.date : (prev.prixDate ?? ""),
    signal: sig.dernier,
    disjoncteur: disj,
  };

  console.log(`\n  Régime      : ${regimeEffectif}${changed ? `  (CHANGÉ depuis ${prev.regime ?? "aucun"})` : ""}`);
  console.log(`  SMH vs 200j : ${sig.dernier.smhVs200Pct >= 0 ? "+" : ""}${sig.dernier.smhVs200Pct.toFixed(2)}%`);
  console.log(`  SMH vs 50j  : ${sig.dernier.smhVs50Pct >= 0 ? "+" : ""}${sig.dernier.smhVs50Pct.toFixed(2)}%`);
  console.log(`  SMH/GLDM vs 200j : ${sig.dernier.ratioVs200Pct >= 0 ? "+" : ""}${sig.dernier.ratioVs200Pct.toFixed(2)}%`);
  console.log(`  En attente  : ${sig.pending ? `${sig.pending.count}/${CFG.confirmDays} vers ${sig.pending.state}` : "aucun"}`);
  console.log(`  Basculements : ${sig.flips.length}`);
  console.log(`  Action requise : ${next.actionRequise}`);
  console.log(`  Disjoncteur  : ${disj.actif ? "ACTIF — RISK OFF forcé" : (disj.indisponible ? "données indisponibles" : "normal")}`);
  console.log(`  Prix obtenus : ${Object.keys(prixNeufs).length} / ${TITRES.length}`);

  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + "\n");
  console.log(`\nÉcrit ${STATE_PATH}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch((e) => { console.error(`\nÉCHEC: ${e.message}`); process.exit(1); });
}
