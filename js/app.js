/**
 * Main app — file upload, worker orchestration, navigation, rendering.
 */

import { generateSlides } from './slides.js';
import { escapeHtml, fmt, fmtDate } from './utils.js';

const $ = (sel) => document.querySelector(sel);

const uploadScreen = $('#upload-screen');
const loadingScreen = $('#loading-screen');
const wrappedScreen = $('#wrapped-screen');
const slidesContainer = $('#slides-container');
const navDots = $('#nav-dots');
const fileInput = $('#file-input');
const dropZone = $('#drop-zone');
const loadingStatus = $('#loading-status');
const liveRegion = $('#a11y-live');

let currentSlide = 0;
let totalSlides = 0;
let slideElements = [];
let chartInitialized = {};
let currentStats = null;
let currentComparison = null;

// ========== Theme ==========
initTheme();

function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.dataset.theme = saved;
    const btn = $('#theme-toggle');
    if (btn) {
        updateThemeBtn(btn, saved);
        btn.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            localStorage.setItem('theme', next);
            updateThemeBtn(btn, next);
        });
    }
}

function updateThemeBtn(btn, theme) {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre');
    btn.setAttribute('title', theme === 'dark' ? 'Mode clair' : 'Mode sombre');
}

// ========== Screen ==========
function showScreen(screen) {
    [uploadScreen, loadingScreen, wrappedScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

function announce(msg) {
    if (liveRegion) liveRegion.textContent = msg;
}

// ========== Worker ==========
let worker = null;
function callWorker(text, year) {
    return new Promise((resolve, reject) => {
        if (!worker) worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        const onMsg = (e) => {
            if (e.data.kind === 'error') {
                worker.removeEventListener('message', onMsg);
                reject(new Error(e.data.message));
            } else {
                worker.removeEventListener('message', onMsg);
                resolve(e.data);
            }
        };
        worker.addEventListener('message', onMsg);
        worker.postMessage({ text, year });
    });
}

// ========== File handling ==========
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

async function handleFile(file) {
    showScreen(loadingScreen);
    announce('Analyse en cours');

    try {
        let text;
        if (file.name.endsWith('.zip')) {
            loadingStatus.textContent = 'Decompression...';
            await loadJSZip();
            const zip = await JSZip.loadAsync(file);
            const txtFile = Object.values(zip.files).find(f => f.name.endsWith('.txt'));
            if (!txtFile) throw new Error('Aucun fichier .txt trouvé dans le ZIP');
            text = await txtFile.async('string');
        } else {
            loadingStatus.textContent = 'Lecture du fichier...';
            text = await file.text();
        }

        loadingStatus.textContent = 'Analyse des messages...';
        const yearsInfo = await callWorker(text);
        if (yearsInfo.kind !== 'years') throw new Error('Reponse worker invalide');

        let selectedYear = null;
        if (yearsInfo.years.length > 1) {
            showScreen(uploadScreen);
            selectedYear = await pickYear(yearsInfo.years, yearsInfo.yearCounts);
            showScreen(loadingScreen);
        } else {
            selectedYear = yearsInfo.years[0];
        }

        loadingStatus.textContent = 'Calcul des stats...';
        const result = await callWorker(text, selectedYear);
        if (result.kind !== 'stats') throw new Error('Calcul echoue');

        currentStats = rehydrateDates(result.stats);
        currentComparison = result.comparison;

        loadingStatus.textContent = 'Generation du Wrapped...';
        const slides = generateSlides(currentStats, currentComparison);
        renderSlides(slides);
        buildSummary(currentStats);
        showScreen(wrappedScreen);
        announce(`${currentStats.totalMessages} messages analyses`);
    } catch (err) {
        console.error(err);
        alert('Erreur : ' + err.message);
        showScreen(uploadScreen);
    }
}

function loadJSZip() {
    if (window.JSZip) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
        s.integrity = 'sha384-4eSE39hu8XwfnceGGscd4yDDaIE0ijcKefHtCRhKwJjzxe1Bbl/ZFjsxtEsE1pcN';
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Impossible de charger JSZip'));
        document.head.appendChild(s);
    });
}

function rehydrateDates(stats) {
    stats.startDate = new Date(stats.startDate);
    stats.endDate = new Date(stats.endDate);
    if (stats.firstMessage?.datetime) stats.firstMessage.datetime = new Date(stats.firstMessage.datetime);
    if (stats.longestMessage?.datetime) stats.longestMessage.datetime = new Date(stats.longestMessage.datetime);
    if (stats.ghosting?.longest) {
        stats.ghosting.longest = stats.ghosting.longest.map(g => ({ ...g, when: new Date(g.when) }));
    }
    return stats;
}

// ========== Year picker ==========
function pickYear(years, yearCounts) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'year-picker-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Choisir une année');
        overlay.innerHTML = `
            <div class="year-picker">
                <h2>Quelle annee analyser ?</h2>
                <p style="color:var(--text-muted);margin-bottom:1.5rem;font-size:0.9rem;">Plusieurs annees detectees</p>
                <div class="year-options">
                    ${years.map(y => `
                        <button class="year-btn" data-year="${y}">
                            <span class="year-value">${y}</span>
                            <span class="year-count">${yearCounts[y].toLocaleString('fr-FR')} messages</span>
                        </button>`).join('')}
                    <button class="year-btn year-btn-all" data-year="all">
                        <span class="year-value">Toutes les annees</span>
                        <span class="year-count">${Object.values(yearCounts).reduce((a, b) => a + b, 0).toLocaleString('fr-FR')} messages</span>
                    </button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('active'));
        overlay.querySelectorAll('.year-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const raw = btn.dataset.year;
                overlay.remove();
                resolve(raw === 'all' ? null : parseInt(raw));
            });
        });
    });
}

// ========== Slide rendering ==========
function renderSlides(slides) {
    slidesContainer.innerHTML = '';
    navDots.innerHTML = '';
    slideElements = [];
    chartInitialized = {};
    totalSlides = slides.length;
    currentSlide = 0;

    slides.forEach((slide, i) => {
        const el = document.createElement('div');
        el.className = `slide ${slide.gradient} ${i === 0 ? 'active' : ''}`;
        el.innerHTML = slide.html;
        el.dataset.index = i;
        el.setAttribute('role', 'group');
        el.setAttribute('aria-label', `Slide ${i + 1} sur ${slides.length}`);
        el.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
        if (slide.chart) el._chartInit = slide.chart;
        slidesContainer.appendChild(el);
        slideElements.push(el);

        const dot = document.createElement('button');
        dot.className = `nav-dot ${i === 0 ? 'active' : ''}`;
        dot.setAttribute('aria-label', `Aller a la slide ${i + 1}`);
        dot.addEventListener('click', () => goToSlide(i));
        navDots.appendChild(dot);
    });

    const resetBtn = document.createElement('button');
    resetBtn.className = 'reset-btn';
    resetBtn.textContent = 'Nouvelle analyse';
    resetBtn.setAttribute('aria-label', 'Analyser un autre fichier');
    resetBtn.addEventListener('click', () => {
        history.replaceState(null, '', window.location.pathname);
        location.reload();
    });
    wrappedScreen.appendChild(resetBtn);

    const lastSlide = slideElements[slideElements.length - 1];
    const analyserBtn = lastSlide.querySelector('.file-btn');
    if (analyserBtn) {
        const shareBtn = document.createElement('button');
        shareBtn.className = 'file-btn';
        shareBtn.style.cssText = 'margin-top:1rem; margin-right:0.75rem; background:var(--accent-purple);';
        shareBtn.textContent = 'Partager';
        shareBtn.addEventListener('click', () => {
            if (!currentStats) return;
            copyToClipboard(buildShareURL(currentStats));
        });
        analyserBtn.parentNode.insertBefore(shareBtn, analyserBtn);
    }

    initChartForSlide(0);
    updateCounter(0);
    setupNavigation();
}

function updateCounter(index) {
    const counter = $('#slide-counter');
    if (counter) counter.textContent = `${index + 1} / ${totalSlides}`;
}

function initChartForSlide(index) {
    if (chartInitialized[index]) return;
    const el = slideElements[index];
    if (!el || !el._chartInit) return;
    const canvas = el.querySelector('canvas');
    if (canvas) {
        el._chartInit(canvas.getContext('2d'), el);
        chartInitialized[index] = true;
    }
}

let isAnimating = false;
function goToSlide(index) {
    if (index < 0 || index >= totalSlides || index === currentSlide || isAnimating) return;
    isAnimating = true;

    const goingForward = index > currentSlide;
    const oldSlide = slideElements[currentSlide];
    const newSlide = slideElements[index];

    newSlide.style.transition = 'none';
    newSlide.style.transform = goingForward ? 'translateX(100%)' : 'translateX(-100%)';
    newSlide.style.opacity = '1';
    newSlide.classList.add('active');
    newSlide.setAttribute('aria-hidden', 'false');
    newSlide.offsetHeight;

    newSlide.style.transition = '';
    newSlide.style.transform = 'translateX(0)';
    oldSlide.style.transform = goingForward ? 'translateX(-100%)' : 'translateX(100%)';
    oldSlide.style.opacity = '0';
    oldSlide.setAttribute('aria-hidden', 'true');

    setTimeout(() => {
        oldSlide.classList.remove('active');
        oldSlide.style.transform = '';
        oldSlide.style.opacity = '';
        oldSlide.style.transition = '';
        currentSlide = index;
        isAnimating = false;
    }, 500);

    navDots.querySelectorAll('.nav-dot').forEach((dot, i) => dot.classList.toggle('active', i === index));
    updateCounter(index);
    initChartForSlide(index);
    announce(`Slide ${index + 1} sur ${totalSlides}`);
    const hint = $('#swipe-hint');
    if (hint) hint.style.display = 'none';
}

function setupNavigation() {
    $('#nav-prev').addEventListener('click', () => goToSlide(currentSlide - 1));
    $('#nav-next').addEventListener('click', () => goToSlide(currentSlide + 1));
    document.addEventListener('keydown', (e) => {
        if (!wrappedScreen.classList.contains('active')) return;
        if (e.target.closest('input, textarea, button[data-filter]')) return;
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goToSlide(currentSlide + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goToSlide(currentSlide - 1); }
        else if (e.key === 'Home') { e.preventDefault(); goToSlide(0); }
        else if (e.key === 'End') { e.preventDefault(); goToSlide(totalSlides - 1); }
    });

    let touchStartX = 0, touchStartY = 0;
    slidesContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });
    slidesContainer.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
            if (dx < 0) goToSlide(currentSlide + 1);
            else goToSlide(currentSlide - 1);
        }
    }, { passive: true });

    let wheelTimeout;
    slidesContainer.addEventListener('wheel', (e) => {
        if (wheelTimeout) return;
        wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 800);
        if (e.deltaY > 30) goToSlide(currentSlide + 1);
        else if (e.deltaY < -30) goToSlide(currentSlide - 1);
    }, { passive: true });
}

// ========== Summary ==========
const summaryOverlay = $('#summary-overlay');
const summaryContent = $('#summary-content');
$('#summary-btn').addEventListener('click', () => summaryOverlay.classList.add('active'));
$('#summary-close').addEventListener('click', () => summaryOverlay.classList.remove('active'));
summaryOverlay.addEventListener('click', (e) => { if (e.target === summaryOverlay) summaryOverlay.classList.remove('active'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') summaryOverlay.classList.remove('active'); });

function buildSummary(stats) {
    let html = `
        <section class="summary-section">
            <h3>Vue d'ensemble</h3>
            <table class="summary-table">
                <tr><td>Periode</td><td>${fmtDate(stats.startDate)} — ${fmtDate(stats.endDate)}</td></tr>
                <tr><td>Duree</td><td>${stats.totalDays} jours</td></tr>
                <tr><td>Participants</td><td>${stats.participants}</td></tr>
                <tr><td>Total messages</td><td>${fmt(stats.totalMessages)}</td></tr>
                <tr><td>Moyenne / jour</td><td>${stats.avgPerDay}</td></tr>
                <tr><td>Total caracteres</td><td>${fmt(stats.totalChars)}</td></tr>
                <tr><td>Longueur moy. message</td><td>${stats.avgMsgLen} car.</td></tr>
                <tr><td>Medias partages</td><td>${fmt(stats.totalMedia)}</td></tr>
                <tr><td>Liens partages</td><td>${fmt(stats.totalLinks)}</td></tr>
                <tr><td>Messages modifies</td><td>${fmt(stats.totalEdited)}</td></tr>
                <tr><td>Emojis envoyes</td><td>${fmt(stats.emojis.total)} (${stats.emojis.unique} differents)</td></tr>
                <tr><td>Reactions</td><td>${fmt(stats.reactions?.total || 0)}</td></tr>
                <tr><td>Grands silences (&gt;24h)</td><td>${fmt(stats.ghosting?.count || 0)}</td></tr>
                <tr><td>Meilleur streak</td><td>${stats.streak.max} jours consecutifs</td></tr>
                <tr><td>Langue detectee</td><td>${(stats.lang || 'fr').toUpperCase()}</td></tr>
            </table>
        </section>
        <section class="summary-section">
            <h3>Classement</h3>
            <table class="summary-table summary-table-full">
                <thead><tr><th>#</th><th>Nom</th><th>Messages</th><th>%</th><th>Moy. car.</th><th>Medias</th><th>Emojis</th></tr></thead>
                <tbody>${stats.ranking.map(([name, d], i) => {
                    const em = stats.emojis.perPerson.find(e => e[0] === name)?.[1] || 0;
                    return `<tr><td>${i + 1}</td><td>${escapeHtml(name)}</td><td>${fmt(d.count)}</td><td>${d.percent}%</td><td>${d.avgLen}</td><td>${d.media}</td><td>${fmt(em)}</td></tr>`;
                }).join('')}</tbody>
            </table>
        </section>`;

    if (stats.compatibility) {
        const c = stats.compatibility;
        html += `<section class="summary-section"><h3>Compatibilite</h3><table class="summary-table"><tr><td>Score</td><td>${c.score}/100</td></tr><tr><td>Longueurs similaires</td><td>${c.components.lengthSimilarity}</td></tr><tr><td>Equilibre</td><td>${c.components.volumeBalance}</td></tr><tr><td>Reciprocite</td><td>${c.components.reciprocity}</td></tr><tr><td>Regularite</td><td>${c.components.consistency}</td></tr></table></section>`;
    }

    summaryContent.innerHTML = html;
}

// ========== Sharing ==========
function serializeStats(stats) {
    const s = JSON.parse(JSON.stringify(stats));
    s.startDate = stats.startDate.toISOString();
    s.endDate = stats.endDate.toISOString();
    if (s.firstMessage?.datetime) s.firstMessage.datetime = stats.firstMessage.datetime.toISOString();
    if (s.longestMessage?.datetime) s.longestMessage.datetime = stats.longestMessage.datetime.toISOString();
    delete s.daily;
    if (s.ghosting?.longest) s.ghosting.longest = s.ghosting.longest.map(g => ({ ...g, when: new Date(g.when).toISOString() }));
    return s;
}

function buildShareURL(stats) {
    const payload = { s: serializeStats(stats), c: currentComparison };
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
    return window.location.origin + window.location.pathname + '#share=' + compressed;
}

function showToast(message) {
    const toast = $('#share-toast');
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showToast('Lien copie !')).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Lien copie !');
    });
}

function tryLoadFromURL() {
    const hash = window.location.hash;
    if (!hash.startsWith('#share=')) return false;
    try {
        const json = LZString.decompressFromEncodedURIComponent(hash.slice('#share='.length));
        if (!json) return false;
        const payload = JSON.parse(json);
        const stats = rehydrateDates(payload.s);
        currentStats = stats;
        currentComparison = payload.c || null;
        const slides = generateSlides(stats, currentComparison);
        renderSlides(slides);
        buildSummary(stats);
        showScreen(wrappedScreen);
        return true;
    } catch (e) {
        console.error('Failed to load shared data:', e);
        return false;
    }
}

tryLoadFromURL();
