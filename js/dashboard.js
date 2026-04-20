/**
 * Dashboard page — renders a full data view from stats produced by the main app.
 * Data source (in order): sessionStorage 'ww-stats' → URL #share=<lzstring>.
 */

import { escapeHtml, fmt, fmtDate, DAYS_FR } from './utils.js';

function fmtClock(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const STORAGE_KEY = 'ww-stats';
const $ = (sel) => document.querySelector(sel);
const content = $('#dash-content');

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
                const p = JSON.parse(json);
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

function rehydrateDates(stats) {
    if (typeof stats.startDate === 'string') stats.startDate = new Date(stats.startDate);
    if (typeof stats.endDate === 'string') stats.endDate = new Date(stats.endDate);
    if (stats.firstMessage?.datetime && typeof stats.firstMessage.datetime === 'string') {
        stats.firstMessage.datetime = new Date(stats.firstMessage.datetime);
    }
    if (stats.longestMessage?.datetime && typeof stats.longestMessage.datetime === 'string') {
        stats.longestMessage.datetime = new Date(stats.longestMessage.datetime);
    }
    if (stats.ghosting?.longest) {
        stats.ghosting.longest = stats.ghosting.longest.map(g => ({
            ...g,
            when: g.when instanceof Date ? g.when : new Date(g.when),
        }));
    }
    return stats;
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
        <div class="dash-hero-item"><div class="dash-hero-value">${fmt(s.totalMedia)}</div><div class="dash-hero-label">medias</div></div>
        <div class="dash-hero-item"><div class="dash-hero-value">${s.streak?.max || 0}j</div><div class="dash-hero-label">meilleur streak</div></div>
    </section>`;
}

function comparisonCard(c) {
    const row = (label, data, unit = '') => {
        const pct = data.pct;
        const arrow = pct == null ? '' : pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
        const color = pct == null ? 'var(--text-muted)' : pct > 0 ? '#10B981' : pct < 0 ? '#EF4444' : 'var(--text-muted)';
        return `<tr><td>${label}</td><td>${fmt(data.previous)}${unit}</td><td>${fmt(data.current)}${unit}</td><td style="color:${color}">${arrow} ${pct == null ? '—' : Math.abs(pct) + '%'}</td></tr>`;
    };
    return `
    <section class="dash-card col-12">
        <h2>Annee N vs N-1</h2>
        <table class="dash-table">
            <thead><tr><th>Metrique</th><th>N-1</th><th>N</th><th>Evolution</th></tr></thead>
            <tbody>
                ${row('Messages', c.messages)}
                ${row('Moyenne / jour', c.avgPerDay)}
                ${row('Emojis', c.emojis)}
                ${row('Medias', c.media)}
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
            <dt>Total caracteres</dt><dd>${fmt(s.totalChars)}</dd>
            <dt>Longueur moyenne</dt><dd>${s.avgMsgLen} car.</dd>
            <dt>Liens partages</dt><dd>${fmt(s.totalLinks)}</dd>
            <dt>Messages modifies</dt><dd>${fmt(s.totalEdited)}</dd>
            <dt>Pic horaire</dt><dd>${s.peakHour}h</dd>
            <dt>Pic jour</dt><dd>${s.peakDay}</dd>
            <dt>Jour le plus actif</dt><dd>${escapeHtml(s.mostActiveDay?.[0] || '—')} (${fmt(s.mostActiveDay?.[1] || 0)})</dd>
            <dt>Langue detectee</dt><dd>${(s.lang || 'fr').toUpperCase()}</dd>
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
        return `<div title="${h}h : ${v} messages" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0.2rem;">
            <div style="width:100%;height:60px;display:flex;align-items:flex-end;"><div style="width:100%;height:${pct}%;background:linear-gradient(to top,var(--accent-purple),var(--accent-pink));border-radius:3px;"></div></div>
            <div style="font-size:0.6rem;color:var(--text-muted);">${h}</div>
        </div>`;
    }).join('');
    const dayMax = Math.max(...s.weekday);
    const dayBars = s.weekday.map((v, i) => {
        const pct = dayMax ? (v / dayMax) * 100 : 0;
        return `<div style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;">
            <span style="width:2rem;color:var(--text-muted);">${DAYS_FR[i].slice(0, 3)}</span>
            <div style="flex:1;height:0.8rem;background:var(--surface-border);border-radius:4px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:var(--accent-purple);"></div></div>
            <span style="width:3rem;text-align:right;font-variant-numeric:tabular-nums;">${fmt(v)}</span>
        </div>`;
    }).join('');
    return `
    <section class="dash-card col-12">
        <h2>Activite</h2>
        <div style="display:flex;gap:0.2rem;align-items:flex-end;margin-bottom:1rem;">${bars}</div>
        <div style="display:flex;flex-direction:column;gap:0.35rem;">${dayBars}</div>
    </section>`;
}

function emojisCard(s) {
    if (!s.emojis?.top?.length) return '';
    const chips = s.emojis.top.map(([e, c]) => `<span class="dash-chip">${escapeHtml(e)} <span class="count">${fmt(c)}</span></span>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>Top emojis <span class="dash-meta">${fmt(s.emojis.total)} envoyes · ${s.emojis.unique} uniques</span></h2>
        <div class="dash-chips">${chips}</div>
    </section>`;
}

function reactionsCard(s) {
    const emojis = (s.reactions.topEmojis || []).map(([e, c]) => `<span class="dash-chip">${escapeHtml(e)} <span class="count">${fmt(c)}</span></span>`).join('');
    const authors = (s.reactions.perAuthor || []).map(([n, c]) => `<tr><td>${escapeHtml(n)}</td><td>${fmt(c)}</td></tr>`).join('');
    return `
    <section class="dash-card col-6">
        <h2>Reactions <span class="dash-meta">${fmt(s.reactions.total)} au total</span></h2>
        <div class="dash-chips" style="margin-bottom:0.75rem;">${emojis}</div>
        <table class="dash-table"><thead><tr><th>Auteur</th><th>Reactions</th></tr></thead><tbody>${authors}</tbody></table>
    </section>`;
}

function wordsCard(s) {
    if (!s.topWords?.length) return '';
    const chips = s.topWords.slice(0, 25).map(([w, c]) => `<span class="dash-chip">${escapeHtml(w)} <span class="count">${fmt(c)}</span></span>`).join('');
    return `
    <section class="dash-card col-12">
        <h2>Mots les plus utilises</h2>
        <div class="dash-chips">${chips}</div>
    </section>`;
}

function signatureCard(s) {
    const blocks = Object.entries(s.uniqueWordsPerPerson).map(([author, words]) => {
        const chips = words.slice(0, 10).map(([w, c]) => `<span class="dash-chip">${escapeHtml(w)} <span class="count">${c}</span></span>`).join('');
        return `<div class="dash-sig-block"><h4>${escapeHtml(author)}</h4><div class="dash-chips">${chips || '<span style="color:var(--text-muted);font-size:0.85rem;">Aucun mot unique</span>'}</div></div>`;
    }).join('');
    return `
    <section class="dash-card col-12">
        <h2>Signature lexicale <span class="dash-meta">mots exclusifs a chaque personne</span></h2>
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
        <h4 style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem;">Plus longs silences</h4>
        <table class="dash-table"><tbody>${longest}</tbody></table>
        <h4 style="font-size:0.8rem;color:var(--text-muted);margin:1rem 0 0.5rem;">Qui brise le silence</h4>
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
    const rows = (st.perPerson || []).map(p => {
        const rate = (p.rate * 100).toFixed(2);
        return `<tr><td>${escapeHtml(p.author)}</td><td>${fmt(p.pos)}</td><td>${fmt(p.neg)}</td><td>${fmt(p.compliment)}</td><td>${fmt(p.insult)}</td><td>${p.rate > 0 ? '+' : ''}${rate}%</td></tr>`;
    }).join('');
    const highlights = [];
    if (st.sweetest?.compliment) highlights.push(`<div class="dash-fact"><span class="dash-fact-icon">💖</span><div><strong>${escapeHtml(st.sweetest.author)}</strong> est la personne la plus douce (${st.sweetest.compliment} compliments)</div></div>`);
    if (st.sharpest?.insult) highlights.push(`<div class="dash-fact"><span class="dash-fact-icon">🌶️</span><div><strong>${escapeHtml(st.sharpest.author)}</strong> pique le plus (${st.sharpest.insult} piques)</div></div>`);
    if (st.mostPositive) highlights.push(`<div class="dash-fact"><span class="dash-fact-icon">☀️</span><div><strong>${escapeHtml(st.mostPositive.author)}</strong> a le ton le plus positif</div></div>`);
    return `
    <section class="dash-card col-12">
        <h2>Sentiment & ton</h2>
        <div class="dash-facts" style="margin-bottom:1rem;">${highlights.join('')}</div>
        <table class="dash-table">
            <thead><tr><th>Personne</th><th>Positif</th><th>Negatif</th><th>Compliments</th><th>Piques</th><th>Ratio</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </section>`;
}

function responseCard(s) {
    const rows = (s.responseStats.all || []).map(([n, min]) => {
        const txt = min < 60 ? `${min} min` : `${Math.round(min / 60 * 10) / 10} h`;
        return `<tr><td>${escapeHtml(n)}</td><td>${txt}</td></tr>`;
    }).join('');
    return `
    <section class="dash-card col-6">
        <h2>Temps de reponse</h2>
        <table class="dash-table"><tbody>${rows}</tbody></table>
    </section>`;
}

function compatibilityCard(s) {
    const c = s.compatibility;
    return `
    <section class="dash-card col-6">
        <h2>Compatibilite</h2>
        <div class="dash-compat">
            <div><span class="dash-compat-score">${c.score}</span><span class="dash-compat-max">/100</span></div>
        </div>
        <dl class="dash-compat-grid">
            <div class="dash-compat-cell"><dt>Longueurs</dt><dd>${c.components.lengthSimilarity}</dd></div>
            <div class="dash-compat-cell"><dt>Equilibre</dt><dd>${c.components.volumeBalance}</dd></div>
            <div class="dash-compat-cell"><dt>Reciprocite</dt><dd>${c.components.reciprocity}</dd></div>
            <div class="dash-compat-cell"><dt>Regularite</dt><dd>${c.components.consistency}</dd></div>
        </dl>
    </section>`;
}

function funFactsCard(s) {
    const facts = [];
    if (s.firstMessage) {
        facts.push({ i: '🎬', t: `Premier message : <strong>${escapeHtml(s.firstMessage.author)}</strong> le ${fmtDate(s.firstMessage.datetime)} a ${fmtClock(s.firstMessage.datetime)}` });
    }
    if (s.longestMessage?.msgLen) {
        facts.push({ i: '📜', t: `Plus long message : <strong>${escapeHtml(s.longestMessage.author)}</strong> avec ${fmt(s.longestMessage.msgLen)} caracteres` });
    }
    if (s.nightOwl) facts.push({ i: '🦉', t: `Night owl : <strong>${escapeHtml(s.nightOwl[0])}</strong> (${s.nightOwl[1]} messages entre 0h et 5h)` });
    if (s.earlyBird) facts.push({ i: '🐦', t: `Early bird : <strong>${escapeHtml(s.earlyBird[0])}</strong> (${s.earlyBird[1]} messages avant 8h)` });
    if (s.streak?.max) facts.push({ i: '🔥', t: `Meilleur streak : <strong>${s.streak.max} jours</strong> consecutifs` });
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
        const url = buildShareURL(stats, comparison);
        copyToClipboard(url);
    });
}

function buildShareURL(stats, comparison) {
    const s = JSON.parse(JSON.stringify(stats));
    s.startDate = new Date(stats.startDate).toISOString();
    s.endDate = new Date(stats.endDate).toISOString();
    if (s.firstMessage?.datetime) s.firstMessage.datetime = new Date(stats.firstMessage.datetime).toISOString();
    if (s.longestMessage?.datetime) s.longestMessage.datetime = new Date(stats.longestMessage.datetime).toISOString();
    delete s.daily;
    if (s.ghosting?.longest) s.ghosting.longest = s.ghosting.longest.map(g => ({ ...g, when: new Date(g.when).toISOString() }));
    const payload = { s, c: comparison };
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
    return window.location.origin + window.location.pathname + '#share=' + compressed;
}

function copyToClipboard(text) {
    const done = () => {
        const toast = $('#share-toast');
        if (!toast) return;
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
