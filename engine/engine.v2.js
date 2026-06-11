// engine/engine.v2.js — moteur hybride v2 (ESM)
// Hiérarchie : socle Elo → ajusté forme → ajusté repos/voyage → ajusté absences → Poisson
//              → marché en GARDE-FOU (contrôle + value), pas en source.
// Chaque facteur est désactivable via CONFIG (poids 0 = neutre).

export const CONFIG = {
  BASE_GOALS: 1.30,     // buts moyens/équipe/match (CDM)
  ELO_AVG: 1600,        // Elo de référence (équipe "moyenne" du tournoi)
  ELO_EXP: 0.60,        // sensibilité du socle à l'Elo
  IDENTITY_EXP: 0.40,   // poids de l'identité offensive/défensive historique
  ALPHA_FORM: 0.30,     // 0 = ignore la forme ; 0.3 = 30% forme récente / 70% socle
  REST: { k_fatigue: 0.04, k_tz: 0.015, restThreshold: 4 }, // mettre à 0 pour désactiver
  AVAIL: true,          // false = ignore absences
  HOME: { trueHome: 1.10, neutral: 1.00, altitudeBonus: 0.06 }, // Azteca → +altitudeBonus
  MARKET: {
    asControl: true,    // true = marché en garde-fou (recommandé) ; false = aucun usage
    guardThreshold: 0.15, // ne corrige QUE si |modèle - marché| > 15 pts sur l'issue retenue
    guardShrink: 0.10,    // intensité de la correction quand le seuil est franchi (10%)
  },
};

/* ───────────────────────── socle Elo → ratings att/def ─────────────────────── */
// histGF/histGA : buts marqués/encaissés moyens récents (sépare l'identité off/def).
export function eloToRatings(elo, { histGF = 1.3, histGA = 1.3 } = {}, cfg = CONFIG) {
  const S = 10 ** ((elo - cfg.ELO_AVG) / 400);            // force globale (>1 = fort)
  const offId = histGF / cfg.BASE_GOALS;                  // identité offensive (>1 = attaque prolifique)
  const defId = histGA / cfg.BASE_GOALS;                  // identité défensive (>1 = encaisse bcp)
  const att = S ** cfg.ELO_EXP * offId ** cfg.IDENTITY_EXP;
  const def = S ** (-cfg.ELO_EXP) * defId ** cfg.IDENTITY_EXP; // <1 = bonne défense
  return { att, def };
}

/* ─────────────────────────── ajustement forme récente ─────────────────────── */
// recentXgFor / recentXgAgainst : moyenne mobile exponentielle des xG (pondérer CDM > amical en amont).
export function applyForm(r, { recentXgFor, recentXgAgainst } = {}, cfg = CONFIG) {
  if (!cfg.ALPHA_FORM || recentXgFor == null) return r;
  const a = cfg.ALPHA_FORM;
  return {
    att: (1 - a) * r.att + a * (recentXgFor / cfg.BASE_GOALS),
    def: (1 - a) * r.def + a * (recentXgAgainst / cfg.BASE_GOALS),
  };
}

/* ─────────────────────────── absences / compositions ──────────────────────── */
// outShareAtt : part de valeur offensive absente (0..~0.4) ; outShareDef : idem défensive.
export function applyAvailability(r, { outShareAtt = 0, outShareDef = 0 } = {}, cfg = CONFIG) {
  if (!cfg.AVAIL) return r;
  return {
    att: r.att * (1 - clamp(outShareAtt, 0, 0.6)),
    def: r.def * (1 + clamp(outShareDef, 0, 0.6)), // def monte = défense plus perméable
  };
}

/* ─────────────────────────── repos / voyage (fatigue) ─────────────────────── */
export function restFactor({ restDays = 4, tzCrossed = 0 } = {}, cfg = CONFIG) {
  const { k_fatigue, k_tz, restThreshold } = cfg.REST;
  const f = 1 - k_fatigue * Math.max(0, restThreshold - restDays) - k_tz * tzCrossed;
  return clamp(f, 0.80, 1.0);
}

/* ─────────────────────────── avantage terrain / lieu ──────────────────────── */
export function homeAdvantage({ venue = "neutral", altitude = false } = {}, cfg = CONFIG) {
  const base = venue === "home" ? cfg.HOME.trueHome : cfg.HOME.neutral;
  return base + (altitude ? cfg.HOME.altitudeBonus : 0);
}

/* ─────────────────────────────── Poisson ──────────────────────────────────── */
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
const pois = (l, k) => (Math.exp(-l) * l ** k) / fact(k);

export function poissonOutcome(lH, lA, maxG = 8) {
  let p1 = 0, pn = 0, p2 = 0, best = 0, score = [0, 0];
  for (let i = 0; i <= maxG; i++) for (let j = 0; j <= maxG; j++) {
    const p = pois(lH, i) * pois(lA, j);
    if (i > j) p1 += p; else if (i === j) pn += p; else p2 += p;
    if (p > best) { best = p; score = [i, j]; }
  }
  const s = p1 + pn + p2;
  return { p1: p1 / s, pn: pn / s, p2: p2 / s, score };
}

export function impliedFromOdds({ o1, oN, o2 }) {
  const r1 = 1 / o1, rN = 1 / oN, r2 = 1 / o2, s = r1 + rN + r2;
  return { p1: r1 / s, pn: rN / s, p2: r2 / s };
}

/* ──────────────────── marché en GARDE-FOU (contrôle + value) ───────────────── */
// N'agit que si modèle et marché divergent fortement sur l'issue retenue.
export function marketGuard(model, market, cfg = CONFIG) {
  const keys = ["p1", "pn", "p2"];
  const pick = keys.reduce((a, b) => (model[a] >= model[b] ? a : b));
  const value = model[pick] - market[pick];           // value SUR LE MODÈLE INDÉPENDANT (interprétable)
  const disagree = Math.abs(value) > cfg.MARKET.guardThreshold;

  let final = { ...model };
  if (cfg.MARKET.asControl && disagree) {              // correction légère seulement si désaccord fort
    const w = 1 - cfg.MARKET.guardShrink;              // ex. 90% modèle / 10% marché
    final = norm({
      p1: w * model.p1 + (1 - w) * market.p1,
      pn: w * model.pn + (1 - w) * market.pn,
      p2: w * model.p2 + (1 - w) * market.p2,
    });
  }
  return { final, pick, value: +value.toFixed(3), marketDisagreement: disagree };
}

export function confidence(model, marketDisagreement) {
  const s = [model.p1, model.pn, model.p2].sort((a, b) => b - a);
  const gap = s[0] - s[1];
  let level = gap > 0.25 ? "Élevée" : gap > 0.12 ? "Moyenne" : "Faible";
  if (marketDisagreement && level === "Élevée") level = "Moyenne"; // le marché tempère la confiance
  return level;
}

/* ─────────────────────────────── pipeline ─────────────────────────────────── */
/**
 * @param {object} m {
 *   home:{elo, histGF, histGA, recentXgFor, recentXgAgainst, outShareAtt, outShareDef, restDays, tzCrossed},
 *   away:{... idem},
 *   venue:{ home:'home'|'neutral', altitude:boolean },
 *   odds:{o1,oN,o2}|null
 * }
 */
export function predictMatch(m, cfg = CONFIG) {
  const build = (t) => applyAvailability(applyForm(eloToRatings(t.elo, t, cfg), t, cfg), t, cfg);
  const H = build(m.home), A = build(m.away);

  const adv = homeAdvantage({ venue: m.venue?.home, altitude: m.venue?.altitude }, cfg);
  const fH = restFactor(m.home, cfg), fA = restFactor(m.away, cfg);

  const lH = cfg.BASE_GOALS * H.att * A.def * adv * fH;
  const lA = cfg.BASE_GOALS * A.att * H.def * (1 / adv) ** 0.5 * fA;

  const model = poissonOutcome(lH, lA);
  const market = m.odds ? impliedFromOdds(m.odds) : null;

  if (!market) { // pas de cotes → modèle seul, pas de garde-fou
    return pack(lH, lA, model, model, null, keyPick(model), null, false, confidence(model, false));
  }
  const g = marketGuard(model, market, cfg);
  return pack(lH, lA, g.final, model, market, g.pick, g.value, g.marketDisagreement,
              confidence(g.final, g.marketDisagreement));
}

/* ─────────────────────────────── helpers ──────────────────────────────────── */
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const norm = (p) => { const s = p.p1 + p.pn + p.p2; return { p1: p.p1 / s, pn: p.pn / s, p2: p.p2 / s }; };
const pct = (x) => Math.round(x * 100);
const keyPick = (p) => ["p1", "pn", "p2"].reduce((a, b) => (p[a] >= p[b] ? a : b));

function pack(lH, lA, final, model, market, pick, value, disagree, conf) {
  return {
    xg: [+lH.toFixed(2), +lA.toFixed(2)],
    score: poissonOutcome(lH, lA).score,
    proba: { p1: pct(final.p1), pn: pct(final.pn), p2: pct(final.p2) },
    model_raw: { p1: pct(model.p1), pn: pct(model.pn), p2: pct(model.p2) },
    market: market ? { p1: pct(market.p1), pn: pct(market.pn), p2: pct(market.p2) } : null,
    pick, value, marketDisagreement: disagree, confidence: conf,
  };
}
