/**
 * App orchestration: file intake, worker plumbing, screens.
 *
 * The deck itself lives in deck.js, dialogs in ui/, sharing in ui/share.js —
 * this file only decides *what* happens, not how it looks.
 */

import { generateSlides } from './slides/index.js';
import { serializeStats, rehydrateDates, sanitizeShared } from './payload.js';
import { Deck, bindNavigation } from './deck.js';
import { pickPeriod } from './ui/period.js';
import { openShareSheet } from './ui/share.js';
import { showToast, showError, announce } from './ui/toast.js';
import { readHash, clearHash } from './ui/hash.js';
import { ensureJSZip, ensureLZString, preload } from './vendor.js';
import { buildDemoBlob } from './demo.js';
import { escapeHtml } from './utils.js';
import { TIP_JAR_URL } from './config.js';
import { track, trackPageview, isEnabled as analyticsEnabled, isOptedOut, setOptOut } from './analytics.js';

const $ = (sel) => document.querySelector(sel);

const screens = {
    upload: $('#upload-screen'),
    loading: $('#loading-screen'),
    error: $('#error-screen'),
    wrapped: $('#wrapped-screen'),
};
const fileInput = $('#file-input');
const dropZone = $('#drop-zone');
const loadingStatus = $('#loading-status');
const aiToggle = $('#ai-toggle');

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const AI_KEY = 'ww-use-ai';
const SESSION_KEY = 'ww-stats';

/** @type {{ stats: any, comparison: any, slides: any[] } | null} */
let session = null;
let period = { year: null, range: null };
let periodOptions = null; // { years, yearCounts, bounds }

const deck = new Deck({
    container: $('#slides-container'),
    counter: $('#slide-counter'),
    progress: $('#story-progress'),
    onSlideChange: () => {
        const hint = $('#swipe-hint');
        if (hint) hint.style.display = 'none';
    },
});

// ========== Service worker ==========
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[sw] registration failed:', err));
    });
}

// ========== Theme ==========
initTheme();
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.dataset.theme = saved;
    const btn = $('#theme-toggle');
    if (!btn) return;
    labelThemeBtn(btn, saved);
    btn.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('theme', next);
        labelThemeBtn(btn, next);
        // Charts are painted on canvas and cannot follow a CSS variable.
        deck.retint();
    });
}

function labelThemeBtn(btn, theme) {
    const label = theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', theme === 'dark' ? 'Mode clair' : 'Mode sombre');
}

// ========== AI toggle ==========
if (aiToggle) {
    aiToggle.checked = localStorage.getItem(AI_KEY) === 'true';
    aiToggle.addEventListener('change', () => {
        localStorage.setItem(AI_KEY, String(aiToggle.checked));
    });
}
const useAI = () => localStorage.getItem(AI_KEY) === 'true';

// ========== Screens ==========
function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) el.classList.toggle('active', key === name);
}

// ========== Worker ==========
let worker = null;

function getWorker() {
    if (!worker) worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    return worker;
}

/**
 * One request/response round-trip. Progress messages are streamed to the
 * loading screen; the first non-progress message settles the promise.
 */
function callWorker(message, transfer = []) {
    return new Promise((resolve, reject) => {
        const w = getWorker();
        const onMessage = (e) => {
            if (e.data.kind === 'progress') {
                loadingStatus.textContent = e.data.text;
                return;
            }
            w.removeEventListener('message', onMessage);
            w.removeEventListener('error', onError);
            if (e.data.kind === 'error') {
                const err = new Error(e.data.message);
                err.diagnostics = e.data.diagnostics;
                reject(err);
            } else {
                resolve(e.data);
            }
        };
        const onError = (e) => {
            w.removeEventListener('message', onMessage);
            w.removeEventListener('error', onError);
            reject(new Error(e.message || 'Le calcul a échoué'));
        };
        w.addEventListener('message', onMessage);
        w.addEventListener('error', onError);
        w.postMessage(message, transfer);
    });
}

// ========== File intake ==========
fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
});
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return;
    if (!screens.upload.classList.contains('active')) return;
    dragDepth++;
    document.body.classList.add('dragging-file');
});
window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) document.body.classList.remove('dragging-file');
});
window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
});
window.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    if (!screens.upload.classList.contains('active')) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging-file');
    if (!dropZone.contains(e.target)) handleFile(e.dataTransfer.files[0]);
});

$('#demo-btn').addEventListener('click', () => runDemo());
$('#error-demo').addEventListener('click', () => runDemo());
$('#error-retry').addEventListener('click', () => {
    showScreen('upload');
    fileInput.value = '';
    fileInput.click();
});

function runDemo() {
    showToast('Conversation d\'exemple — données fictives');
    handleBlob(buildDemoBlob(), { demo: true });
}

async function handleFile(file) {
    if (file.size > MAX_FILE_SIZE) {
        showFatal(`Fichier trop volumineux (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} Mo).`);
        return;
    }
    if (!/\.(txt|zip)$/i.test(file.name)) {
        showFatal('Formats acceptés : .txt et .zip (l\'export WhatsApp, tel quel).');
        return;
    }

    showScreen('loading');
    try {
        const blob = file.name.toLowerCase().endsWith('.zip') ? await unzip(file) : file;
        await handleBlob(blob);
    } catch (err) {
        console.error(err);
        showFatal(err.message, err.diagnostics);
    }
}

async function handleBlob(blob, { demo = false } = {}) {
    showScreen('loading');
    announce('Analyse en cours');
    // Likely needed within seconds; warmed here so the first chart slide and
    // the first share don't pay for the round-trip.
    preload('chart');

    try {
        const info = await callWorker({ kind: 'load', blob });
        if (info.kind !== 'years') throw new Error('Réponse worker invalide');

        periodOptions = { years: info.years, yearCounts: info.yearCounts, bounds: info.bounds };
        period = { year: info.years.length === 1 ? info.years[0] : null, range: null };

        if (info.years.length > 1 && !demo) {
            showScreen('upload');
            const chosen = await pickPeriod({ ...periodOptions, current: period });
            if (chosen === undefined) { showScreen('upload'); return; } // cancelled
            period = chosen;
        }

        await computeAndShow();
    } catch (err) {
        console.error(err);
        showFatal(err.message, err.diagnostics);
    }
}

async function computeAndShow() {
    showScreen('loading');
    loadingStatus.textContent = 'Calcul des stats...';
    const result = await callWorker({ kind: 'stats', year: period.year, range: period.range, ai: useAI() });
    if (result.kind !== 'stats') throw new Error('Calcul échoué');

    sessionStorage.removeItem(SESSION_KEY); // drop stats from a previous analysis
    present(rehydrateDates(result.stats), result.comparison);
    // Only *that* an analysis happened, never anything about the conversation.
    track('analysis', { ai: useAI(), period: period.range ? 'range' : (period.year == null ? 'all' : 'year') });
}

async function unzip(file) {
    loadingStatus.textContent = 'Décompression...';
    await ensureJSZip();
    const zip = await window.JSZip.loadAsync(file);
    const entry = Object.values(zip.files).find(f => !f.dir && f.name.toLowerCase().endsWith('.txt'));
    if (!entry) throw new Error('Aucun fichier .txt trouvé dans le ZIP.');

    // The 50 MB cap applies to the *compressed* file; a small zip can inflate
    // to gigabytes. Check the declared size first, then the real one.
    const declared = entry._data?.uncompressedSize;
    if (typeof declared === 'number' && declared > MAX_FILE_SIZE) {
        throw new Error(`Fichier décompressé trop volumineux (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} Mo).`);
    }
    const blob = await entry.async('blob', (meta) => {
        loadingStatus.textContent = `Décompression... ${Math.round(meta.percent)}%`;
    });
    if (blob.size > MAX_FILE_SIZE) {
        throw new Error(`Fichier décompressé trop volumineux (max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} Mo).`);
    }
    return blob;
}

// ========== Presentation ==========
function present(stats, comparison) {
    const slides = generateSlides(stats, comparison);
    session = { stats, comparison, slides };
    deck.mount(slides);
    wireRecapActions();
    updatePeriodButton();
    showScreen('wrapped');
    announce(`${stats.totalMessages} messages analysés`);
}

/** The last slide offers the same actions as the toolbar, at thumb height. */
function wireRecapActions() {
    const host = deck.refs.container.querySelector('.recap-actions');
    if (!host) return;
    host.innerHTML = '';

    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'file-btn';
    share.textContent = 'Partager';
    share.addEventListener('click', openShare);

    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'ghost-btn';
    again.textContent = 'Analyser une autre conversation';
    again.addEventListener('click', resetAll);

    host.append(share, again);
}

function updatePeriodButton() {
    const btn = $('#period-btn');
    const label = $('#period-label');
    // Shown whenever a file is loaded — even a single-year chat can be sliced
    // into a custom range. Hidden only for a deck restored from a share link,
    // where there is no source file to re-slice.
    if (!periodOptions) {
        btn.hidden = true;
        return;
    }
    btn.hidden = false;
    label.textContent = period.range
        ? `${period.range.from.slice(0, 10)} → ${period.range.to.slice(0, 10)}`
        : (period.year == null ? 'Toutes les années' : String(period.year));
}

// ========== Toolbar ==========
$('#nav-prev').addEventListener('click', () => { deck.stopStory(); deck.prev(); });
$('#nav-next').addEventListener('click', () => { deck.stopStory(); deck.next(); });
bindNavigation(deck, () => screens.wrapped.classList.contains('active'));

$('#story-toggle').addEventListener('click', (e) => {
    const playing = deck.toggleStory();
    const btn = e.currentTarget;
    btn.setAttribute('aria-pressed', String(playing));
    btn.querySelector('span[aria-hidden]').textContent = playing ? '❚❚' : '▶';
    btn.querySelector('.toolbar-label').textContent = playing ? 'Pause' : 'Lecture auto';
});

$('#period-btn').addEventListener('click', async () => {
    if (!periodOptions) return;
    deck.stopStory();
    const chosen = await pickPeriod({ ...periodOptions, current: period });
    if (chosen === undefined) return;
    if (chosen.year === period.year && sameRange(chosen.range, period.range)) return;
    period = chosen;
    try {
        await computeAndShow();
    } catch (err) {
        console.error(err);
        showError(err.message);
        showScreen('wrapped');
    }
});

$('#share-btn').addEventListener('click', openShare);

function openShare() {
    if (!session) return;
    deck.stopStory();
    const recap = session.slides[session.slides.length - 1]?.card || null;
    openShareSheet({
        stats: session.stats,
        comparison: session.comparison,
        card: deck.current?.card || null,
        recapCard: recap,
    });
}

$('#reset-btn').addEventListener('click', resetAll);

function resetAll() {
    clearHash();
    sessionStorage.removeItem(SESSION_KEY);
    deck.clear();
    getWorker().postMessage({ kind: 'reset' });
    session = null;
    period = { year: null, range: null };
    periodOptions = null;
    fileInput.value = '';
    showScreen('upload');
}

// ========== Dashboard hand-off ==========
$('#summary-btn').addEventListener('click', () => {
    if (!session) return;
    track('dashboard');
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
            stats: serializeStats(session.stats),
            comparison: session.comparison,
        }));
    } catch (err) {
        console.error('Failed to save stats:', err);
        showError('Impossible d\'ouvrir le dashboard (stockage plein ?)');
        return;
    }
    window.location.href = 'dashboard.html';
});

// ========== Errors ==========
/**
 * A parse failure used to be a 4-second red toast. Now it gets a screen that
 * says what was actually read, so the user can tell a wrong file from an
 * unsupported format — and report the latter.
 */
function showFatal(message, diagnostics = null) {
    track('parse_error', { detected: Boolean(diagnostics?.detected) });
    $('#error-message').textContent = message;
    const box = $('#error-diagnostics');

    if (diagnostics) {
        const samples = diagnostics.samples.length
            ? `<p class="diag-label">Premières lignes non reconnues (contenu masqué) :</p>
               <ul class="diag-samples">${diagnostics.samples.map(s => `<li><code>${escapeHtml(s)}</code></li>`).join('')}</ul>`
            : '';
        box.innerHTML = `
            <dl class="diag-grid">
                <div><dt>Lignes lues</dt><dd>${diagnostics.totalLines.toLocaleString('fr-FR')}</dd></div>
                <div><dt>Format détecté</dt><dd>${diagnostics.detected ? 'oui' : 'non'}</dd></div>
                <div><dt>Lignes reconnues</dt><dd>${diagnostics.matched}</dd></div>
            </dl>
            ${samples}`;
        box.hidden = false;
    } else {
        box.hidden = true;
        box.innerHTML = '';
    }

    announce(`Erreur : ${message}`);
    showScreen('error');
}

// ========== Restore from URL / session ==========
async function restore() {
    // #demo is the manifest shortcut target, and a stable entry point for
    // linking someone straight to a working example.
    if (window.location.hash === '#demo') {
        runDemo();
        return true;
    }
    const { share } = readHash();
    if (share) {
        try {
            await ensureLZString();
            const json = window.LZString.decompressFromEncodedURIComponent(share);
            if (json) {
                const payload = sanitizeShared(JSON.parse(json));
                present(rehydrateDates(payload.s), payload.c || null);
                return true;
            }
        } catch (err) {
            console.error('Failed to load shared data:', err);
            showToast('Ce lien de partage est illisible', { error: true });
        }
    }
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) {
            const payload = JSON.parse(raw);
            present(rehydrateDates(payload.stats), payload.comparison || null);
            return true;
        }
    } catch (err) {
        console.error('Failed to load from session:', err);
    }
    return false;
}

renderPrivacyNote();
renderTipJar();
trackPageview();
restore();

/**
 * The note has to stay true in both states: claiming "rien n'est envoyé à un
 * serveur" while a usage counter is running would be a lie, so the sentence
 * about the counter appears exactly when the counter does.
 */
function renderPrivacyNote() {
    const note = $('.privacy-note');
    if (!note) return;

    const base = 'Tes données restent sur ton appareil. Ta conversation n\'est jamais envoyée : '
        + 'elle est lue et analysée dans ce navigateur.';

    if (!analyticsEnabled() && !isOptedOut()) {
        note.textContent = base;
        return;
    }
    note.textContent = '';
    note.append(base + ' ');

    const extra = document.createElement('span');
    extra.className = 'privacy-note-extra';
    if (isOptedOut()) {
        extra.append('Mesure d\'audience désactivée. ');
        extra.append(makeToggle('Réactiver', false));
    } else {
        extra.append('Un compteur anonyme enregistre les fonctionnalités utilisées — jamais le contenu de tes messages. ');
        extra.append(makeToggle('Ne pas participer', true));
    }
    note.append(extra);
}

function makeToggle(label, optOut) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
        setOptOut(optOut);
        renderPrivacyNote();
        showToast(optOut ? 'Mesure d\'audience désactivée' : 'Mesure d\'audience réactivée');
    });
    return btn;
}

/** Support links appear only once a tip jar URL is configured. */
function renderTipJar() {
    if (!TIP_JAR_URL) return;
    const host = $('.upload-container');
    if (!host) return;
    const link = document.createElement('a');
    link.className = 'tip-link';
    link.href = TIP_JAR_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '☕ Ce site est gratuit — offrir un café';
    link.addEventListener('click', () => track('tip_jar'));
    host.appendChild(link);
}

function sameRange(a, b) {
    if (!a || !b) return a === b;
    return a.from === b.from && a.to === b.to;
}
