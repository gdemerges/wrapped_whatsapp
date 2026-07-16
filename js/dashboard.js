/**
 * Dashboard page — renders a full data view from stats produced by the main app.
 * Data source (in order): sessionStorage 'ww-stats' → URL #share=<lzstring>.
 */

import { escapeHtml, fmt, fmtDate, DAYS_FR } from './utils.js';
import { rehydrateDates, sanitizeShared, buildShareURL as buildShareURLShared } from './payload.js';

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
const payload = loadPayload();
if (payload) {
    const stats = rehydrateDates(payload.stats);
    render(stats, payload.comparison || null);
    wireShare(stats, payload.comparison || null);
}

function loadPayload() {
    const hash = window.location.hash;
    if (hash.startsWith('#share=')) {
        try {
            const json = LZString.decompressFromEncodedURIComponent(hash.slice('#share='.length));
            if (json) {
                const p = sanitizeShared(JSON.parse(json));
                return { stats: p.s, comparison: p.c };
            }
        } catch (e) { console.error(e); }
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
                return `<tr><td class="dash-rank ${rank}">${i + 1}</td><td>${escapeHtml(name)}</td><td>${fmt(d.count)}</td><td>${d.percent}%</td><td>${d.avgLen}</td><td>${fmt(emojiMap[name] || 0)}</td></tr>`;
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
    const authors = (s.reactions.perAuthor || []).map(([n, c]) => `<tr><td>${escapeHtml(n)}</td><td>${fmt(c)}</td></tr>`).join('');
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
        return `<tr><td>${escapeHtml(g.silenced)} → ${escapeHtml(g.revived)}</td><td>${h}h</td><td>${fmtDate(g.when)}</td></tr>`;
    }).join('');
    const revivers = (s.ghosting.revivers || []).map(([n, c]) => `<tr><td>${escapeHtml(n)}</td><td>${fmt(c)}</td></tr>`).join('');
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
    const rows = s.initiator.map(([n, c]) => `<tr><td>${escapeHtml(n)}</td><td>${fmt(c)} jours</td></tr>`).join('');
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
        return `<tr>
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
        return `<tr>
            <td>${escapeHtml(p.author)}</td>
            <td>${fmt(p.reactionsSent)} <span class="dash-meta-inline">${sentPct}</span></td>
            <td>${fmt(p.reactionsReceived)} <span class="dash-meta-inline">${recPct}</span></td>
        </tr>`;
    }).join('');

    const afterRows = Object.entries(st.afterAuthor || {})
        .sort((a, b) => Math.abs(b[1].mean) - Math.abs(a[1].mean))
        .map(([author, { mean, count }]) => {
            const pct = (mean * 100).toFixed(1);
            return `<tr><td>${escapeHtml(author)}</td><td>${mean >= 0 ? '+' : ''}${pct}%</td><td class="dash-meta-inline">${count} signaux</td></tr>`;
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
        return `<tr><td>${escapeHtml(n)}</td><td>${txt}</td></tr>`;
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

// ---------- Share ----------
function wireShare(stats, comparison) {
    const btn = $('#dash-share');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const { url, truncated } = buildShareURL(stats, comparison);
        copyToClipboard(url, truncated ? 'Lien copié (allégé, conversation volumineuse)' : 'Lien copié !');
    });
}

function buildShareURL(stats, comparison) {
    return buildShareURLShared(stats, comparison, { dropDaily: true });
}

function copyToClipboard(text, message = 'Lien copié !') {
    const done = () => {
        const toast = $('#share-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 2000);
    };
    navigator.clipboard.writeText(text).then(done).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
    });
}
