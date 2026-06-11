// engine/free_pipeline.js — 100% gratuit, sans clé API.
// Source unique : dataset libre martj42/international_results (results.csv).
// Calcule un Elo maison + identité off/déf, puis pronostique les matchs CDM 2026 à venir.
// node engine/free_pipeline.js [nb_matchs]
import fs from "node:fs";
import { predictMatch, CONFIG } from "./engine.v2.js";

/* ── Réglages a priori adaptés à l'Elo réel (NON calibrés — pas de backtest sans données xG).
   ELO_EXP bas pour éviter la sur-confiance des gros écarts d'Elo international. */
const FREE_CFG = {
  ...CONFIG,
  ELO_EXP: 0.25, IDENTITY_EXP: 0.20, ALPHA_FORM: 0.25,
  REST: { k_fatigue: 0, k_tz: 0, restThreshold: 4 }, // pas de données repos fiables -> OFF
  AVAIL: false,                                       // pas de blessures live -> OFF
  MARKET: { asControl: false, guardThreshold: 0.15, guardShrink: 0.10 }, // pas de cotes -> OFF
};

/* ── 1. Parse CSV ── */
const rows = fs.readFileSync("results.csv", "utf8").trim().split("\n").slice(1).map((l) => {
  const [date, home, away, hs, as_, tour, city, country, neutral] = splitCsv(l);
  return { date, home, away, hs: +hs, as: +as_, tour, city, country, neutral: neutral === "TRUE", played: hs !== "NA" && hs !== "" };
});
function splitCsv(l){ // gère les virgules simples (pas de quotes dans ce dataset)
  return l.split(",");
}

const played = rows.filter((r) => r.played && Number.isFinite(r.hs));
const upcomingWC = rows.filter((r) => !r.played && r.tour === "FIFA World Cup");

/* ── 2. Elo maison (World Football Elo simplifié) ── */
const K_BY_TOUR = { "FIFA World Cup": 60, "Friendly": 20 };
const kFor = (t) => K_BY_TOUR[t] ?? (/qualifi|cup|championship|nations|copa|euro|cap of nations/i.test(t) ? 45 : 30);
const elo = new Map();
const R = (t) => elo.get(t) ?? 1500;
const gMult = (gd) => (gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8);

for (const m of played) {
  const ha = m.neutral ? 0 : 100;
  const dr = R(m.home) + ha - R(m.away);
  const We = 1 / (1 + 10 ** (-dr / 400));
  const W = m.hs > m.as ? 1 : m.hs === m.as ? 0.5 : 0;
  const k = kFor(m.tour) * gMult(Math.abs(m.hs - m.as));
  const delta = k * (W - We);
  elo.set(m.home, R(m.home) + delta);
  elo.set(m.away, R(m.away) - delta);
}

/* ── 3. Identité off/déf + forme (proxy buts, faute de xG) ── */
function recent(team, n) {
  const ms = played.filter((r) => r.home === team || r.away === team).slice(-n);
  let gf = 0, ga = 0;
  for (const r of ms) { const home = r.home === team; gf += home ? r.hs : r.as; ga += home ? r.as : r.hs; }
  const k = Math.max(1, ms.length);
  return { gf: gf / k, ga: ga / k, n: ms.length };
}

/* ── 4. Centre l'Elo sur les 48 équipes du tournoi ── */
const wcTeams = [...new Set(upcomingWC.flatMap((m) => [m.home, m.away]))];
FREE_CFG.ELO_AVG = wcTeams.reduce((s, t) => s + R(t), 0) / wcTeams.length;

/* ── 5. Pronostics ── */
const N = +process.argv[2] || 8;
const PICK = { p1: "1", pn: "N", p2: "2" };
const fixtures = upcomingWC.sort((a, b) => a.date.localeCompare(b.date)).slice(0, N);

console.log(`Elo moyen (48 équipes) = ${FREE_CFG.ELO_AVG.toFixed(0)} | matchs joués indexés : ${played.length}\n`);
const out = [];
for (const fx of fixtures) {
  const hist = (t) => { const long = recent(t, 30), form = recent(t, 8);
    return { elo: R(t), histGF: long.gf, histGA: long.ga, recentXgFor: form.gf, recentXgAgainst: form.ga }; };
  const altitude = /mexico city|ciudad de m/i.test(fx.city);
  const venueHome = fx.neutral ? "neutral" : "home";
  const p = predictMatch({ home: hist(fx.home), away: hist(fx.away),
    venue: { home: venueHome, altitude }, odds: null }, FREE_CFG);

  console.log(`${fx.date}  ${fx.home} ${p.score[0]}-${p.score[1]} ${fx.away}` + (altitude ? "  [altitude]" : ""));
  console.log(`   Elo ${R(fx.home).toFixed(0)} vs ${R(fx.away).toFixed(0)} | xG proj ${p.xg[0]}-${p.xg[1]}`);
  console.log(`   Prono ${PICK[p.pick]}  |  1:${p.proba.p1}%  N:${p.proba.pn}%  2:${p.proba.p2}%  | conf ${p.confidence}\n`);

  out.push({ match_id: hashId(fx.date + fx.home + fx.away), match_date: fx.date, grp: null,
    home: fx.home, away: fx.away, status: "soon", score_pred: `${p.score[0]}-${p.score[1]}`,
    p1: p.proba.p1, pn: p.proba.pn, p2: p.proba.p2,
    p1_mkt: null, pn_mkt: null, p2_mkt: null, xg_h: p.xg[0], xg_a: p.xg[1],
    pick: p.pick, value: null, confidence: p.confidence,
    elo_h: Math.round(R(fx.home)), elo_a: Math.round(R(fx.away)), altitude });
}
fs.writeFileSync("predictions.json", JSON.stringify(out, null, 2));
console.log(`→ predictions.json écrit (${out.length} matchs). Sers-le à la PWA.`);
function hashId(s){ let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))|0; return Math.abs(h); }
