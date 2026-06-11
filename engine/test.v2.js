// engine/test.v2.js — node engine/test.v2.js
import { predictMatch, CONFIG } from "./engine.v2.js";

// Cas 1 : Suisse (Elo fort) vs Qatar (Elo faible), terrain neutre, marché d'accord.
const c1 = predictMatch({
  home: { elo: 1480, histGF: 1.0, histGA: 1.7, recentXgFor: 0.9, recentXgAgainst: 1.8, restDays: 4, tzCrossed: 0 }, // Qatar
  away: { elo: 1720, histGF: 1.8, histGA: 0.9, recentXgFor: 1.7, recentXgAgainst: 0.9, restDays: 4, tzCrossed: 1 }, // Suisse
  venue: { home: "neutral", altitude: false },
  odds: { o1: 6.0, oN: 4.2, o2: 1.55 },
});

// Cas 2 : désaccord marché — attaquant clé adverse absent (outShareAtt élevé) que le marché n'a pas encore intégré.
const c2 = predictMatch({
  home: { elo: 1650, histGF: 1.5, histGA: 1.0, recentXgFor: 1.5, recentXgAgainst: 1.0, restDays: 5, tzCrossed: 0, outShareDef: 0.0 },
  away: { elo: 1660, histGF: 1.6, histGA: 1.1, recentXgFor: 1.6, recentXgAgainst: 1.1, restDays: 3, tzCrossed: 2, outShareAtt: 0.30 }, // titulaire offensif out
  venue: { home: "home", altitude: true },     // hôte mexicain à l'Azteca
  odds: { o1: 2.5, oN: 3.2, o2: 2.8 },          // marché : match équilibré (ignore l'absence)
});

console.log("CAS 1 (favori net):", JSON.stringify(c1, null, 1));
console.log("CAS 2 (désaccord marché):", JSON.stringify(c2, null, 1));
