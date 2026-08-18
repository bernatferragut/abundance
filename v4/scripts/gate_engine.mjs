#!/usr/bin/env node
/**
 * Abundance 4.0 (P3) — moteur de signal « gate_engine ».
 *
 * Le rulebook P3 décrit le moteur en Python (gate_engine.py) tournant sur le cluster
 * local de Mac mini. Ce fichier en est un port Node SANS dépendance (Node 20+,
 * global fetch) qui tourne dans GitHub Actions, pour publier v4/state.json que la
 * page lira. La séquence de décision reproduit fidèlement le rulebook §3.
 *
 * Séquence (évaluation hebdomadaire, clôture du vendredi) :
 *   A. GATE MACRO — ROC 4 semaines de (Cuivre/Or) et (HYG/IEF) -> Macro_Score 0..30
 *   B. BIAS — Hull Moving Average (HMA) hebdomadaire sur VT : pente hausse/baisse
 *      -> +10 / -10
 *   C. TRIGGER — Volume Profile hebdomadaire : VPOC / VAL -> +15 / 0 / -15
 *   D. AJUSTEMENTS — VIX (-15 / 0 / +5) et courbe 10Y-3M (-10 / 0 / +5)
 *
 *   Score composite (brut) -> normalisé 0..100 :
 *       brut = macro + hull + vpoc + vix + courbe  (min -50, max +65)
 *       score = (brut + 50) / 115 * 100
 *
 *   Machine d'état :
 *       score >= 70           -> BULL
 *       40 <= score < 70      -> NEUTRAL (POC)
 *       score < 40            -> BEARISH
 *
 *   Disjoncteur ATR (14 j annualisé sur VT) :
 *       ATR% > 25 -> force NEUTRAL ; ATR% > 40 -> force BEARISH.
 *       Il s'applique immédiatement (pas besoin d'attendre le jour du signal).
 *
 *   Réinitialisation annuelle : le 1er janvier -> NEUTRAL obligatoire.
 *
 *   Repli (rulebook §7.5) : données VPOC/VAL corrompues ou manquantes -> NEUTRAL
 *   et alerte (fallback=true).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const STATE_PATH = new URL("../state.json", import.meta.url).pathname;

const CFG = {
  hmaPeriod: 26,        // semaines pour la HMA
  hmaSlopeBars: 4,      // pente comparée sur 4 semaines
  vpocBuckets: 60,      // nombre de paliers de prix du Volume Profile
  vpocValueArea: 0.7,   // 70 % de la « value area »
  macroRocBars: 20,     // ~4 semaines de séances (ROC)
  atrPeriod: 14,        // jours pour le disjoncteur ATR
  seuils: { bull: 70, bear: 40 },
  atrForceNeutral: 25,  // % annualisé
  atrForceBearish: 40,  // % annualisé
};

// Tickers du portefeuille (prix pour la page) — ordre d'affichage.
const TITRES = ["VT", "GLDM", "IBIT", "MCHI", "SMH", "AIPO", "BCI", "SGOV"];

// ---- Architecture finale deux comptes (conforme CRA) ----
// TFSA (60 %) : le cœur PERMANENT — achat seulement, jamais vendre, max 4 transactions/an.
const CORE_TFSA = { VT: 40, GLDM: 27.5, IBIT: 15, MCHI: 7.5, SMH: 10 };
const BANDES_TFSA = {           // % de la partie TFSA — vérifiées au trimestre
  VT: [35, 45], GLDM: [22.5, 32.5], IBIT: [10, 20], MCHI: [5, 10], SMH: [7.5, 12.5],
};
// REER/RRSP (40 %) : la manche TACTIQUE — moteur P3, matrices par régime (100 % de la manche).
// BSOL et SPCX sont exclus (liquidité d'ETF pure, zéro SpaceX).
const CIBLES = {
  BULL:     { VT: 35, GLDM: 25, SMH: 15, BCI: 10, AIPO: 15, SGOV: 0  },
  NEUTRAL:  { VT: 30, GLDM: 20, SMH: 10, BCI: 10, AIPO: 15, SGOV: 15 },
  BEARISH:  { VT: 15, GLDM: 30, SMH: 0,  BCI: 15, AIPO: 0,  SGOV: 40 },
};

/* ---------------------------------------------------------------- utilitaires */

const arr2 = (x) => Math.round(x * 100) / 100;
const arr1 = (x) => Math.round(x * 10) / 10;

function parseYahoo(json) {
  const res = json?.chart?.result?.[0];
  if (!res) throw new Error(json?.chart?.error?.description ?? "aucune donnée");
  const ts = res.timestamp ?? [];
  const q = res.indicators?.quote?.[0] ?? {};
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const volume = q.volume?.[i];
    if (typeof close === "number" && isFinite(close) && close > 0) {
      bars.push({
        date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
        open: typeof open === "number" && isFinite(open) ? open : close,
        high: typeof high === "number" && isFinite(high) ? high : close,
        low: typeof low === "number" && isFinite(low) ? low : close,
        close,
        volume: typeof volume === "number" && isFinite(volume) ? volume : 0,
      });
    }
  }
  if (!bars.length) throw new Error("aucune barre exploitable");
  return bars.sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function fetchBars(symbol, range, interval, tries = 3) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${range}&interval=${interval}&events=div%2Csplit`;
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; abundance4/1.0)", Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const bars = parseYahoo(await r.json());
      console.log(`  ${symbol}: ${bars.length} barres, dernière ${bars.at(-1).date} @ ${bars.at(-1).close}`);
      return bars;
    } catch (e) {
      lastErr = e;
      console.warn(`  ${symbol} essai ${i}/${tries} échoué: ${e.message}`);
      if (i < tries) await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw new Error(`${symbol}: ${lastErr.message}`);
}

/* ------------------------------------------------------------------- indicateurs */

function sma(v, n) {
  const out = new Array(v.length).fill(null);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= n) s -= v[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

function wma(v, n) {
  const out = new Array(v.length).fill(null);
  const totalW = (n * (n + 1)) / 2;
  for (let i = n - 1; i < v.length; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += v[i - j] * (n - j);
    out[i] = s / totalW;
  }
  return out;
}

/** Hull Moving Average — HMA(n) = WMA(2*WMA(n/2) − WMA(n), √n) */
function hma(v, n) {
  const half = wma(v, Math.max(1, Math.floor(n / 2)));
  const full = wma(v, n);
  const sqrtN = Math.max(1, Math.round(Math.sqrt(n)));
  const diff = v.map((_, i) => {
    if (half[i] === null || full[i] === null) return null;
    return 2 * half[i] - full[i];
  });
  const h = wma(diff.map((x) => x ?? 0), sqrtN);
  // Les premiers points de `diff` sont null -> invalide jusqu'à n-1 + sqrtN - 1.
  const start = n - 1 + sqrtN - 1;
  for (let i = 0; i < Math.min(start, h.length); i++) h[i] = null;
  return h;
}

/** ATR (Wilder) sur barres quotidiennes. */
function atrWilder(bars, n) {
  const tr = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { tr.push(bars[i].high - bars[i].low); continue; }
    const pc = bars[i - 1].close;
    tr.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - pc), Math.abs(bars[i].low - pc)));
  }
  let a = tr.slice(0, n).reduce((s, x) => s + x, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}

/** Agrège des barres quotidiennes en barres hebdomadaires (semaine ISO, lundi). */
function isoWeekKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function toWeekly(daily) {
  const weeks = [];
  let cur = null;
  for (const b of daily) {
    const key = isoWeekKey(b.date);
    if (!cur || cur.key !== key) {
      cur = { key, date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume };
      weeks.push(cur);
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  return weeks;
}

/** Volume Profile approximé à partir des barres hebdomadaires (volume réparti sur high-low). */
function volumeProfile(bars, buckets, valueAreaPct) {
  const minP = Math.min(...bars.map((b) => b.low));
  const maxP = Math.max(...bars.map((b) => b.high));
  const span = maxP - minP;
  if (!(span > 0)) throw new Error("plage de prix nulle pour le Volume Profile");
  const step = span / buckets;
  const vols = new Array(buckets).fill(0);
  let total = 0;
  for (const b of bars) {
    const lo = Math.max(0, Math.floor((b.low - minP) / step));
    const hi = Math.min(buckets - 1, Math.floor((b.high - minP) / step));
    const v = b.volume || 0;
    const per = v / Math.max(1, hi - lo + 1);
    for (let k = lo; k <= hi; k++) { vols[k] += per; total += per; }
  }
  if (!(total > 0)) throw new Error("Volume Profile sans volume");

  let poc = 0;
  for (let k = 1; k < buckets; k++) if (vols[k] > vols[poc]) poc = k;
  const vpocPrice = minP + (poc + 0.5) * step;

  // Value Area : 70 % du volume autour du POC.
  let acc = vols[poc], lo = poc, hi = poc;
  const target = total * valueAreaPct;
  while (acc < target && (lo > 0 || hi < buckets - 1)) {
    const below = lo > 0 ? vols[lo - 1] : -1;
    const above = hi < buckets - 1 ? vols[hi + 1] : -1;
    if (below >= above) { lo--; acc += below; }
    else { hi++; acc += above; }
  }
  const val = minP + lo * step;
  const vah = minP + (hi + 1) * step;
  return { vpoc: vpocPrice, val, vah, min: minP, max: maxP };
}

/** ROC sur `n` séances (≈ 4 semaines) — en %. */
function roc4(bars, n) {
  const closes = bars.map((b) => b.close);
  const now = closes.at(-1);
  const prev = closes[closes.length - 1 - n];
  if (!now || !prev) throw new Error("pas assez de barres pour le ROC");
  return ((now - prev) / prev) * 100;
}

/* ------------------------------------------------------------------ états & score */

function normalizeScore(raw) {
  // brut ∈ [-50, +65]  ->  0..100
  return Math.round(((raw + 50) / (115)) * 100);
}

function etatDepuisScore(score) {
  if (score >= CFG.seuils.bull) return "BULL";
  if (score >= CFG.seuils.bear) return "NEUTRAL";
  return "BEARISH";
}

function overridesATR(atrPct) {
  if (atrPct > CFG.atrForceBearish) return "BEARISH";
  if (atrPct > CFG.atrForceNeutral) return "NEUTRAL";
  return null;
}

/* ------------------------------------------------------------------------ prix */

function validatePrice(symbol, newPrice, prevPrice) {
  if (!prevPrice || prevPrice <= 0) return true;
  const changePct = Math.abs((newPrice - prevPrice) / prevPrice);
  if (changePct > 0.5) {
    console.warn(`  ⚠ ${symbol}: REJETÉ — ${newPrice} vs ${prevPrice} (${(changePct * 100).toFixed(1)} %, seuil 50 %)`);
    return false;
  }
  if (changePct > 0.2) console.warn(`  ⚠ ${symbol}: forte variation — ${(changePct * 100).toFixed(1)} %`);
  return true;
}

async function fetchLatest(symbol, prevPrices, tries = 2) {
  try {
    const bars = await fetchBars(symbol, "5d", "1d", tries);
    const price = arr2(bars.at(-1).close);
    if (validatePrice(symbol, price, prevPrices[symbol])) return price;
    return prevPrices[symbol] ?? null;
  } catch (e) {
    console.warn(`  prix ${symbol}: ÉCHEC (${e.message}) — ancien prix conservé`);
    return prevPrices[symbol] ?? null;
  }
}

/* ----------------------------------------------------------------------- main */

async function main() {
  console.log(`Abundance 4.0 (P3) — gate_engine (HMA ${CFG.hmaPeriod}s, ATR ${CFG.atrPeriod}j)\n`);

  let prev = {};
  if (existsSync(STATE_PATH)) {
    try { prev = JSON.parse(readFileSync(STATE_PATH, "utf8")); } catch {}
  }
  const prevPrix = prev.prix ?? {};

  const jourSignal = process.env.JOUR_SIGNAL === "1";
  const aujourdHui = new Date();
  const estPremierJanvier = aujourdHui.getUTCMonth() === 0 && aujourdHui.getUTCDate() === 1;
  const today = aujourdHui.toISOString().slice(0, 10);

  /* ---- A. GATE MACRO (Cuivre/Or + HYG/IEF) ---------------------------------- */
  let macroScore = null, macro = null, macroErr = null;
  try {
    const [cuivre, or, hyg, ief] = await Promise.all([
      fetchBars("HG=F", "6mo", "1d", 2),
      fetchBars("GC=F", "6mo", "1d", 2),
      fetchBars("HYG", "6mo", "1d", 2),
      fetchBars("IEF", "6mo", "1d", 2),
    ]);
    const copperGold = arr4ratio(cuivre, or);
    const hygIef = arr4ratio(hyg, ief);
    const cuOrRoc = roc4(cuivre, CFG.macroRocBars) - roc4(or, CFG.macroRocBars);
    const hygIefRoc = roc4(hyg, CFG.macroRocBars) - roc4(ief, CFG.macroRocBars);
    // Normalisation : chaque ROC ∈ [-4 %, +4 %] -> 0..15 ; total 0..30.
    const clamp01 = (x) => Math.max(0, Math.min(1, (x + 4) / 8));
    const cuOrScore = clamp01(cuOrRoc) * 15;
    const hygIefScore = clamp01(hygIefRoc) * 15;
    macroScore = arr1(cuOrScore + hygIefScore);
    macro = {
      copperGold: arr3(copperGold),
      hygIef: arr3(hygIef),
      cuivreOrRoc4s: arr2(cuOrRoc),
      hygIefRoc4s: arr2(hygIefRoc),
      cuOrScore: arr1(cuOrScore),
      hygIefScore: arr1(hygIefScore),
    };
    console.log(`  Gate macro : Cu/Or ROC4s ${arr2(cuOrRoc)} % · HYG/IEF ROC4s ${arr2(hygIefRoc)} % -> Macro_Score ${macroScore}/30`);
  } catch (e) {
    macroErr = e.message;
    console.warn(`  Gate macro NON ÉVALUÉE: ${e.message}`);
  }

  /* ---- B + C : HMA et Volume Profile sur VT hebdo ---------------------------- */
  let hull = null, vpoc = null, atrPct = null, vt = null;
  try {
    const vtDaily = await fetchBars("VT", "2y", "1d", 3);
    vt = arr2(vtDaily.at(-1).close);
    const weekly = toWeekly(vtDaily);
    if (weekly.length < CFG.hmaPeriod + CFG.hmaSlopeBars + 5) {
      throw new Error(`besoin de ${CFG.hmaPeriod + CFG.hmaSlopeBars + 5} semaines de VT, ${weekly.length} reçues`);
    }

    const closes = weekly.map((b) => b.close);
    const h = hma(closes, CFG.hmaPeriod);
    const last = h.at(-1), before = h[h.length - 1 - CFG.hmaSlopeBars];
    const pente = last > before ? "hausse" : "baisse";
    const hullBias = pente === "hausse" ? 10 : -10;
    hull = { hma: arr2(last), hmaAvant4s: arr2(before), pente, hullBias };

    const prof = volumeProfile(weekly, CFG.vpocBuckets, CFG.vpocValueArea);
    const prix = vt;
    let position, vpocScore;
    if (prix > prof.vpoc) { position = "risqueON"; vpocScore = 15; }
    else if (prix < prof.val) { position = "risqueOFF"; vpocScore = -15; }
    else { position = "neutral"; vpocScore = 0; }
    vpoc = { vpoc: arr2(prof.vpoc), val: arr2(prof.val), vah: arr2(prof.vah), prix, position, vpocScore };

    const a = atrWilder(vtDaily, CFG.atrPeriod);
    atrPct = arr2((a / vtDaily.at(-1).close) * 100 * Math.sqrt(252));
    console.log(`  VT hebdo : HMA ${hull.hma} (${pente}) · VPOC ${vpoc.vpoc} / VAL ${vpoc.val} → ${position}`);
    console.log(`  ATR 14j annualisé : ${atrPct} %`);
  } catch (e) {
    console.warn(`  VT / HMA / VPOC NON ÉVALUÉS: ${e.message}`);
  }

  /* ---- D. VIX + courbe de taux ---------------------------------------------- */
  let vix = null, courbe = null;
  try {
    const v = await fetchBars("^VIX", "5d", "1d", 2);
    vix = arr2(v.at(-1).close);
  } catch (e) { console.warn(`  VIX indisponible: ${e.message}`); }
  try {
    const [t10, t3] = await Promise.all([
      fetchBars("^TNX", "5d", "1d", 2),
      fetchBars("^IRX", "5d", "1d", 2),
    ]);
    const dix = t10.at(-1).close, trois = t3.at(-1).close;
    courbe = { t10: arr2(dix), t3: arr2(trois), ecartPct: arr2(dix - trois) };
  } catch (e) { console.warn(`  Courbe de taux indisponible: ${e.message}`); }

  /* ---- Score composite -------------------------------------------------------- */
  const vixAdjust = vix === null ? 0 : vix < 18 ? 5 : vix > 25 ? -15 : 0;
  const yieldAdjust = courbe === null ? 0 : courbe.ecartPct > 0.5 ? 5 : courbe.ecartPct < -0.5 ? -10 : 0;

  const brut =
    (macroScore ?? (prev.composite?.macroScore ?? 0)) +
    (hull?.hullBias ?? (prev.composite?.hullBias ?? 0)) +
    (vpoc?.vpocScore ?? (prev.composite?.vpocScore ?? 0)) +
    vixAdjust +
    yieldAdjust;

  const score = normalizeScore(brut);
  const etatCalcule = etatDepuisScore(score);

  /* ---- Disjoncteur ATR + reset annuel ------------------------------------------ */
  let atr = { pctAnnualise: atrPct, actif: false, force: null };
  if (atrPct !== null) {
    const force = overridesATR(atrPct);
    atr = { pctAnnualise: atrPct, actif: force !== null, force };
  }

  let regimeEffectif;
  let resetAnnuel = false;
  if (atr.force) {
    regimeEffectif = atr.force;                    // la sécurité prime
  } else if (estPremierJanvier) {
    regimeEffectif = "NEUTRAL";                    // reset annuel obligatoire
    resetAnnuel = true;
  } else if (jourSignal) {
    regimeEffectif = etatCalcule;
  } else {
    regimeEffectif = prev.regime ?? etatCalcule;   // prix tous les jours, régime le samedi
  }

  // Repli : VT/VPOC manquant -> NEUTRAL + alerte (rulebook §7.5).
  let fallback = false;
  if (!vpoc || !hull) {
    fallback = true;
    if (!atr.force && !resetAnnuel) regimeEffectif = "NEUTRAL";
  }

  const changed = prev.regime !== regimeEffectif;

  /* ---- Prix du portefeuille ------------------------------------------------------ */
  console.log("\nPrix de clôture :");
  // On repart uniquement des tickers actuels (un symbole retiré, ex. BSOL, disparaît).
  const prix = {};
  for (const t of TITRES) if (prevPrix[t] !== undefined) prix[t] = prevPrix[t];
  for (const t of TITRES) {
    if (t === "VT" && vt !== null) { prix[t] = vt; continue; }
    const p = await fetchLatest(t, prevPrix);
    if (p !== null) prix[t] = p;
  }

  const next = {
    regime: regimeEffectif,
    actionRequise: changed ? true : prev.actionRequise === true,
    changeLe: changed ? today : (prev.changeLe ?? today),
    verifieLe: today,
    note: prev.note ?? "",
    prix,
    prixDate: today,
    composite: {
      score,
      brut,
      macroScore: arr1(macroScore ?? (prev.composite?.macroScore ?? 0)),
      hullBias: hull?.hullBias ?? (prev.composite?.hullBias ?? 0),
      vpocScore: vpoc?.vpocScore ?? (prev.composite?.vpocScore ?? 0),
      vixAdjust,
      yieldAdjust,
      macro: macro ?? prev.composite?.macro ?? null,
      hull: hull ?? prev.composite?.hull ?? null,
      vpoc: vpoc ?? prev.composite?.vpoc ?? null,
      vix,
      courbe: courbe ?? prev.composite?.courbe ?? null,
    },
    atr,
    cibles: CIBLES,
    comptes: {
      tfse: { pct: 60, cible: CORE_TFSA, bandes: BANDES_TFSA },
      reer: { pct: 40, cibles: CIBLES },
    },
    fallback,
    resetAnnuel,
    macroErr: macroErr ?? prev.macroErr ?? null,
  };

  console.log(`\n  Score composite : ${brut} brut -> ${score}/100  (Macro ${next.composite.macroScore} · Hull ${next.composite.hullBias} · VPOC ${next.composite.vpocScore} · VIX ${vixAdjust} · Courbe ${yieldAdjust})`);
  console.log(`  État calculé    : ${etatCalcule}${jourSignal ? " (jour du signal)" : " (prix quotidiens, régime conservé)"}`);
  console.log(`  Régime effectif : ${regimeEffectif}${changed ? `  (CHANGÉ depuis ${prev.regime ?? "aucun"})` : ""}`);
  if (atr.force) console.log(`  Disjoncteur ATR : ACTIF -> forcé ${atr.force}`);
  if (resetAnnuel) console.log(`  Reset annuel    : 1er janvier -> NEUTRAL forcé`);
  if (fallback) console.log(`  REPLI           : données VPOC/VAL manquantes -> NEUTRAL (alerte)`);
  console.log(`  Action requise  : ${next.actionRequise}`);
  console.log(`  Prix obtenus    : ${Object.keys(prix).length} / ${TITRES.length}`);

  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + "\n");
  console.log(`\nÉcrit ${STATE_PATH}`);
}

/** Rapport de clôtures (dernières valeurs) entre deux séries. */
function arr4ratio(a, b) {
  return a.at(-1).close / b.at(-1).close;
}
function arr3(x) { return Math.round(x * 1000) / 1000; }

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch((e) => { console.error(`\nÉCHEC: ${e.message}`); process.exit(1); });
}
