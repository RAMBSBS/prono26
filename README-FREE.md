# Build 100 % gratuit — PRONO·26

Aucune API payante, aucune clé. Une seule source : le dataset libre
[`martj42/international_results`](https://github.com/martj42/international_results)
(résultats internationaux 1872→aujourd'hui **+ fixtures CDM 2026**).

## Ce qui tourne
- **Elo maison** calculé sur ~49 400 matchs réels (World Football Elo simplifié, K par importance, avantage terrain, multiplicateur d'écart).
- **Identité offensive/défensive** + **forme** (proxy : buts récents, faute de xG).
- **Avantage hôte / altitude Azteca** depuis les colonnes `neutral`/`city` du CSV.
- Moteur **v2** réutilisé, avec marché/blessures/repos **désactivés** (pas de source gratuite fiable).

## Lancer
```bash
cd prono26
bash scripts/refresh.sh 12      # télécharge le CSV + génère predictions.json (12 prochains matchs)
# ou directement :
node engine/free_pipeline.js 12
```

## Déploiement 100 % gratuit (bout en bout)
- **Calcul planifié** : GitHub Actions (cron quotidien, gratuit) exécute `refresh.sh`, commit `predictions.json`.
- **Hébergement PWA** : GitHub Pages (gratuit) sert le dossier `frontend/` + `predictions.json`.
- **Sur le téléphone** : ouvrir l'URL Pages → « Ajouter à l'écran d'accueil ».
- Dans `frontend/app.js`, pointer `API` vers l'URL du `predictions.json` (lecture statique, pas de worker).

## Mise à jour pendant le tournoi
Le CSV est mis à jour par la communauté : re-télécharger **remplit les scores joués** (→ l'Elo se met à jour tout seul) **et les affiches à élimination directe** dès qu'elles existent. Relancer `refresh.sh` suffit.

## Limites assumées (vs version payante)
- **Pas de xG réel** : la « forme » = buts récents, plus bruitée. Ex. un Brésil en disette de buts peut être sous-évalué.
- **Pas de cotes** : aucun garde-fou marché, aucun indicateur de « value ».
- **Pas de blessures/compos** : le levier le plus fort à J-1 est absent.
- **Fraîcheur** : dépend du rythme de mise à jour du dataset (pas du temps réel).
- **Non calibré** : exposants Elo/forme fixés a priori (pas de backtest). Probas indicatives.

---

## Mettre en ligne (application web gratuite, sur téléphone)

Tout repose sur GitHub (gratuit) : Actions recalcule, Pages héberge.

1. **Créer le repo** : pousse le **contenu** du dossier `prono26/` à la racine d'un repo GitHub (public = minutes Actions illimitées).
2. **Activer Pages** : Settings → Pages → *Source = GitHub Actions*.
3. **Lancer** : onglet Actions → *predict-and-deploy* → *Run workflow* (puis ça tourne tout seul chaque heure).
4. **Sur ton téléphone** : ouvre l'URL `https://<user>.github.io/<repo>/` → menu navigateur → *Ajouter à l'écran d'accueil*.

Le workflow `.github/workflows/predict.yml` : télécharge le CSV → `node engine/free_pipeline.js 40` → publie `frontend/` (PWA + `predictions.json` frais) sur Pages. Aucun commit, aucun serveur, aucune clé.

### Cadence
- `cron: "0 * * * *"` = horaire. GitHub peut décaler de quelques minutes (normal sur le tier gratuit).
- Plus fin (ex. `*/10`) est possible mais peu fiable côté GitHub ; l'horaire suffit largement vu que le dataset n'est pas temps réel.
