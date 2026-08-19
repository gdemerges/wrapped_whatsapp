# CLAUDE.md

## Stack
Vanilla JS ES modules, HTML, CSS — pas de framework, pas de build step.
Vitest pour les tests, ESLint pour le lint.

## Règles

- Pas de dépendances npm runtime (Chart.js, LZ-String, JSZip chargés depuis un CDN)
- Les scripts CDN sont chargés **paresseusement** via `js/vendor.js`, jamais par une balise
  `<script>` dans le HTML : rien de tout cela n'est nécessaire pour peindre l'écran d'accueil
- Tout le traitement reste côté client — aucun appel réseau avec des données utilisateur
- Modules ES natifs : `import`/`export`, jamais `require`
- Lancer les tests : `npm test` — les faire passer avant tout commit
- Lancer le lint : `npm run lint`, et les types : `npm run typecheck`
- Serveur local : `python -m http.server 8000` (aucun outil de build)
- `index.html#demo` charge une conversation fictive — pratique pour tester sans export réel

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `js/app.js` | Orchestration : import de fichier, worker, écrans |
| `js/deck.js` | Navigation entre slides, mode lecture automatique |
| `js/worker.js` | Web Worker : lit le fichier, parse, calcule, met en cache |
| `js/parser.js` | Parsing des exports WhatsApp (iOS / Android, FR / EN / ES / DE) |
| `js/stats.js` | Calcul de toutes les statistiques |
| `js/slides/` | Une slide par fichier ; `index.js` compose le deck |
| `js/export-image.js` | Rendu canvas des images partageables 1080×1920 |
| `js/anonymize.js` | Remplacement des prénoms par des initiales |
| `js/vendor.js` | Chargement paresseux des scripts CDN (SRI épinglé) |
| `js/ui/` | Dialogues, toasts, feuille de partage, gestion du hash |
| `js/dashboard.js` | Vue tableau de bord |
| `js/lang/` | Données de langue (stopwords, sentiment) |
| `tests/` | Tests Vitest — voir les fixtures pour les formats de chat supportés |

## Conventions à respecter

- **Une slide** est un objet `{ gradient, html, card?, chart? }`.
  - `gradient` vient de `THEME` dans `js/slides/_constants.js` : la couleur suit la section du
    deck, elle n'est pas distribuée à la ronde.
  - `card` est la description en données pures pour l'export image. Toute slide qui porte un
    chiffre marquant devrait en avoir une.
  - `chart` reçoit `(ctx, slideEl)` et doit passer par `makeChart` de `js/slides/_charts.js`,
    jamais `new Chart` : le registre gère la destruction et la recoloration au changement de
    thème. Les couleurs de thème s'écrivent `'var(--token)'` dans la config.
- **Le worker garde les messages** ; le thread principal ne détient jamais le texte du chat.
- **Le partage par lien** doit rester anonymisable : toute nouvelle statistique portant un nom
  de personne doit survivre au parcours générique de `anonymize.js` (clé *ou* valeur).

## Formats de chat supportés
Détails dans `js/parser.js`. L'ordre jour/mois est **déduit du fichier** (`inferDateOrder`),
pas devine à partir du séparateur.
