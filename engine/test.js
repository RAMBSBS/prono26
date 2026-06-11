// engine/test.js — node engine/test.js
import { predictMatch } from "./poisson.js";

// Exemple : Suisse forte vs Qatar faible, cotes marché ~ Suisse favorite.
const out = predictMatch({
  home: { att: 0.7, def: 1.3 },  // Qatar (att faible, encaisse bcp)
  away: { att: 1.4, def: 0.8 },  // Suisse
  odds: { o1: 6.0, oN: 4.2, o2: 1.55 },
  homeAdv: 1.0,                   // terrain neutre (USA)
  w: 0.35,
});
console.log(JSON.stringify(out, null, 2));
// Attendu : pick = p2, score ~ 0-2, proba p2 ~60%, value proche du marché.
