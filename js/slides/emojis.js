import { escapeHtml, fmt } from '../utils.js';
import { CHART_COLORS } from './_constants.js';

export function emojiSlide(stats, gradient) {
    const items = stats.emojis.top.slice(0, 12).map(([emoji, count]) =>
        `<div class="emoji-item"><span class="emoji">${escapeHtml(emoji)}</span><span class="emoji-count">${fmt(count)}</span></div>`
    ).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Emojis</span>
                <div class="big-number">${fmt(stats.emojis.total)}</div>
                <div class="big-label">emojis envoyes</div>
                <p class="slide-subtitle">${stats.emojis.unique} emojis differents utilises</p>
                <div class="emoji-grid">${items}</div>
            </div>
        `,
    };
}

export function reactionsSlide(stats, gradient) {
    if (!stats.reactions || stats.reactions.total === 0) return null;
    const top = stats.reactions.topEmojis.map(([e, n]) =>
        `<div class="emoji-item"><span class="emoji">${escapeHtml(e)}</span><span class="emoji-count">${fmt(n)}</span></div>`
    ).join('');
    const reacters = stats.reactions.perAuthor.slice(0, 5).map(([name, n]) =>
        `<li><strong>${escapeHtml(name)}</strong> — ${fmt(n)} reactions</li>`
    ).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Reactions</span>
                <div class="big-number">${fmt(stats.reactions.total)}</div>
                <div class="big-label">reactions envoyees</div>
                <div class="emoji-grid">${top}</div>
                <ul class="plain-list">${reacters}</ul>
            </div>
        `,
    };
}

export function emojisPerPersonSlide(stats, gradient) {
    if (!stats.emojis.perPerson.length) return null;
    const maxE = stats.emojis.perPerson[0][1] || 1;
    const rows = stats.emojis.perPerson.map(([name, count], i) => {
        const msgCount = stats.perPerson[name]?.count || 1;
        const ratio = (count / msgCount).toFixed(2);
        const w = ((count / maxE) * 100).toFixed(1);
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
        return `
            <div class="ranking-item">
                <div class="ranking-pos ${posClass}">${i + 1}</div>
                <div class="ranking-bar-wrapper">
                    <div class="ranking-bar-label"><span class="name">${escapeHtml(name)}</span><span class="value">${fmt(count)} (${ratio}/msg)</span></div>
                    <div class="ranking-bar"><div class="ranking-bar-fill" style="--bar-width: ${w}%; background: ${color};"></div></div>
                </div>
            </div>`;
    }).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Emojis</span>
                <h2 class="slide-title">Les fans d'emojis</h2>
                <div class="ranking-list">${rows}</div>
            </div>
        `,
    };
}
