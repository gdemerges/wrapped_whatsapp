import { escapeHtml, fmt, fmtTime } from '../utils.js';

export function ghostingSlide(stats, gradient) {
    if (!stats.ghosting || stats.ghosting.count === 0) return null;
    const longest = stats.ghosting.longest.slice(0, 3).map(g => {
        const days = (g.minutes / 1440).toFixed(1);
        return `<li><strong>${escapeHtml(g.silenced)}</strong> ghosté ${days}j, relancé par <strong>${escapeHtml(g.revived)}</strong></li>`;
    }).join('');
    const revivers = stats.ghosting.revivers.slice(0, 3).map(([n, c]) =>
        `<li><strong>${escapeHtml(n)}</strong> a relance ${c} fois</li>`
    ).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Ghosting</span>
                <h2 class="slide-title">${stats.ghosting.count} grands silences</h2>
                <p class="slide-subtitle">Quand personne ne parle pendant plus de 24h</p>
                <h4 style="margin-top:1.5rem;opacity:0.8;">Plus longs silences</h4>
                <ul class="plain-list">${longest}</ul>
                <h4 style="margin-top:1.5rem;opacity:0.8;">Qui reprend le plus souvent ?</h4>
                <ul class="plain-list">${revivers}</ul>
            </div>
        `,
    };
}

export function compatibilitySlide(stats, gradient) {
    if (!stats.compatibility) return null;
    const c = stats.compatibility;
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Compatibilite</span>
                <div class="big-number">${c.score}<span style="font-size:2rem;opacity:0.7;">/100</span></div>
                <div class="big-label">score de compatibilite</div>
                <div class="stat-grid">
                    <div class="stat-card"><div class="stat-value">${c.components.lengthSimilarity}</div><div class="stat-label">longueurs similaires</div></div>
                    <div class="stat-card"><div class="stat-value">${c.components.volumeBalance}</div><div class="stat-label">equilibre des messages</div></div>
                    <div class="stat-card"><div class="stat-value">${c.components.reciprocity}</div><div class="stat-label">reciprocite</div></div>
                    <div class="stat-card"><div class="stat-value">${c.components.consistency}</div><div class="stat-label">regularite</div></div>
                </div>
            </div>
        `,
    };
}

export function funFactsSlide(stats, gradient) {
    const facts = [];
    facts.push({ icon: '📅', text: `Le jour le plus actif etait le <strong>${new Date(stats.mostActiveDay[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> avec <strong>${stats.mostActiveDay[1]} messages</strong> !` });
    if (stats.streak.max > 1) facts.push({ icon: '🔥', text: `Record de conversation : <strong>${stats.streak.max} jours consecutifs</strong> sans interruption !` });
    if (stats.longestMessage && stats.longestMessage.msgLen > 0) facts.push({ icon: '📝', text: `Le plus long message (<strong>${fmt(stats.longestMessage.msgLen)} caracteres</strong>) par <strong>${escapeHtml(stats.longestMessage.author)}</strong>` });
    if (stats.nightOwl) facts.push({ icon: '🦉', text: `Couche-tard : <strong>${escapeHtml(stats.nightOwl[0])}</strong> (${stats.nightOwl[1]} msgs entre 0h-5h)` });
    if (stats.earlyBird) facts.push({ icon: '🐦', text: `Leve-tot : <strong>${escapeHtml(stats.earlyBird[0])}</strong> (${stats.earlyBird[1]} msgs entre 5h-8h)` });
    if (stats.responseStats?.fastest) facts.push({ icon: '⚡', text: `Plus reactif : <strong>${escapeHtml(stats.responseStats.fastest[0])}</strong> (${fmtTime(stats.responseStats.fastest[1])})` });

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Fun facts</span>
                <h2 class="slide-title">Le saviez-vous ?</h2>
                <div class="fun-facts">${facts.map(f => `<div class="fun-fact"><div class="fun-fact-icon">${f.icon}</div><div class="fun-fact-text">${f.text}</div></div>`).join('')}</div>
            </div>
        `,
    };
}
