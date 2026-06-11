-- db/schema.sql — Supabase / Postgres

create table if not exists predictions (
  match_id     bigint primary key,
  match_date   date,
  grp          text,
  home         text,
  away         text,
  status       text default 'soon',      -- soon | live | done
  score_pred   text,                     -- "2-0"
  p1 int, pn int, p2 int,                -- probas modèle (hybride), %
  p1_mkt int, pn_mkt int, p2_mkt int,    -- probas marché, %
  xg_h numeric, xg_a numeric,
  pick text,                             -- p1 | pn | p2
  value numeric,                         -- écart modèle - marché sur l'issue retenue
  confidence text,
  -- renseignés après le match (suivi de fiabilité)
  result_1x2   text,                     -- '1' | 'N' | '2'
  result_score text,                     -- "2-1"
  correct_1x2  boolean,
  correct_score boolean,
  updated_at timestamptz default now()
);

create index if not exists idx_pred_date on predictions(match_date);

-- Lecture publique (anon) en SELECT uniquement ; écritures réservées au worker (service_role).
alter table predictions enable row level security;
create policy "read all" on predictions for select using (true);

-- Tableau de bord : taux de réussite calculés automatiquement.
create or replace view accuracy as
select
  count(*) filter (where correct_1x2 is not null)                 as matchs_valides,
  round(100.0 * avg((correct_1x2)::int)
        filter (where correct_1x2 is not null), 1)                as taux_1x2_pct,
  round(100.0 * avg((correct_score)::int)
        filter (where correct_score is not null), 1)              as taux_score_exact_pct
from predictions;
