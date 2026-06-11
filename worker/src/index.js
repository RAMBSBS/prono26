// worker/src/index.js — Cloudflare Worker (fetch + scheduled cron)
import { predictMatch } from "../../engine/poisson.js";

// ── Couche données : ABSTRAITE. Branche ici ton API (API-Football / TheStatsAPI / Sportmonks).
// Chaque fonction doit renvoyer le format attendu par predictMatch().
async function fetchFixtures(env, fromISO, toISO) {
  // TODO: GET fixtures CDM 2026 dans la fenêtre [fromISO, toISO]
  // Exemple API-Football: https://v3.football.api-sports.io/fixtures?league=1&season=2026&from=...&to=...
  const r = await fetch(
    `${env.DATA_API_BASE}/fixtures?league=1&season=2026&from=${fromISO}&to=${toISO}`,
    { headers: { "x-apisports-key": env.DATA_API_KEY } }
  );
  const j = await r.json();
  // Normalise -> [{id, date, group, homeName, awayName, homeId, awayId, status}]
  return j.response.map(normalizeFixture);
}

async function fetchRatings(env, teamId) {
  // TODO: dérive att/def depuis l'historique xG de l'équipe (moyenne mobile pondérée).
  // Fallback neutre tant que non branché.
  return { att: 1.0, def: 1.0 };
}

async function fetchOdds(env, fixtureId) {
  // TODO: GET cotes 1X2 (décimales) pour le match. Prends la médiane multi-bookmakers.
  // Fallback neutre (cotes plates) si indispo -> le modèle pilote seul.
  return { o1: 2.6, oN: 3.2, o2: 2.8 };
}

function normalizeFixture(f) { /* TODO selon le provider */ return f; }

// ── Calcule et upsert un lot.
async function runBatch(env) {
  const now = new Date();
  const to = new Date(now.getTime() + 36 * 3600e3); // fenêtre 36h
  const fixtures = await fetchFixtures(env, iso(now), iso(to));

  const rows = [];
  for (const fx of fixtures) {
    const [home, away, odds] = await Promise.all([
      fetchRatings(env, fx.homeId),
      fetchRatings(env, fx.awayId),
      fetchOdds(env, fx.id),
    ]);
    // Avantage terrain : 1.0 si l'hôte joue hors de son pays, sinon 1.10 (+ bonus altitude Azteca à gérer ici)
    const homeAdv = fx.isHostCountry ? 1.10 : 1.0;
    const p = predictMatch({ home, away, odds, homeAdv, w: env.MODEL_WEIGHT ?? 0.35 });

    rows.push({
      match_id: fx.id, match_date: fx.date, grp: fx.group,
      home: fx.homeName, away: fx.awayName, status: fx.status,
      score_pred: `${p.score[0]}-${p.score[1]}`,
      p1: p.proba.p1, pn: p.proba.pn, p2: p.proba.p2,
      p1_mkt: p.market.p1, pn_mkt: p.market.pn, p2_mkt: p.market.p2,
      xg_h: p.xg[0], xg_a: p.xg[1],
      pick: p.pick, value: p.value, confidence: p.confidence,
      updated_at: new Date().toISOString(),
    });
  }
  await upsertSupabase(env, rows);
  return rows.length;
}

async function upsertSupabase(env, rows) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/predictions?on_conflict=match_id`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_KEY,
      Authorization: `Bearer ${env.SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
}

const iso = (d) => d.toISOString().slice(0, 10);

export default {
  // Cron : déclenché par la planif wrangler. Cadence gérée par les triggers (voir wrangler.toml).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runBatch(env));
  },
  // API lue par la PWA.
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = { "Access-Control-Allow-Origin": "*" };
    if (url.pathname === "/api/predictions") {
      const r = await fetch(
        `${env.SUPABASE_URL}/rest/v1/predictions?select=*&order=match_date.asc`,
        { headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` } }
      );
      return new Response(await r.text(), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (url.pathname === "/api/refresh") { // déclenchement manuel
      const n = await runBatch(env);
      return new Response(JSON.stringify({ updated: n }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response("PRONO·26 worker", { headers: cors });
  },
};
