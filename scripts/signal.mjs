#!/usr/bin/env node
/**
 * Fetches daily closes from Yahoo Finance, computes the X/Y signal, and
 * rewrites state.json. Runs in GitHub Actions — server-side, so no CORS.
 *
 * Node 20+ (global fetch). No dependencies.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CFG = {
  risk: "SMH",
  hedge: "GLD",
  maLength: 200,
  bandUp: 0.05,
  bandDown: 0.05,
  confirmDays: 3,
  useAbsoluteFilter: true,
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
  // adjclose is split- and dividend-adjusted. Unadjusted closes corrupt a
  // moving average across a split and can manufacture a false flip.
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
      console.log(`  ${symbol}: ${bars.length} bars, latest ${bars.at(-1).date} @ ${bars.at(-1).close.toFixed(2)}`);
      return bars;
    } catch (e) {
      lastErr = e;
      console.warn(`  ${symbol} attempt ${i}/${tries} failed: ${e.message}`);
      if (i < tries) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw new Error(`${symbol}: ${lastErr.message}`);
}

/* ---------------------------------------------------------------- signal */

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

export function computeSignal(riskBars, hedgeBars, cfg = CFG) {
  const j = alignSeries(riskBars, hedgeBars);
  if (j.length < cfg.maLength + cfg.confirmDays) {
    throw new Error(`Need ${cfg.maLength + cfg.confirmDays} overlapping sessions, got ${j.length}`);
  }
  const ratios = j.map((p) => p.a / p.b);
  const rMa = sma(ratios, cfg.maLength);
  const riskCloses = j.map((p) => p.a);
  const kMa = sma(riskCloses, cfg.maLength);

  let state = "Y", pend = null, cnt = 0;
  const flips = [];
  let last = null;

  for (let i = 0; i < j.length; i++) {
    const ma = rMa[i];
    if (ma === null) continue;
    const ratio = ratios[i];
    const above = !cfg.useAbsoluteFilter || (kMa[i] !== null && riskCloses[i] > kMa[i]);

    let want;
    if (ratio > ma * (1 + cfg.bandUp) && above) want = "X";
    else if (ratio < ma * (1 - cfg.bandDown) || !above) want = "Y";
    else want = state;

    if (want !== state) {
      if (pend === want) cnt++; else { pend = want; cnt = 1; }
      if (cnt >= cfg.confirmDays) {
        flips.push({ date: j[i].date, from: state, to: want });
        state = want; pend = null; cnt = 0;
      }
    } else { pend = null; cnt = 0; }

    last = {
      date: j[i].date,
      distancePct: (ratio / ma - 1) * 100,
      riskAboveOwnMa: above,
    };
  }
  return { state, latest: last, flips, pending: pend ? { state: pend, count: cnt } : null, sessions: j.length };
}

/* ------------------------------------------------------------------ main */

const TITRES = ["VT","GLDM","MCHI","SMH","IBIT","SGOV","AIPO","BCI"];

/**
 * Valide qu'un nouveau prix est raisonnable comparé au prix précédent.
 * Rejette les variations de plus de 50 % en une journée (probablement une
 * erreur de données) et prévient au-delà de 20 %.
 */
function validatePrice(symbol, newPrice, prevPrice) {
  if (!prevPrice || prevPrice <= 0) return true; // Aucun prix précédent à comparer

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
 * ICE BofA US High Yield OAS, via FRED. Daily, free, no API key.
 * Fires when the spread exceeds its own 200-day average by 50% for 2 closes.
 * Resets below 1.20x. It can ONLY force Y — it can never push toward risk.
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

      // Valide le prix contre la valeur précédente
      if (validatePrice(t, newPrice, prevPrices[t])) {
        out[t] = newPrice;
      } else {
        console.warn(`  prix ${t}: VALIDATION ÉCHOUÉE — ancien prix conservé`);
        // Conserve l'ancien prix si la validation échoue
        if (prevPrices[t]) {
          out[t] = prevPrices[t];
        }
      }
    } catch (e) {
      console.warn(`  prix ${t}: ECHEC (${e.message}) — ancien prix conserve`);
    }
  }
  return out;
}

async function main() {
  console.log(`Signal: ${CFG.risk}/${CFG.hedge}, ${CFG.maLength}-DMA, band ±${CFG.bandUp * 100}%, ${CFG.confirmDays}-close confirm\n`);

  const [risk, hedge] = await Promise.all([fetchSymbol(CFG.risk), fetchSymbol(CFG.hedge)]);
  const sig = computeSignal(risk, hedge);

  const today = new Date().toISOString().slice(0, 10);
  const ageDays = Math.floor((Date.now() - new Date(sig.latest.date + "T00:00:00Z").getTime()) / 86400000);
  if (ageDays > 7) throw new Error(`Price data is ${ageDays} days old — refusing to update state.`);

  console.log("\nDisjoncteur de credit :");
  const oas = await fetchFred();

  let prev = {};
  if (existsSync(STATE_PATH)) {
    try { prev = JSON.parse(readFileSync(STATE_PATH, "utf8")); } catch {}
  }
  const prevLu = prev;

  console.log("\nPrix de cloture :");
  const prixNeufs = await fetchPrices(prev.prix ?? {});

  // The breaker is the one exception to Friday-only: it may fire any day,
  // because it can ONLY move toward safety. It can never force X.
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
      console.log(`  ecart/moyenne200 = ${disj.ratio}x  ->  ${d.actif ? "DECLENCHE" : "normal"}`);
    } catch (e) {
      console.warn(`  disjoncteur non evalue: ${e.message}`);
    }
  } else {
    console.warn("  FRED indisponible — disjoncteur inactif ce tour, ancien etat conserve");
    if (prevLu.disjoncteur) disj = { ...prevLu.disjoncteur, indisponible: true };
  }

  // Prices refresh every day, but the setting may only move on the weekly run.
  // This preserves the Friday-only discipline: no mid-week flip can appear.
  const jourSignal = process.env.JOUR_SIGNAL === "1";
  let reglageEffectif = jourSignal ? sig.state : (prev.reglage ?? sig.state);
  if (disj.actif) reglageEffectif = "Y";   // le disjoncteur prime sur tout
  const changed = prev.reglage !== reglageEffectif;
  if (!jourSignal && prev.reglage && prev.reglage !== sig.state) {
    console.log(`  (signal calcule ${sig.state} mais on garde ${prev.reglage} — changement le samedi seulement)`);
  }
  const lastFlip = sig.flips.at(-1);

  const next = {
    reglage: reglageEffectif,
    // Once true, stays true until a human clears it — trades must be confirmed done.
    actionRequise: changed ? true : prev.actionRequise === true,
    changeLe: changed ? today : (prev.changeLe ?? lastFlip?.date ?? today),
    verifieLe: today,
    note: prev.note ?? "",
    // The tactical sleeve is manual only. The bot must never open or close it.
    tactique: prev.tactique ?? {
      active: false, titre: "SH", pourcentage: 5, ouvertLe: "", raison: "",
    },
    // Merge: a failed symbol keeps its previous price rather than vanishing.
    prix: { ...(prev.prix ?? {}), ...prixNeufs },
    prixDate: Object.keys(prixNeufs).length ? sig.latest.date : (prev.prixDate ?? ""),
    disjoncteur: disj,
  };

  console.log(`\n  Setting        : ${sig.state}${changed ? `  (CHANGED from ${prev.setting ?? "none"})` : ""}`);
  console.log(`  Distance to MA : ${sig.latest.distancePct >= 0 ? "+" : ""}${sig.latest.distancePct.toFixed(2)}%`);
  console.log(`  ${CFG.risk} vs own MA : ${sig.latest.riskAboveOwnMa ? "above" : "BELOW (forces Y)"}`);
  console.log(`  Pending        : ${sig.pending ? `${sig.pending.count}/${CFG.confirmDays} toward ${sig.pending.state}` : "none"}`);
  console.log(`  Flips in 2y    : ${sig.flips.length}`);
  console.log(`  Action requise : ${next.actionRequise}`);
  console.log(`  Disjoncteur    : ${disj.actif ? "ACTIF — Reglage Y force" : (disj.indisponible ? "donnees indisponibles" : "normal")}`);
  console.log(`  Prix obtenus   : ${Object.keys(prixNeufs).length} / ${TITRES.length}`);
  console.log(`  Tactique       : ${next.tactique.active ? next.tactique.titre + " " + next.tactique.pourcentage + "%" : "aucune"}`);

  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + "\n");
  console.log(`\nWrote ${STATE_PATH}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
}
