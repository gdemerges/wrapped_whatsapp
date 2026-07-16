/**
 * Cache-first service worker for the app shell + pinned CDN scripts.
 * The CDN scripts are version-pinned in their URL (chart.js@4.4.7, etc.),
 * so caching them forever is safe — a version bump means a new URL, which
 * is treated as a cache miss and fetched fresh.
 * ML model weights (huggingface.co) are intentionally left alone: they're
 * multi-hundred-MB and already cached internally by @huggingface/transformers.
 */
const CACHE_NAME = 'ww-shell-v1';

const SHELL_ASSETS = [
    'index.html',
    'dashboard.html',
    'manifest.json',
    'favicon.svg',
    'css/style.css',
    'css/dashboard.css',
    'js/app.js',
    'js/dashboard.js',
    'js/worker.js',
    'js/parser.js',
    'js/stats.js',
    'js/payload.js',
    'js/cache.js',
    'js/utils.js',
    'js/slides/index.js',
    'js/slides/_constants.js',
    'js/slides/_helpers.js',
    'js/slides/overview.js',
    'js/slides/ranking.js',
    'js/slides/time.js',
    'js/slides/words.js',
    'js/slides/emojis.js',
    'js/slides/media.js',
    'js/slides/relationships.js',
    'js/slides/sentiment.js',
    'js/slides/duo.js',
    'js/lang/stopwords.js',
    'js/lang/sentiment.js',
    'js/worker/sentiment-ml.js',
    'js/worker/sentiment-config.js',
    'js/worker/sentiment-aggregates.js',
];

const CDN_ASSETS = [
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js',
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll([...SHELL_ASSETS, ...CDN_ASSETS]))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    // Never intercept the ML models / HF API — huge, already cached by transformers.js.
    if (url.hostname === 'huggingface.co') return;

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return response;
            });
        })
    );
});
