#!/usr/bin/env node
/**
 * Abundance 4.5 — calcul du régime (« système d'exploitation du portefeuille »).
 *
 * Architecture révisée :
 *   - VT est le PATRON du régime : VT > 200 jours ET momentum 50 jours -> RISK ON ;
 *     VT < 200 jours -> RISK OFF ; près de la ligne 200 ou momentum perdu -> NEUTRAL.
 *   - SMH est le CADRAN SATELLITE : > 50 jours -> 100 % ; entre 50 et 200 jours -> 50 % ;
 *     < 200 jours -> 0 % du couple SMH/AIPO.
 *   - Disjoncteur de crédit : force le RISK OFF (il ne peut qu'aller vers la sécurité).
 *   - Disjoncteur de taux (4.5) : le 10 ans US au-dessus de 5,00 % plafonne le régime
 *     à NEUTRAL (lui aussi ne peut qu'aller vers la sécurité).
 *
 * La cible tactique EFFECTIVE (régime + satellite appliqué) est écrite dans state.json.
 * Le navigateur n'a qu'à comparer Réel -> Cible -> Écart -> Action (deadband ±5 pts).
 *
 * Node 20+ (global fetch). Aucune dépendance.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CFG = {
  regimeTitre: "VT",   // le patron (marché large)
  satellite: "SMH",    // le cadran (bêta élevée)
  maRegime: 200,       // le patron
  maMomentum: 50,      // confirmation / momentum
  bande200: 0.02,      // zone de respiration autour du 200 jours (2 %)
  confirmDays: 2,      // fermetures consécutives pour changer de régime
};

// Cibles tactiques de BASE par régime (somme = 40 %, c.-à-d. la manche tactique).
const CIBLES_BASE = {
  ON:      { SGOV: 0,  VT: 10, SMH: 15, GLDM: 5,  BCI: 5, AIPO: 5 },
  NEUTRAL: { SGOV: 10, VT: 10, SMH: 5,  GLDM: 10, BCI: 5, AIPO: 0 },
  OFF:     { SGOV: 25, VT: 0,  SMH: 0,  GLDM: 10, BCI: 5, AIPO: 0 },
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

export function computeRegime(vtBars, cfg = CFG) {
  const closes = vtBars.map((b) => b.close);
  if (closes.length < cfg.maRegime + 1) {
    throw new Error(`Besoin de ${cfg.maRegime + 1} séances pour ${cfg.regimeTitre}, ${closes.length} reçues`);
  }
  const ma200 = sma(closes, cfg.maRegime);
  const ma50 = sma(closes, cfg.maMomentum);

  let state = "NEUTRAL", pend = null, cnt = 0;
  const flips = [];
  let dernier = null;

  for (let i = 0; i < closes.length; i++) {
    if (ma200[i] === null) continue;
    const rel200 = closes[i] / ma200[i] - 1;
    const momentum = ma50[i] !== null && closes[i] > ma50[i];
    let want;
    if (rel200 <= 0) want = "OFF";                       // en dessous du 200 jours
    else if (rel200 < cfg.bande200) want = "NEUTRAL";    // juste autour de la ligne
    else if (!momentum) want = "NEUTRAL";                // au-dessus mais momentum perdu
    else want = "ON";

    if (want !== state) {
      if (pend === want) cnt++; else { pend = want; cnt = 1; }
      if (cnt >= cfg.confirmDays) {
        flips.push({ date: vtBars[i].date, from: state, to: want });
        state = want; pend = null; cnt = 0;
      }
    } else { pend = null; cnt = 0; }

    dernier = {
      date: vtBars[i].date,
      vtClose: Math.round(closes[i] * 100) / 100,
      vtMa200: Math.round(ma200[i] * 100) / 100,
      vtMa50: ma50[i] !== null ? Math.round(ma50[i] * 100) / 100 : null,
      vtVs200Pct: Math.round(rel200 * 1000) / 10,
      vtVs50Pct: ma50[i] !== null ? Math.round((closes[i] / ma50[i] - 1) * 1000) / 10 : null,
    };
  }
  return { state, dernier, flips, pending: pend ? { state: pend, count: cnt } : null, sessions: closes.length };
}

/** Cadran satellite : quel pourcentage du couple SMH/AIPO garder ? */
export function facteurSatellite(smhBars, cfg = CFG) {
  const closes = smhBars.map((b) => b.close);
  if (closes.length < cfg.maRegime) {
    throw new Error(`Besoin de ${cfg.maRegime} séances pour ${cfg.satellite}, ${closes.length} reçues`);
  }
  const ma200 = sma(closes, cfg.maRegime);
  const ma50 = sma(closes, cfg.maMomentum);
  const i = closes.length - 1;
  const c = closes[i], m200 = ma200[i], m50 = ma50[i];

  let f;
  if (m50 !== null && c > m50) f = 1;
  else if (m200 !== null && c > m200) f = 0.5;
  else f = 0;

  return {
    facteur: f,
    smhClose: Math.round(c * 100) / 100,
    smhMa200: m200 !== null ? Math.round(m200 * 100) / 100 : null,
    smhMa50: m50 !== null ? Math.round(m50 * 100) / 100 : null,
    smhVs200Pct: m200 ? Math.round((c / m200 - 1) * 1000) / 10 : null,
    smhVs50Pct: m50 ? Math.round((c / m50 - 1) * 1000) / 10 : null,
  };
}

/** Applique le cadran satellite à la cible de base : le reste va en SGOV. */
export function appliquerSatellite(base, sat) {
  const f = sat.facteur;
  const smh = base.SMH ?? 0, aipo = base.AIPO ?? 0;
  const libre = (smh + aipo) * (1 - f);
  const arr = (x) => Math.round(x * 10) / 10;
  return {
    SGOV: arr((base.SGOV ?? 0) + libre),
    VT: base.VT ?? 0,
    SMH: arr(smh * f),
    GLDM: base.GLDM ?? 0,
    BCI: base.BCI ?? 0,
    AIPO: arr(aipo * f),
  };
}

/* ------------------------------------------------------------------ main */

// 4.5 : MCHI retiré du permanent (ses 7,5 points sont passés à GLDM) — on ne suit
// plus son prix. Seuls les titres de cette liste sont conservés dans state.json.
const TITRES = ["VT","GLDM","SMH","IBIT","SGOV","AIPO","BCI"];

/**
 * Valide qu'un nouveau prix est raisonnable comparé au prix précédent.
 * Rejette les variations de plus de 50 % en une journée et prévient au-delà de 20 %.
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
 * fermetures. Se réarme sous 1,20x. Il ne peut QUE mettre à l'abri.
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

/* ============================ DISJONCTEUR DE TAUX ==============================
 * Taux 10 ans américain (DGS10, via FRED). Ajout 4.5 : en régime de dominance
 * budgétaire, l'accident signature est une crise de prime de terme — souvent
 * pendant que les actions sont encore au-dessus de leur 200 jours, là où le
 * patron VT est aveugle. Au-dessus de 5,00 % pendant 2 fermetures -> le régime
 * ne peut plus être ON (plafond NEUTRAL). Réarmement sous 4,75 %.
 * Il ne peut QUE mettre à l'abri.
 */
const FRED_SERIE_TAUX = "DGS10";
const DISJ_TAUX = { seuilHaut: 5.0, seuilBas: 4.75, confirm: 2 };

export function evaluerDisjoncteurTaux(bars, actifAvant = false, cfg = DISJ_TAUX) {
  if (bars.length < cfg.confirm + 1) {
    throw new Error(`Disjoncteur de taux: ${cfg.confirm + 1} jours requis, ${bars.length} reçus`);
  }
  let actif = actifAvant, cnt = 0, dernier = null;

  for (const b of bars) {
    if (!actif) {
      if (b.close > cfg.seuilHaut) { cnt++; if (cnt >= cfg.confirm) { actif = true; cnt = 0; } }
      else cnt = 0;
    } else if (b.close < cfg.seuilBas) {
      actif = false; cnt = 0;
    }
    dernier = { date: b.date, taux: b.close };
  }
  return { actif, dernier };
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

async function fetchFred(serie = FRED_SERIE) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${serie}`;
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; plan-signal/1.0)" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const bars = parseFred(await r.text());
      console.log(`  ${serie}: ${bars.length} jours, dernier ${bars.at(-1).date} @ ${bars.at(-1).close}`);
      return bars;
    } catch (e) {
      console.warn(`  ${serie} essai ${i}/3: ${e.message}`);
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
  console.log(`Abundance 4.5 — régime ${CFG.regimeTitre} (patron ${CFG.maRegime}j), satellite ${CFG.satellite}, confirmation ${CFG.confirmDays} fermetures\n`);

  const [vt, smh] = await Promise.all([fetchSymbol(CFG.regimeTitre), fetchSymbol(CFG.satellite)]);
  const sig = computeRegime(vt);
  const sat = facteurSatellite(smh);

  const today = new Date().toISOString().slice(0, 10);
  const ageDays = Math.floor((Date.now() - new Date(sig.dernier.date + "T00:00:00Z").getTime()) / 86400000);
  if (ageDays > 7) throw new Error(`Données vieilles de ${ageDays} jours — refus d'écrire.`);

  console.log("\nDisjoncteurs (crédit et taux) :");
  const [oas, dgs] = await Promise.all([fetchFred(FRED_SERIE), fetchFred(FRED_SERIE_TAUX)]);

  let prev = {};
  if (existsSync(STATE_PATH)) {
    try { prev = JSON.parse(readFileSync(STATE_PATH, "utf8")); } catch {}
  }
  const prevLu = prev;

  console.log("\nPrix de clôture :");
  const prixNeufs = await fetchPrices(prev.prix ?? {});

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

  let disjTaux = { actif: false, taux: null, date: "", indisponible: true };
  if (dgs) {
    try {
      const prevActifT = (prevLu.disjoncteurTaux && prevLu.disjoncteurTaux.actif) === true;
      const t = evaluerDisjoncteurTaux(dgs, prevActifT);
      disjTaux = {
        actif: t.actif,
        taux: Math.round(t.dernier.taux * 100) / 100,
        date: t.dernier.date,
        indisponible: false,
      };
      console.log(`  10 ans US = ${disjTaux.taux} %  ->  ${t.actif ? "DÉCLENCHÉ (plafond NEUTRAL)" : "normal"}`);
    } catch (e) {
      console.warn(`  disjoncteur de taux non évalué: ${e.message}`);
    }
  } else {
    console.warn("  DGS10 indisponible — disjoncteur de taux inactif ce tour, ancien état conservé");
    if (prevLu.disjoncteurTaux) disjTaux = { ...prevLu.disjoncteurTaux, indisponible: true };
  }

  // Les prix se rafraîchissent chaque jour, mais régime et satellite ne changent
  // que le jour du signal (samedi). Le 200 jours bouge lentement : pas de va-et-vient.
  const jourSignal = process.env.JOUR_SIGNAL === "1";
  let regimeEffectif = jourSignal ? sig.state : (prev.regime ?? sig.state);
  let satEffectif = jourSignal ? sat : (prev.satellite ?? sat);
  if (disjTaux.actif && regimeEffectif === "ON") regimeEffectif = "NEUTRAL";  // plafond taux
  if (disj.actif) regimeEffectif = "OFF";   // le disjoncteur de crédit prime sur tout

  const regimeChanged = prev.regime !== regimeEffectif;
  const satChanged = prev.satellite && prev.satellite.facteur !== satEffectif.facteur;
  const changed = regimeChanged || satChanged;
  if (!jourSignal && prev.regime && prev.regime !== sig.state) {
    console.log(`  (régime calculé ${sig.state} mais on garde ${prev.regime} — changement le samedi seulement)`);
  }
  const lastFlip = sig.flips.at(-1);

  const tactiqueCible = appliquerSatellite(CIBLES_BASE[regimeEffectif], satEffectif);

  const next = {
    regime: regimeEffectif,
    // Une fois vrai, reste vrai tant qu'un humain ne l'a pas remis à false.
    actionRequise: changed ? true : prev.actionRequise === true,
    changeLe: changed ? today : (prev.changeLe ?? lastFlip?.date ?? today),
    verifieLe: today,
    note: prev.note ?? "",
    // Fusion : un symbole en échec conserve son prix précédent plutôt que disparaître.
    // On ne garde que les titres suivis (TITRES) — les anciens (ex. MCHI) disparaissent.
    prix: Object.fromEntries(
      Object.entries({ ...(prev.prix ?? {}), ...prixNeufs }).filter(([k]) => TITRES.includes(k))
    ),
    prixDate: Object.keys(prixNeufs).length ? sig.dernier.date : (prev.prixDate ?? ""),
    regimeSignal: sig.dernier,
    satellite: satEffectif,
    cibles: CIBLES_BASE,
    tactiqueCible,
    disjoncteur: disj,
    disjoncteurTaux: disjTaux,
  };

  console.log(`\n  Régime      : ${regimeEffectif}${regimeChanged ? `  (CHANGÉ depuis ${prev.regime ?? "aucun"})` : ""}`);
  console.log(`  VT vs 200j  : ${sig.dernier.vtVs200Pct >= 0 ? "+" : ""}${sig.dernier.vtVs200Pct.toFixed(2)}%`);
  console.log(`  VT vs 50j   : ${sig.dernier.vtVs50Pct >= 0 ? "+" : ""}${sig.dernier.vtVs50Pct.toFixed(2)}%`);
  console.log(`  Satellite   : ${satEffectif.facteur * 100}% (SMH vs 50j ${satEffectif.smhVs50Pct >= 0 ? "+" : ""}${satEffectif.smhVs50Pct.toFixed(2)}%)${satChanged ? "  (CHANGÉ)" : ""}`);
  console.log(`  Cible tactique effective : ${Object.entries(tactiqueCible).map(([t, v]) => `${t} ${v}%`).join(" · ")}`);
  console.log(`  En attente  : ${sig.pending ? `${sig.pending.count}/${CFG.confirmDays} vers ${sig.pending.state}` : "aucun"}`);
  console.log(`  Basculements : ${sig.flips.length}`);
  console.log(`  Action requise : ${next.actionRequise}`);
  console.log(`  Disjoncteur  : ${disj.actif ? "ACTIF — RISK OFF forcé" : (disj.indisponible ? "données indisponibles" : "normal")}`);
  const msgTaux = disjTaux.actif
    ? "ACTIF — plafond NEUTRAL (10 ans " + disjTaux.taux + " %)"
    : (disjTaux.indisponible ? "données indisponibles" : "normal (10 ans " + disjTaux.taux + " %)");
  console.log("  Disj. taux   : " + msgTaux);
  console.log(`  Prix obtenus : ${Object.keys(prixNeufs).length} / ${TITRES.length}`);

  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + "\n");
  console.log(`\nÉcrit ${STATE_PATH}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch((e) => { console.error(`\nÉCHEC: ${e.message}`); process.exit(1); });
}
