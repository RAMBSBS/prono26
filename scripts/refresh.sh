#!/usr/bin/env bash
# scripts/refresh.sh — rafraîchit données + pronos (100% gratuit, aucune clé)
set -e
URL="https://raw.githubusercontent.com/martj42/international_results/master/results.csv"
echo "↓ Téléchargement du dataset libre..."
curl -sL -o results.csv "$URL"
echo "✓ $(wc -l < results.csv) lignes"
echo "⚙  Calcul Elo + pronos..."
node engine/free_pipeline.js "${1:-12}"
# predictions.json est régénéré -> à servir à la PWA (GitHub Pages, etc.)
