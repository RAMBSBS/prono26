// engine/poisson.js — moteur hybride xG + cotes (ESM)
// Idée : modèle Poisson bivarié sur les xG projetés, puis "shrink" vers le marché.

const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));
const pois = (lambda, k) => (Math.exp(-lambda) * lambda ** k) / factorial(k);

/**
 * Projette les xG d'un match à partir des ratings d'équipe.
 * @param {{att:number,def:number}} home  ratings (≈ buts attendus pour/contre, base 1.3)
 * @param {{att:number,def:number}} away
 * @param {number} homeAdv  multiplicateur avantage terrain (def ~1.10 ; 1.0 si neutre/co-hôte adverse)
 * @returns {{lambdaH:number, lambdaA:number}}
 */
export function projectXG(home, away, homeAdv = 1.10) {
  const BASE = 1.30; // buts moyens/équipe/match en CDM
  const lambdaH = BASE * home.att * away.def * homeAdv;
  const lambdaA = BASE * away.att * home.def * (1 / homeAdv) ** 0.5;
  return { lambdaH, lambdaA };
}

/**
 * Matrice des scores Poisson -> probas 1/N/2 + score le plus probable.
 * @returns {{p1:number,pn:number,p2:number,score:[number,number]}}
 */
export function poissonOutcome(lambdaH, lambdaA, maxGoals = 8) {
  let p1 = 0, pn = 0, p2 = 0, best = 0, score = [0, 0];
  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const p = pois(lambdaH, i) * pois(lambdaA, j);
      if (i > j) p1 += p; else if (i === j) pn += p; else p2 += p;
      if (p > best) { best = p; score = [i, j]; }
    }
  }
  const s = p1 + pn + p2;
  return { p1: p1 / s, pn: pn / s, p2: p2 / s, score };
}

/**
 * Cotes décimales -> probas implicites normalisées (overround retiré).
 * @param {{o1:number,oN:number,o2:number}} odds
 */
export function impliedFromOdds({ o1, oN, o2 }) {
  const r1 = 1 / o1, rN = 1 / oN, r2 = 1 / o2;
  const s = r1 + rN + r2; // = 1 + marge bookmaker
  return { p1: r1 / s, pn: rN / s, p2: r2 / s };
}

/**
 * Blend : shrink du modèle vers le marché. w = poids du modèle (0..1).
 * w bas = on fait confiance au marché (recommandé : 0.30–0.40).
 */
export function blend(model, market, w = 0.35) {
  const mix = (a, b) => w * a + (1 - w) * b;
  let p1 = mix(model.p1, market.p1);
  let pn = mix(model.pn, market.pn);
  let p2 = mix(model.p2, market.p2);
  const s = p1 + pn + p2;
  return { p1: p1 / s, pn: pn / s, p2: p2 / s };
}

/** Confiance dérivée de l'écart top1 - top2. */
export function confidence(p) {
  const sorted = [p.p1, p.pn, p.p2].sort((a, b) => b - a);
  const gap = sorted[0] - sorted[1];
  if (gap > 0.25) return "Élevée";
  if (gap > 0.12) return "Moyenne";
  return "Faible";
}

/**
 * Pipeline complet d'un match.
 * @param {object} m  { home:{att,def}, away:{att,def}, odds:{o1,oN,o2}, homeAdv }
 */
export function predictMatch(m) {
  const { lambdaH, lambdaA } = projectXG(m.home, m.away, m.homeAdv ?? 1.10);
  const model = poissonOutcome(lambdaH, lambdaA);
  const market = impliedFromOdds(m.odds);
  const final = blend(model, market, m.w ?? 0.35);

  const labels = ["p1", "pn", "p2"];
  const pickKey = labels.reduce((a, b) => (final[a] >= final[b] ? a : b));
  const value = +(final[pickKey] - market[pickKey]).toFixed(3); // value sur l'issue retenue

  return {
    xg: [+lambdaH.toFixed(2), +lambdaA.toFixed(2)],
    score: model.score,
    proba: { p1: round(final.p1), pn: round(final.pn), p2: round(final.p2) },
    market: { p1: round(market.p1), pn: round(market.pn), p2: round(market.p2) },
    pick: pickKey,
    value,
    confidence: confidence(final),
  };
}
const round = (x) => Math.round(x * 100);
