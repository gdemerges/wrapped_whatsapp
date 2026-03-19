# WhatsApp Wrapped

Analyse tes conversations WhatsApp et génère une présentation animée à la façon Spotify Wrapped — directement dans ton navigateur, sans aucun envoi de données.

## Fonctionnalités

- **Analyse complète** : messages, médias, emojis, mots les plus utilisés, réponses...
- **13+ slides animées** : classements, graphiques, heatmaps, anecdotes, etc.
- **Filtrage par année** : analyse une année spécifique ou toute la conversation
- **Partage via URL** : les stats sont compressées et encodées dans l'URL pour pouvoir les partager
- **100% client-side** : aucune donnée n'est envoyée à un serveur
- **Multi-format** : supporte les exports WhatsApp iOS et Android, en français et en anglais

## Utilisation

### 1. Exporter ta conversation WhatsApp

Dans WhatsApp :
- Ouvre la conversation ou le groupe
- Appuie sur les **trois points** (Android) ou le nom du contact (iOS)
- **Exporter la discussion** → **Sans les médias**

### 2. Charger le fichier

- Ouvre le site et glisse le fichier `.txt` (ou `.zip`) dans la zone d'upload
- Sélectionne l'année à analyser si besoin

### 3. Explorer les résultats

Navigue entre les slides avec :
- Les **flèches** à l'écran
- Les touches **← →** du clavier
- Le **swipe** sur mobile
- La **molette** de la souris

## Lancer en local

Aucun outil de build nécessaire. Il suffit d'un serveur web statique :

```bash
# Python 3
python -m http.server 8000

# Node.js
npx http-server
```

Puis ouvre [http://localhost:8000](http://localhost:8000).

## Structure du projet

```
site/
├── index.html      # Page principale
├── css/
│   └── style.css   # Styles (thème sombre, animations, responsive)
└── js/
    ├── app.js      # Logique principale (upload, navigation, partage)
    ├── parser.js   # Parseur de fichiers WhatsApp
    ├── stats.js    # Calcul des statistiques
    └── slides.js   # Génération et rendu des slides
```

## Stack technique

- **Vanilla JS / HTML / CSS** — pas de framework
- **[Chart.js](https://www.chartjs.org/)** — graphiques interactifs
- **[LZ-String](https://pieroxy.net/blog/pages/lz-string/index.html)** — compression pour le partage par URL
- **[JSZip](https://stuk.github.io/jszip/)** — lecture des exports `.zip`
- **Google Fonts** — Inter & Space Grotesk

## Formats de chat supportés

| Format | Exemple |
|--------|---------|
| iOS francais | `[12/03/2024 14:30:00] Alice: Bonjour` |
| Android français | `12/03/2024 14:30 - Alice: Bonjour` |
| Android US | `03/12/24, 2:30 PM - Alice: Hello` |

## Statistiques calculées

- Nombre de messages, participants, durée, caractères
- Classement des membres les plus actifs
- Répartition par heure, jour de la semaine, mois
- Heatmap d'activité (jour × heure)
- Top 30 des mots (avec filtrage des mots vides)
- Top emojis et champions d'emojis
- Types de médias partagés
- Longueur moyenne des messages
- Streaks, faits amusants, chouettes du soir, lève-tôt...
