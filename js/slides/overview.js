import { escapeHtml, fmt, fmtDate } from '../utils.js';

export function overviewSlide(stats, gradient) {
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Ta conversation</span>
                <div class="big-number">${fmt(stats.totalMessages)}</div>
                <div class="big-label">messages echanges</div>
                <p class="slide-subtitle">Du ${fmtDate(stats.startDate)} au ${fmtDate(stats.endDate)}</p>
                <div class="stat-grid">
                    <div class="stat-card"><div class="stat-value">${stats.participants}</div><div class="stat-label">participants</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.totalDays}</div><div class="stat-label">jours</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.avgPerDay}</div><div class="stat-label">messages / jour</div></div>
                    <div class="stat-card"><div class="stat-value">${fmt(stats.totalChars)}</div><div class="stat-label">caractères</div></div>
                </div>
            </div>
        `,
    };
}

export function comparisonSlide(comparison, gradient) {
    if (!comparison) return null;
    const row = (label, d, unit = '') => {
        const pct = d.pct;
        const arrow = pct == null ? '' : pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
        const color = pct == null ? 'var(--text-muted)' : pct > 0 ? 'var(--accent-green)' : 'var(--accent-pink)';
        const pctText = pct == null ? '' : `<span style="color:${color};font-weight:600;">${arrow} ${Math.abs(pct)}%</span>`;
        return `<tr><td>${label}</td><td>${fmt(d.previous)}${unit}</td><td>${fmt(d.current)}${unit}</td><td>${pctText}</td></tr>`;
    };
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Comparaison</span>
                <h2 class="slide-title">Cette année vs l'année dernière</h2>
                <table class="compare-table">
                    <thead><tr><th></th><th>Avant</th><th>Maintenant</th><th>Évolution</th></tr></thead>
                    <tbody>
                        ${row('Messages', comparison.messages)}
                        ${row('Par jour', comparison.avgPerDay)}
                        ${row('Emojis', comparison.emojis)}
                        ${row('Medias', comparison.media)}
                        ${comparison.avgMsgLen ? row('Longueur moy.', comparison.avgMsgLen, ' car.') : ''}
                        ${comparison.streak ? row('Meilleur streak', comparison.streak, ' j') : ''}
                    </tbody>
                </table>
            </div>
        `,
    };
}

export function wordsTrendSlide(comparison, gradient) {
    if (!comparison) return null;
    const appeared = comparison.appeared || [];
    const disappeared = comparison.disappeared || [];
    if (appeared.length === 0 && disappeared.length === 0) return null;
    const tag = (w, c, color) =>
        `<span class="word-tag" style="background:${color}33;color:${color};">${escapeHtml(w)} <small>${c}</small></span>`;
    const newCloud = appeared.map(([w, c]) => tag(w, c, '#10B981')).join('');
    const oldCloud = disappeared.map(([w, c]) => tag(w, c, '#EC4899')).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Vocabulaire</span>
                <h2 class="slide-title">Les mots de l'année</h2>
                ${appeared.length ? `<p style="color:var(--text-muted);font-size:0.85rem;margin-top:1rem;">Nouveaux mots ✨</p><div class="words-cloud">${newCloud}</div>` : ''}
                ${disappeared.length ? `<p style="color:var(--text-muted);font-size:0.85rem;margin-top:1rem;">Disparus de votre top</p><div class="words-cloud">${oldCloud}</div>` : ''}
            </div>
        `,
    };
}

export function recapSlide(stats) {
    return {
        gradient: 'slide-gradient-2',
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Recapitulatif</span>
                <h2 class="slide-title">Votre conversation en chiffres</h2>
                <div class="stat-grid">
                    <div class="stat-card"><div class="stat-value">${fmt(stats.totalMessages)}</div><div class="stat-label">messages</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.participants}</div><div class="stat-label">participants</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.totalDays}</div><div class="stat-label">jours</div></div>
                    <div class="stat-card"><div class="stat-value">${fmt(stats.emojis.total)}</div><div class="stat-label">emojis</div></div>
                    <div class="stat-card"><div class="stat-value">${fmt(stats.totalMedia)}</div><div class="stat-label">médias</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.streak.max}j</div><div class="stat-label">meilleur streak</div></div>
                </div>
                <p class="slide-subtitle" style="margin-top:1.5rem;">
                    ${stats.ranking[0] ? `<strong>${escapeHtml(stats.ranking[0][0])}</strong> domine avec ${stats.ranking[0][1].percent}% des messages` : ''}
                </p>
                <button class="file-btn" onclick="location.reload()" style="margin-top:1rem;">Analyser une autre conversation</button>
            </div>
        `,
    };
}
