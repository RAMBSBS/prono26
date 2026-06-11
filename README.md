# PRONO·26 — Pronostics CDM 2026 (moteur hybride xG + cotes)

App perso : pronostics 1X2 + score + probabilités, **modèle Poisson sur xG recalé sur les cotes**, recalculé par cron (horaire + accéléré pré-match), affiché dans une PWA installable sur téléphone.

```
prono26/
├─ engine/      moteur de prédiction (Poisson + blend cotes)  ← coeur, testé
├─ worker/      Cloudflare Worker : cron + ingestion + API
├─ db/          schéma Supabase (predictions + vue accuracy)
└─ frontend/    PWA (HTML/CSS/JS, installable)
```

## Architecture

`Data API (fixtures/xG/cotes)` → `Worker (cron)` → calcule via `engine/poisson.js` → upsert `Supabase` → la `PWA` lit `GET /api/predictions`.

## Prérequis
- Node 18+, compte **Cloudflare** (Workers + Pages, gratuit), projet **Supabase** (gratuit).
- Une **API data football** : API-Football (~19 $/mo, simple) ou TheStatsAPI (~50 $/mo, inclut xG+cotes). Le moteur attend xG (ou ratings dérivés) **et** cotes 1X2.

## Déploiement (≈ 30 min)

**1. Base de données**
- Crée un projet Supabase → SQL Editor → colle `db/schema.sql` → Run.
- Récupère `Project URL` et la clé `service_role` (Settings → API).

**2. Worker (cron + API)**
```bash
cd worker
npx wrangler login
npx wrangler secret put DATA_API_KEY     # ta clé API football
npx wrangler secret put SUPABASE_URL      # https://xxxx.supabase.co
npx wrangler secret put SUPABASE_KEY      # clé service_role
npx wrangler deploy
```
- Branche la couche données : complète `fetchFixtures`, `fetchRatings`, `fetchOdds`, `normalizeFixture` dans `worker/src/index.js` selon ton provider (les `TODO` indiquent où).
- Cadence : éditable dans `worker/wrangler.toml` (`crons`). Régime normal `0 * * * *` ; jours de match, garde aussi `*/10 * * * *`.

**3. Frontend (PWA)**
- Dans `frontend/app.js`, remplace `API` par l'URL de ton worker.
- Ajoute `icon-192.png` / `icon-512.png` dans `frontend/`.
- Déploie le dossier `frontend/` sur **Cloudflare Pages** (ou Vercel/Netlify).
- Sur ton téléphone : ouvre l'URL → menu navigateur → **Ajouter à l'écran d'accueil**.

## Le moteur (engine/poisson.js)
- `projectXG` : ratings att/def + avantage terrain → xG attendus (λ).
- `poissonOutcome` : matrice de scores → P(1/N/2) + score le plus probable.
- `impliedFromOdds` : cotes décimales → probas marché (overround retiré).
- `blend(model, market, w)` : **shrink** du modèle vers le marché. `w` = poids modèle (0.30–0.40 conseillé ; `MODEL_WEIGHT` dans wrangler.toml).
- `value` = écart modèle − marché sur l'issue retenue → ton indicateur de "pari à valeur".
- Test : `node engine/test.js`.

## Réglages clés
- **Qualité des xG** = qualité des pronos. Dérive les ratings att/def d'une moyenne mobile pondérée des xG récents (pondère les matchs CDM > amicaux).
- **Altitude Azteca (2 240 m)** : ajoute un facteur dans `homeAdv` pour les hôtes mexicains.
- **Élimination directe** : recalcule par tour dès les affiches connues (prolongation/tirs au but non modélisés → reste sur le 1X2 temps réglementaire).

## Suivi de fiabilité
Après chaque match, renseigne `result_1x2`, `result_score`, `correct_1x2`, `correct_score` (job de réconciliation à ajouter dans le worker à partir des scores finaux). La vue `accuracy` calcule les taux automatiquement :
```sql
select * from accuracy;
```

## Limites assumées
- Battre durablement le marché est improbable : l'app sert à **systématiser** des pronos explicables et à **mesurer** sa performance, pas à garantir un gain.
- Sandbox d'artifact ≠ prod : les appels API payants et le cron tournent uniquement une fois déployés.
