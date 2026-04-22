# CLAUDE.md

## Stack
Vanilla JS ES modules, HTML, CSS — pas de framework, pas de build step.
Vitest pour les tests, ESLint pour le lint.

## Règles

- Pas de dépendances npm runtime (Chart.js, LZ-String, JSZip chargés via CDN dans le HTML)
- Tout le traitement reste côté client — aucun appel réseau avec des données utilisateur
- Modules ES natifs : `import`/`export`, jamais `require`
- Lancer les tests : `npm test` — les faire passer avant tout commit
- Lancer le lint : `npm run lint`
- Serveur local : `python -m http.server 8000` (aucun outil de build)

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `js/parser.js` | Parsing des exports WhatsApp (iOS / Android, FR / EN) |
| `js/stats.js` | Calcul de toutes les statistiques |
| `js/slides.js` | Rendu des slides animées |
| `js/app.js` | Orchestration principale (upload, navigation, partage URL) |
| `js/dashboard.js` | Vue tableau de bord |
| `js/worker.js` | Web Worker pour le parsing en arrière-plan |
| `js/lang/` | Données de langue (stopwords, sentiment) |
| `tests/` | Tests Vitest — voir les fixtures pour les formats de chat supportés |

## Formats de chat supportés
Détails dans `js/parser.js` — iOS FR, Android FR, Android US.
