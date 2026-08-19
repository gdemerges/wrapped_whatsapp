# WhatsApp Wrapped

Analyse tes conversations WhatsApp et génère une présentation animée à la façon Spotify Wrapped — directement dans ton navigateur, sans aucun envoi de données.

## Fonctionnalités

- **Analyse complète** : messages, médias, emojis, mots, temps de réponse, liens partagés…
- **Récit en chapitres** : détection automatique des périodes où le rythme de la conversation a changé
- **Profils** : une carte d'identité par participant (heure fétiche, emoji signature, mot exclusif, site favori)
- **Graphe d'interactions** : qui répond à qui, en diagramme d'accords
- **~30 slides animées** : classements, graphiques, heatmaps, anecdotes
- **Lecture automatique** : mode story avec barre de progression, comme sur Instagram
- **Export image** : chaque slide s'enregistre en PNG 1080×1920, prêt à publier
- **Anonymisation** : les prénoms peuvent être remplacés par des initiales avant tout partage
- **Période libre** : une année, tout l'historique, ou une plage de dates au choix
- **Dashboard** : vue tableau détaillée, filtre par participant, export CSV / JSON
- **Analyse de sentiment** : par emojis et vocabulaire par défaut, par IA locale en option
- **100% client-side** : aucune donnée n'est envoyée à un serveur
- **Multi-format** : exports iOS et Android, en français, anglais, espagnol et allemand

## Utilisation

### 1. Exporter ta conversation WhatsApp

Dans WhatsApp :
- Ouvre la conversation ou le groupe
- Appuie sur les **trois points** (Android) ou le nom du contact (iOS)
- **Exporter la discussion** → **Sans les médias**

### 2. Charger le fichier

Glisse le fichier `.txt` ou `.zip` dans la zone d'upload, puis choisis la période à analyser.

Pas de fichier sous la main ? Le bouton **« Voir un exemple »** (ou l'URL `index.html#demo`)
génère une conversation fictive pour explorer le site.

### 3. Explorer les résultats

| Action | Comment |
|---|---|
| Slide suivante / précédente | flèches à l'écran, **← →**, swipe, molette |
| Première / dernière slide | **Début** / **Fin** |
| Lecture automatique | **Espace**, ou le bouton *Lecture auto* |
| Aller à une slide | clic sur la barre de progression en haut |
| Partager | bouton *Partager* : image de la slide, image du récap, ou lien |

## Vie privée

Rien ne quitte l'appareil : le fichier est lu, parsé et analysé dans un Web Worker, et les
résultats sont mis en cache dans IndexedDB.

Deux nuances à connaître :

- **Le partage par lien** encode les statistiques dans le fragment d'URL. Un fragment n'est
  jamais transmis au serveur, mais il finit dans l'historique du navigateur et dans les logs
  de l'application où il est collé. L'anonymisation des prénoms est donc activée par défaut
  pour les liens.
- **L'analyse de sentiment par IA** est optionnelle et désactivée par défaut : l'activer
  télécharge les modèles depuis un CDN (~50 Mo). Sans elle, l'ambiance est déduite localement
  des réactions emoji et d'un lexique — aucun téléchargement.

## Lancer en local

Aucun outil de build nécessaire. Il suffit d'un serveur web statique :

```bash
python -m http.server 8000    # ou : npx http-server
```

Puis ouvre [http://localhost:8000](http://localhost:8000).

```bash
npm test          # Vitest
npm run lint      # ESLint
npm run typecheck # tsc --noEmit sur les modules typés en JSDoc
```

## Structure du projet

```
site/
├── index.html / dashboard.html
├── sw.js                  # service worker (stale-while-revalidate)
├── fonts/                 # Space Grotesk auto-hébergé (OFL)
├── icons/                 # icônes PWA, dont une variante maskable
├── css/
└── js/
    ├── app.js             # orchestration : import, worker, écrans
    ├── deck.js            # navigation entre slides, mode story
    ├── worker.js          # parse + stats + cache, hors du thread principal
    ├── parser.js          # parseur des exports WhatsApp
    ├── stats.js           # calcul des statistiques
    ├── export-image.js    # rendu canvas des images partageables
    ├── anonymize.js       # remplacement des prénoms par des initiales
    ├── demo.js            # conversation d'exemple générée
    ├── vendor.js          # chargement paresseux des scripts CDN
    ├── slides/            # une slide par fichier
    └── ui/                # dialogues, toasts, partage, URL
```

## Stack technique

- **Vanilla JS / HTML / CSS** — pas de framework, pas d'étape de build
- **[Chart.js](https://www.chartjs.org/)**, **[LZ-String](https://pieroxy.net/blog/pages/lz-string/index.html)**, **[JSZip](https://stuk.github.io/jszip/)** — chargés à la demande depuis un CDN, épinglés par version et vérifiés par SRI
- **[transformers.js](https://huggingface.co/docs/transformers.js)** — uniquement si l'analyse IA est activée
- **Space Grotesk** — auto-hébergée, aucune requête vers Google Fonts

## Formats de chat supportés

| Format | Exemple |
|--------|---------|
| iOS | `[12/03/2024, 14:30:00] Alice: Bonjour` |
| Android | `12/03/2024, 14:30 - Alice: Bonjour` |
| Android US | `03/12/24, 2:30 PM - Alice: Hello` |
| Android DE | `12.03.2024, 14.30 - Anna: Hallo` |

L'ordre jour/mois est déduit du fichier entier, pas du séparateur : un export européen avec
année sur deux chiffres (`12/03/24`) n'est plus lu comme du mois-en-premier.
