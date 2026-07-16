import { escapeHtml } from '../utils.js';
import { CHART_COLORS } from './_constants.js';

export function topWordsSlide(stats, gradient) {
    const wordTags = stats.topWords.slice(0, 25).map(([word, count], i) => {
        const size = 0.75 + (1 - i / 25) * 0.8;
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const opacity = 0.15 + (1 - i / 25) * 0.2;
        const bg = color + Math.round(opacity * 255).toString(16).padStart(2, '0');
        return `<span class="word-tag" style="font-size:${size}rem;background:${bg};color:${color};">${escapeHtml(word)} <small style="opacity:0.6;">${count}</small></span>`;
    }).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Vocabulaire</span>
                <h2 class="slide-title">Les mots les plus utilisés</h2>
                <div class="words-cloud">${wordTags}</div>
            </div>
        `,
    };
}

export function uniqueWordsSlide(stats, gradient) {
    const uniqEntries = Object.entries(stats.uniqueWordsPerPerson || {}).filter(([, v]) => v.length > 0);
    if (uniqEntries.length === 0) return null;
    const blocks = uniqEntries.slice(0, 6).map(([author, words], i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const tags = words.slice(0, 8).map(([w, c]) => `<span class="word-tag" style="background:${color}33;color:${color};">${escapeHtml(w)} <small>${c}</small></span>`).join('');
        return `<div class="uniq-block"><h4 style="color:${color};">${escapeHtml(author)}</h4><div class="words-cloud">${tags}</div></div>`;
    }).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Signature</span>
                <h2 class="slide-title">Les mots de chacun</h2>
                <p class="slide-subtitle">Mots utilisés uniquement par une seule personne</p>
                <div class="uniq-grid">${blocks}</div>
            </div>
        `,
    };
}
