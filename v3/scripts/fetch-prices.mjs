#!/usr/bin/env node
/**
 * Abundance 3.0 — récupère les prix de clôture pour la calculatrice.
 *
 * Écrit v3/state.json : { prix, prixDate, verifieLe }.
 * Le navigateur n'a qu'à lire state.json et à calculer les actions.
 * Aucune dépendance (Node 20+, global fetch).
 *
 * Robustesse (comme le robot 2.0) :
 *   - 3 tentatives avec délai croissant ;
 *   - variation > 50 % en une journée → prix rejeté (ancien prix conservé) ;
 *   - symbole en échec → ancien prix conservé plutôt que disparaître.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const TITRES = ["IBIT", "GLDM", "SPCX", "MCHI", "BSOL", "BCI"];
const STATE_PATH = new URL("../state.json", import.meta.url).pathname;

function parseYahoo(json) {
  const res = json?.chart?.result?.[0];
  if (!res) throw new Error(json?.chart?.error?.description ?? "aucune donnée");
  const closes = res.indicators?.quote?.[0]?.close ?? [];
  const prices = closes.filter((c) => typeof c === "number" && isFinite(c) && c > 0);
  if (!prices.length) throw new Error("aucune clôture exploitable");
  const ts = res.timestamp ?? [];
  const lastIdx = closes.findLastIndex((c) => typeof c === "number" && isFinite(c) && c > 0);
  const date = lastIdx >= 0 && ts[lastIdx]
    ? new Date(ts[lastIdx] * 1000).toISOString().slice(0, 10)
    : null;
  const last = prices[prices.length - 1];
  return { close: Math.round(last * 100) / 100, date };
}

async function fetchSymbol(symbol, tries = 3) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; abundance3/1.0)", Accept: "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { close, date } = parseYahoo(await r.json());
      console.log(`  ${symbol}: ${close} (${date})`);
      return { close, date };
    } catch (e) {
      lastErr = e;
      console.warn(`  ${symbol} essai ${i}/${tries} échoué: ${e.message}`);
      if (i < tries) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw new Error(`${symbol}: ${lastErr.message}`);
}

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

async function main() {
  console.log("Abundance 3.0 — prix de clôture\n");

  let prev = {};
  if (existsSync(STATE_PATH)) {
    try { prev = JSON.parse(readFileSync(STATE_PATH, "utf8")); } catch {}
  }
  const anciens = prev.prix ?? {};

  const prix = {};
  let dernierDate = null;
  for (const t of TITRES) {
    try {
      const { close, date } = await fetchSymbol(t, 2);
      if (validatePrice(t, close, anciens[t])) {
        prix[t] = close;
        if (date) dernierDate = date;
      } else if (anciens[t]) {
        prix[t] = anciens[t];
      }
    } catch (e) {
      console.warn(`  prix ${t}: ÉCHEC — ancien prix conservé`);
      if (anciens[t]) prix[t] = anciens[t];
    }
  }

  if (!Object.keys(prix).length) throw new Error("Aucun prix récupéré — ne pas écrire.");

  const next = {
    prix,
    prixDate: dernierDate ?? prev.prixDate ?? "",
    verifieLe: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + "\n");
  console.log(`\nPrix obtenus : ${Object.keys(prix).length} / ${TITRES.length}`);
  console.log(`Écrit ${STATE_PATH}`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch((e) => { console.error(`\nÉCHEC: ${e.message}`); process.exit(1); });
}
