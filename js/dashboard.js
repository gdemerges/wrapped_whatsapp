/**
 * Dashboard page — renders a full data view from stats produced by the main app.
 * Data source (in order): sessionStorage 'ww-stats' → URL #share=<lzstring>.
 */

import { escapeHtml, fmt, fmtDate, DAYS_FR } from './utils.js';
import { rehydrateDates, sanitizeShared } from './payload.js';
import { ensureLZString } from './vendor.js';
import { openShareSheet } from './ui/share.js';
import { showToast, showError } from './ui/toast.js';
import { downloadBlob } from './export-image.js';
import { readHash } from './ui/hash.js';

function fmtClock(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const STORAGE_KEY = 'ww-stats';
const $ = (sel) => document.querySelector(sel);
const content = $('#dash-content');

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[sw] registration failed:', err));
    });
}

// ---------- Theme ----------
initTheme();
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.dataset.theme = saved;
    const btn = $('#theme-toggle');
    if (!btn) return;
    applyLabel(btn, saved);
    btn.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('theme', next);
        applyLabel(btn, next);
    });
}
function applyLabel(btn, theme) {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre');
    btn.setAttribute('title', theme === 'dark' ? 'Mode clair' : 'Mode sombre');
}

// ---------- Load ----------
/** @type {{ stats: any, comparison: any } | null} */
let current = null;

boot();

async function boot() {
    const payload = await loadPayload();
    if (!payload) return; // the empty state already in the HTML stands
    const stats = rehydrateDates(payload.stats);
    current = { stats, comparison: payload.comparison || null };
    render(stats, current.comparison);
    wireToolbar();
}

async function loadPayload() {
    const { share } = readHash();
    if (share) {
        try {
            await ensureLZString();
            const json = window.LZString.decompressFromEncodedURIComponent(share);
            if (json) {
                const p = sanitizeShared(JSON.parse(json));
                return { stats: p.s, comparison: p.c };
            }
        } catch (e) {
            console.error(e);
            showError('Ce lien de partage est illisible');
        }
    }
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) { console.error(e); }
    return null;
}

// ---------- Render ----------
function render(stats, comparison) {
    const sections = [];
    sections.push(heroCard(stats));
    if (comparison) sections.push(comparisonCard(comparison));
    sections.push(overviewCard(stats));
    sections.push(rankingCard(stats));
    if (stats.chapters?.length) sections.push(chaptersCard(stats));
    if (stats.profiles?.length) sections.push(profilesCard(stats));
    if (stats.interactions?.pairs?.length) sections.push(interactionsCard(stats));
    if (stats.topDomains?.length) sections.push(domainsCard(stats));
    sections.push(activityCard(stats));
    sections.push(emojisCard(stats));
    if (stats.reactions?.total) sections.push(reactionsCard(stats));
    sections.push(wordsCard(stats));
    if (stats.uniqueWordsPerPerson && Object.keys(stats.uniqueWordsPerPerson).length) {
        sections.push(signatureCard(stats));
    }
    if (stats.ghosting?.count) sections.push(ghostingCard(stats));
    if (stats.initiator?.length) sections.push(initiatorCard(stats));
    if (stats.sentiment) sections.push(sentimentCard(stats));
    if (stats.responseStats) sections.push(responseCard(stats));
    if (stats.compatibility) sections.push(compatibilityCard(stats));
    sections.push(funFactsCard(stats));

    content.innerHTML = sections.filter(Boolean).join('');
    populatePersonFilter(stats);
}

// ---------- New cards ----------

const CHAPTER_LABEL = { high: 'Période intense', steady: 'Rythme de croisière', low: 'Période calme' };

function monthName(key) {
    const [y, m] = key.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

function chaptersCard(s) {
    const rows = s.chapters.map((c, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(CHAPTER_LABEL[c.intensity] || c.intensity)}</td>
            <td>${monthName(c.from)} → ${monthName(c.to)}</td>
            <td>${fmt(c.total)}</td>
            <td>${fmt(c.avgPerMonth)}</td>
        </tr>`).join('');
    return `
    <section class="dash-card col-12">
        <h2>Chapitres <span class="dash-meta">les phases où le rythme a changé</span></h2>
        <table class="dash-table">
            <thead><tr><th>#</th><th>Phase</th><th>Période</th><th>Messages</th><th>/ mois</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </section>`;
}

function profilesCard(s) {
    const rows = s.profiles.map(p => `
        <tr data-person="${escapeHtml(p.name)}">
            <td>${escapeHtml(p.name)}</td>
            <td>${fmt(p.count)}</td>
            <td>${p.peakHour}h</td>
            <td>${p.topEmoji ? escapeHtml(p.topEmoji[0]) : '—'}</td>
            <td>${p.signatureWord ? escapeHtml(p.signatureWord[0]) : '—'}</td>
            <td>${p.topDomain ? escapeHtml(p.topDomain[0]) : '—'}</td>
            <td>${fmt(p.initiations)}</td>
        </tr>`).join('');
    return `
    <section class="dash-card col-12">
        <h2>Profils</h2>
        <table class="dash-table">
            <thead><tr><th>Personne</th><th>Messages</th><th>Heure</th><th>Emoji</th><th>Mot</th><th>Site</th><th>Jours lancés</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </section>`;
}

function interactionsCard(s) {
    const pairs = s.interactions.pairs.slice(0, 10).map(p => `
        <tr data-person="${escapeHtml(p.a)}" data-person-b="${escapeHtml(p.b)}">
            <td>${escapeHtml(p.a)} ↔ ${escapeHtml(p.b)}</td>
            <td>${fmt(p.count)}</td>
        </tr>`).join('');
    const closest = Object.entries(s.interactions.closest || {}).map(([who, target]) => `
        <tr data-person="${escapeHtml(who)}"><td>${escapeHtml(who)}</td><td>${escapeHtml(target.author)}</td><td>${fmt(target.count)}</td></tr>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>Qui parle à qui <span class="dash-meta">réponses échangées</span></h2>
        <table class="dash-table"><tbody>${pairs}</tbody></table>
        <h4 class="dash-subheading">Interlocuteur privilégié</h4>
        <table class="dash-table">
            <thead><tr><th>Personne</th><th>Répond surtout à</th><th>Fois</th></tr></thead>
            <tbody>${closest}</tbody>
        </table>
    </section>`;
}

function domainsCard(s) {
    const rows = s.topDomains.map(([domain, count]) =>
        `<tr><td>${escapeHtml(domain)}</td><td>${fmt(count)}</td></tr>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>Sites partagés <span class="dash-meta">${fmt(s.totalLinks)} liens</span></h2>
        <table class="dash-table"><thead><tr><th>Domaine</th><th>Liens</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
}

function heroCard(s) {
    return `
    <section class="dash-hero">
        <div class="dash-hero-period">${fmtDate(s.startDate)} — ${fmtDate(s.endDate)} · ${s.totalDays} jours</div>
        <div class="dash-hero-item"><div class="dash-hero-value">${fmt(s.totalMessages)}</div><div class="dash-hero-label">messages</div></div>
        <div class="dash-hero-item"><div class="dash-hero-value">${s.avgPerDay}</div><div class="dash-hero-label">/ jour</div></div>
        <div class="dash-hero-item"><div class="dash-hero-value">${s.participants}</div><div class="dash-hero-label">participants</div></div>
        <div class="dash-hero-item"><div class="dash-hero-value">${fmt(s.emojis?.total || 0)}</div><div class="dash-hero-label">emojis</div></div>
        <div class="dash-hero-item"><div class="dash-hero-value">${fmt(s.totalMedia)}</div><div class="dash-hero-label">médias</div></div>
        <div class="dash-hero-item"><div class="dash-hero-value">${s.streak?.max || 0}j</div><div class="dash-hero-label">meilleur streak</div></div>
    </section>`;
}

function comparisonCard(c) {
    const row = (label, data, unit = '') => {
        const pct = data.pct;
        const arrow = pct == null ? '' : pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
        const trendClass = pct == null ? 'dash-trend-flat' : pct > 0 ? 'dash-trend-up' : pct < 0 ? 'dash-trend-down' : 'dash-trend-flat';
        return `<tr><td>${label}</td><td>${fmt(data.previous)}${unit}</td><td>${fmt(data.current)}${unit}</td><td class="${trendClass}">${arrow} ${pct == null ? '—' : Math.abs(pct) + '%'}</td></tr>`;
    };
    return `
    <section class="dash-card col-12">
        <h2>Année N vs N-1</h2>
        <table class="dash-table">
            <thead><tr><th>Métrique</th><th>N-1</th><th>N</th><th>Évolution</th></tr></thead>
            <tbody>
                ${row('Messages', c.messages)}
                ${row('Moyenne / jour', c.avgPerDay)}
                ${row('Emojis', c.emojis)}
                ${row('Médias', c.media)}
                <tr><td>Meilleur streak</td><td>${c.streak.previous}j</td><td>${c.streak.current}j</td><td>—</td></tr>
            </tbody>
        </table>
    </section>`;
}

function overviewCard(s) {
    return `
    <section class="dash-card col-6">
        <h2>Vue d'ensemble</h2>
        <dl class="dash-kv">
            <dt>Total caractères</dt><dd>${fmt(s.totalChars)}</dd>
            <dt>Longueur moyenne</dt><dd>${s.avgMsgLen} car.</dd>
            <dt>Liens partagés</dt><dd>${fmt(s.totalLinks)}</dd>
            <dt>Messages modifiés</dt><dd>${fmt(s.totalEdited)}</dd>
            <dt>Pic horaire</dt><dd>${s.peakHour}h</dd>
            <dt>Pic jour</dt><dd>${s.peakDay}</dd>
            <dt>Jour le plus actif</dt><dd>${escapeHtml(s.mostActiveDay?.[0] || '—')} (${fmt(s.mostActiveDay?.[1] || 0)})</dd>
            <dt>Langue détectée</dt><dd>${(s.lang || 'fr').toUpperCase()}</dd>
        </dl>
    </section>`;
}

function rankingCard(s) {
    const emojiMap = Object.fromEntries(s.emojis?.perPerson || []);
    return `
    <section class="dash-card col-6">
        <h2>Classement</h2>
        <table class="dash-table">
            <thead><tr><th>#</th><th>Nom</th><th>Messages</th><th>%</th><th>Moy.</th><th>Emojis</th></tr></thead>
            <tbody>${s.ranking.map(([name, d], i) => {
                const rank = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
                return `<tr data-person="${escapeHtml(name)}"><td class="dash-rank ${rank}">${i + 1}</td><td>${escapeHtml(name)}</td><td>${fmt(d.count)}</td><td>${d.percent}%</td><td>${d.avgLen}</td><td>${fmt(emojiMap[name] || 0)}</td></tr>`;
            }).join('')}</tbody>
        </table>
    </section>`;
}

function activityCard(s) {
    const max = Math.max(...s.hourly);
    const bars = s.hourly.map((v, h) => {
        const pct = max ? (v / max) * 100 : 0;
        return `<div class="dash-hour-bar" title="${h}h : ${v} messages">
            <div class="dash-hour-track"><div class="dash-hour-fill" style="--fill:${pct}%"></div></div>
            <div class="dash-hour-label">${h}</div>
        </div>`;
    }).join('');
    const dayMax = Math.max(...s.weekday);
    const dayBars = s.weekday.map((v, i) => {
        const pct = dayMax ? (v / dayMax) * 100 : 0;
        return `<div class="dash-day-row">
            <span class="dash-day-name">${DAYS_FR[i].slice(0, 3)}</span>
            <div class="dash-day-track"><div class="dash-day-fill" style="--fill:${pct}%"></div></div>
            <span class="dash-day-count">${fmt(v)}</span>
        </div>`;
    }).join('');
    return `
    <section class="dash-card col-12">
        <h2>Activité</h2>
        <div class="dash-hourly-row">${bars}</div>
        <div class="dash-day-list">${dayBars}</div>
    </section>`;
}

function emojisCard(s) {
    if (!s.emojis?.top?.length) return '';
    const chips = s.emojis.top.map(([e, c]) => `<span class="dash-chip">${escapeHtml(e)} <span class="count">${fmt(c)}</span></span>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>Top emojis <span class="dash-meta">${fmt(s.emojis.total)} envoyés · ${s.emojis.unique} uniques</span></h2>
        <div class="dash-chips">${chips}</div>
    </section>`;
}

function reactionsCard(s) {
    const emojis = (s.reactions.topEmojis || []).map(([e, c]) => `<span class="dash-chip">${escapeHtml(e)} <span class="count">${fmt(c)}</span></span>`).join('');
    const authors = (s.reactions.perAuthor || []).map(([n, c]) => `<tr data-person="${escapeHtml(n)}"><td>${escapeHtml(n)}</td><td>${fmt(c)}</td></tr>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>Réactions <span class="dash-meta">${fmt(s.reactions.total)} au total</span></h2>
        <div class="dash-chips dash-chips--spaced">${emojis}</div>
        <table class="dash-table"><thead><tr><th>Auteur</th><th>Réactions</th></tr></thead><tbody>${authors}</tbody></table>
    </section>`;
}

function wordsCard(s) {
    if (!s.topWords?.length) return '';
    const chips = s.topWords.slice(0, 25).map(([w, c]) => `<span class="dash-chip">${escapeHtml(w)} <span class="count">${fmt(c)}</span></span>`).join('');
    return `
    <section class="dash-card col-12">
        <h2>Mots les plus utilisés</h2>
        <div class="dash-chips">${chips}</div>
    </section>`;
}

function signatureCard(s) {
    const blocks = Object.entries(s.uniqueWordsPerPerson).map(([author, words]) => {
        const chips = words.slice(0, 10).map(([w, c]) => `<span class="dash-chip">${escapeHtml(w)} <span class="count">${c}</span></span>`).join('');
        return `<div class="dash-sig-block"><h4>${escapeHtml(author)}</h4><div class="dash-chips">${chips || '<span class="dash-empty-note">Aucun mot unique</span>'}</div></div>`;
    }).join('');
    return `
    <section class="dash-card col-12">
        <h2>Signature lexicale <span class="dash-meta">mots exclusifs à chaque personne</span></h2>
        <div class="dash-signature">${blocks}</div>
    </section>`;
}

function ghostingCard(s) {
    const longest = (s.ghosting.longest || []).map(g => {
        const h = Math.round(g.minutes / 60);
        return `<tr data-person="${escapeHtml(g.silenced)}" data-person-b="${escapeHtml(g.revived)}"><td>${escapeHtml(g.silenced)} → ${escapeHtml(g.revived)}</td><td>${h}h</td><td>${fmtDate(g.when)}</td></tr>`;
    }).join('');
    const revivers = (s.ghosting.revivers || []).map(([n, c]) => `<tr data-person="${escapeHtml(n)}"><td>${escapeHtml(n)}</td><td>${fmt(c)}</td></tr>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>Ghosting <span class="dash-meta">${fmt(s.ghosting.count)} silences &gt;24h</span></h2>
        <h4 class="dash-subheading dash-subheading--first">Plus longs silences</h4>
        <table class="dash-table"><tbody>${longest}</tbody></table>
        <h4 class="dash-subheading">Qui brise le silence</h4>
        <table class="dash-table"><tbody>${revivers}</tbody></table>
    </section>`;
}

function initiatorCard(s) {
    const rows = s.initiator.map(([n, c]) => `<tr data-person="${escapeHtml(n)}"><td>${escapeHtml(n)}</td><td>${fmt(c)} jours</td></tr>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>Qui lance la conversation</h2>
        <table class="dash-table"><tbody>${rows}</tbody></table>
    </section>`;
}

function sentimentCard(s) {
    const st = s.sentiment;
    const mlBadge = st.mlEnabled
        ? `<span class="dash-badge">IA (${st.device ?? 'wasm'}${st.ironyModel ? ' + ironie' : ''})</span>`
        : `<span class="dash-badge dash-badge--dim">lexique seulement</span>`;

    const rows = (st.perPerson || []).map(p => {
        const ratePct = (p.rate * 100).toFixed(1);
        const sampled = p.sampled > 0 ? `<span class="dash-meta-inline" title="${p.sampled} msgs analysés">(${p.sampled})</span>` : '';
        return `<tr data-person="${escapeHtml(p.author)}">
            <td>${escapeHtml(p.author)}</td>
            <td>${fmt(p.pos)}</td>
            <td>${fmt(p.neg)}</td>
            <td>${fmt(p.compliment)}</td>
            <td>${fmt(p.insult)}</td>
            <td>${p.rate > 0 ? '+' : ''}${ratePct}% ${sampled}</td>
            <td>${p.stdDev > 0 ? p.stdDev.toFixed(2) : '—'}</td>
            <td>${p.sarcasmHits > 0 ? p.sarcasmHits : '—'}</td>
        </tr>`;
    }).join('');

    const highlights = [];
    if (st.sweetest?.compliment)  highlights.push(`<div class="dash-fact"><span class="dash-fact-icon">💖</span><div><strong>${escapeHtml(st.sweetest.author)}</strong> est la personne la plus douce (${st.sweetest.compliment} compliments)</div></div>`);
    if (st.sharpest?.insult)      highlights.push(`<div class="dash-fact"><span class="dash-fact-icon">🌶️</span><div><strong>${escapeHtml(st.sharpest.author)}</strong> pique le plus (${st.sharpest.insult} piques)</div></div>`);
    if (st.mostPositive)          highlights.push(`<div class="dash-fact"><span class="dash-fact-icon">☀️</span><div><strong>${escapeHtml(st.mostPositive.author)}</strong> a le ton le plus positif (${(st.mostPositive.rate * 100).toFixed(1)}%)</div></div>`);
    if (st.mostVolatile)          highlights.push(`<div class="dash-fact"><span class="dash-fact-icon">🎢</span><div><strong>${escapeHtml(st.mostVolatile.author)}</strong> est le plus en montagnes russes (σ = ${st.mostVolatile.stdDev.toFixed(2)})</div></div>`);
    if (st.mostStable && st.perPerson.length > 1)
                                  highlights.push(`<div class="dash-fact"><span class="dash-fact-icon">🧘</span><div><strong>${escapeHtml(st.mostStable.author)}</strong> est le plus constant (σ = ${st.mostStable.stdDev.toFixed(2)})</div></div>`);
    if (st.mostBeloved)           highlights.push(`<div class="dash-fact"><span class="dash-fact-icon">💝</span><div><strong>${escapeHtml(st.mostBeloved.author)}</strong> reçoit les réactions les plus chaleureuses (${(st.mostBeloved.reactionsReceivedMean * 100).toFixed(0)}%, ${st.mostBeloved.reactionsReceived} reactions)</div></div>`);
    if (st.mostExpressive && st.perPerson.length > 1)
                                  highlights.push(`<div class="dash-fact"><span class="dash-fact-icon">🎭</span><div><strong>${escapeHtml(st.mostExpressive.author)}</strong> réagit le plus souvent (${st.mostExpressive.reactionsSent} réactions émises)</div></div>`);

    const hasReactions = (st.perPerson || []).some(p => p.reactionsSent > 0 || p.reactionsReceived > 0);
    const reactionRows = !hasReactions ? '' : (st.perPerson || []).map(p => {
        const sentPct = p.reactionsSent > 0 ? `${p.reactionsSentMean >= 0 ? '+' : ''}${(p.reactionsSentMean * 100).toFixed(0)}%` : '—';
        const recPct  = p.reactionsReceived > 0 ? `${p.reactionsReceivedMean >= 0 ? '+' : ''}${(p.reactionsReceivedMean * 100).toFixed(0)}%` : '—';
        return `<tr data-person="${escapeHtml(p.author)}">
            <td>${escapeHtml(p.author)}</td>
            <td>${fmt(p.reactionsSent)} <span class="dash-meta-inline">${sentPct}</span></td>
            <td>${fmt(p.reactionsReceived)} <span class="dash-meta-inline">${recPct}</span></td>
        </tr>`;
    }).join('');

    const afterRows = Object.entries(st.afterAuthor || {})
        .sort((a, b) => Math.abs(b[1].mean) - Math.abs(a[1].mean))
        .map(([author, { mean, count }]) => {
            const pct = (mean * 100).toFixed(1);
            return `<tr data-person="${escapeHtml(author)}"><td>${escapeHtml(author)}</td><td>${mean >= 0 ? '+' : ''}${pct}%</td><td class="dash-meta-inline">${count} signaux</td></tr>`;
        }).join('');

    return `
    <section class="dash-card col-12">
        <h2>Sentiment & ton ${mlBadge}</h2>
        <div class="dash-facts dash-facts--spaced">${highlights.join('')}</div>
        <table class="dash-table">
            <thead><tr><th>Personne</th><th>Positif</th><th>Négatif</th><th>Compliments</th><th>Piques</th><th>Ratio</th><th>σ</th><th>Ironie</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        ${reactionRows ? `
        <h3 class="dash-section-heading">Réactions emoji</h3>
        <table class="dash-table">
            <thead><tr><th>Personne</th><th>Émises (ton moyen)</th><th>Reçues (ton moyen)</th></tr></thead>
            <tbody>${reactionRows}</tbody>
        </table>` : ''}
        ${afterRows ? `
        <h3 class="dash-section-heading">Influence sur l'ambiance</h3>
        <table class="dash-table">
            <thead><tr><th>Après ses messages</th><th>Ambiance des réponses</th><th></th></tr></thead>
            <tbody>${afterRows}</tbody>
        </table>` : ''}
    </section>`;
}

function responseCard(s) {
    const rows = (s.responseStats.all || []).map(([n, min]) => {
        const txt = min < 60 ? `${min} min` : `${Math.round(min / 60 * 10) / 10} h`;
        return `<tr data-person="${escapeHtml(n)}"><td>${escapeHtml(n)}</td><td>${txt}</td></tr>`;
    }).join('');
    return `
    <section class="dash-card col-6">
        <h2>Temps de réponse</h2>
        <table class="dash-table"><tbody>${rows}</tbody></table>
    </section>`;
}

function compatibilityCard(s) {
    const c = s.compatibility;
    return `
    <section class="dash-card col-6">
        <h2>Compatibilité</h2>
        <div class="dash-compat">
            <div><span class="dash-compat-score">${c.score}</span><span class="dash-compat-max">/100</span></div>
        </div>
        <dl class="dash-compat-grid">
            <div class="dash-compat-cell"><dt>Longueurs</dt><dd>${c.components.lengthSimilarity}</dd></div>
            <div class="dash-compat-cell"><dt>Équilibre</dt><dd>${c.components.volumeBalance}</dd></div>
            <div class="dash-compat-cell"><dt>Réciprocité</dt><dd>${c.components.reciprocity}</dd></div>
            <div class="dash-compat-cell"><dt>Régularité</dt><dd>${c.components.consistency}</dd></div>
        </dl>
    </section>`;
}

function funFactsCard(s) {
    const facts = [];
    if (s.firstMessage) {
        facts.push({ i: '🎬', t: `Premier message : <strong>${escapeHtml(s.firstMessage.author)}</strong> le ${fmtDate(s.firstMessage.datetime)} à ${fmtClock(s.firstMessage.datetime)}` });
    }
    if (s.longestMessage?.msgLen) {
        facts.push({ i: '📜', t: `Plus long message : <strong>${escapeHtml(s.longestMessage.author)}</strong> avec ${fmt(s.longestMessage.msgLen)} caractères` });
    }
    if (s.nightOwl) facts.push({ i: '🦉', t: `Night owl : <strong>${escapeHtml(s.nightOwl[0])}</strong> (${s.nightOwl[1]} messages entre 0h et 5h)` });
    if (s.earlyBird) facts.push({ i: '🐦', t: `Early bird : <strong>${escapeHtml(s.earlyBird[0])}</strong> (${s.earlyBird[1]} messages avant 8h)` });
    if (s.streak?.max) facts.push({ i: '🔥', t: `Meilleur streak : <strong>${s.streak.max} jours</strong> consécutifs` });
    const html = facts.map(f => `<div class="dash-fact"><span class="dash-fact-icon">${f.i}</span><div>${f.t}</div></div>`).join('');
    return `
    <section class="dash-card col-12">
        <h2>Fun facts</h2>
        <div class="dash-facts">${html}</div>
    </section>`;
}

// ---------- Toolbar: filter, export, share ----------

/**
 * Focus mode rather than recomputation: the dashboard only ever receives
 * aggregated stats, never the messages, so a participant filter can highlight
 * the rows about that person but cannot recompute totals. Rows that carry no
 * `data-person` are left alone, and the card is marked so it is obvious that a
 * filter is active.
 */
function populatePersonFilter(stats) {
    const select = $('#dash-person');
    if (!select) return;
    const names = (stats.ranking || []).map(([name]) => name);
    select.innerHTML = '<option value="">Tout le monde</option>' +
        names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    select.disabled = names.length === 0;
}

function applyPersonFilter(name) {
    document.body.classList.toggle('is-filtered', !!name);
    content.querySelectorAll('tr[data-person]').forEach(row => {
        const matches = !name ||
            row.dataset.person === name ||
            row.dataset.personB === name;
        row.hidden = !matches;
    });
}

function wireToolbar() {
    $('#dash-person')?.addEventListener('change', (e) => applyPersonFilter(e.target.value));

    $('#dash-share')?.addEventListener('click', () => {
        if (!current) return;
        openShareSheet({
            stats: current.stats,
            comparison: current.comparison,
            card: null,
            recapCard: null,
        });
    });

    $('#dash-export-json')?.addEventListener('click', () => exportJSON());
    $('#dash-export-csv')?.addEventListener('click', () => exportCSV());
}

function exportJSON() {
    if (!current) return;
    const blob = new Blob([JSON.stringify(current.stats, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'whatsapp-wrapped-stats.json');
    showToast('Stats exportées en JSON');
}

/**
 * One CSV per participant — the shape people actually paste into a
 * spreadsheet. Everything else (word clouds, heatmaps) is in the JSON.
 */
function exportCSV() {
    if (!current) return;
    const s = current.stats;
    const emojiMap = Object.fromEntries(s.emojis?.perPerson || []);
    const initiator = Object.fromEntries(s.initiator || []);
    const header = [
        'participant', 'messages', 'part_pct', 'longueur_moyenne', 'caracteres',
        'medias', 'liens', 'emojis', 'reponse_moyenne_min', 'heure_pic',
        'jours_lances', 'messages_nuit', 'messages_matin',
    ];
    const rows = (s.ranking || []).map(([name, p]) => [
        name, p.count, p.percent, p.avgLen, p.totalChars,
        p.media, p.links, emojiMap[name] ?? p.emojis ?? 0,
        p.avgResponseMin ?? '', p.peakHour ?? '',
        initiator[name] ?? 0, p.nightMsgs, p.morningMsgs,
    ]);

    const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
    // BOM so Excel opens UTF-8 accents correctly.
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, 'whatsapp-wrapped-participants.csv');
    showToast('Stats exportées en CSV');
}

function csvCell(value) {
    const str = String(value ?? '');
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}
