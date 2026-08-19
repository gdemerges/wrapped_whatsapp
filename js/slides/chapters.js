import { fmt } from '../utils.js';

const INTENSITY = {
    high:   { label: 'Période intense', icon: '🔥', color: 'var(--accent-orange)' },
    steady: { label: 'Rythme de croisière', icon: '🌊', color: 'var(--accent-blue)' },
    low:    { label: 'Période calme', icon: '🌙', color: 'var(--accent-purple)' },
};

function monthLabel(key) {
    const [y, m] = key.split('-');
    return new Date(Number(y), Number(m) - 1)
        .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function rangeLabel(from, to) {
    return from === to ? monthLabel(from) : `${monthLabel(from)} → ${monthLabel(to)}`;
}

/**
 * The conversation told as a sequence of chapters — the phases where its
 * rhythm durably changed. Gives 28 slides of raw figures a narrative spine.
 */
export function chaptersSlide(stats, gradient) {
    const chapters = stats.chapters || [];
    if (chapters.length < 2) return null;

    const maxAvg = Math.max(...chapters.map(c => c.avgPerMonth), 1);

    const items = chapters.map((c, i) => {
        const meta = INTENSITY[c.intensity] || INTENSITY.steady;
        const height = Math.max(8, (c.avgPerMonth / maxAvg) * 100);
        return `
            <li class="chapter-item" style="--chapter-color:${meta.color};">
                <div class="chapter-spine" aria-hidden="true">
                    <span class="chapter-dot">${meta.icon}</span>
                    <span class="chapter-bar" style="height:${height.toFixed(0)}%;"></span>
                </div>
                <div class="chapter-body">
                    <span class="chapter-index">Chapitre ${i + 1}</span>
                    <h3 class="chapter-title">${meta.label}</h3>
                    <p class="chapter-range">${rangeLabel(c.from, c.to)}</p>
                    <p class="chapter-figures">${fmt(c.total)} messages · ${fmt(c.avgPerMonth)} / mois</p>
                </div>
            </li>`;
    }).join('');

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Chapitres</span>
                <h2 class="slide-title">Votre conversation en ${chapters.length} actes</h2>
                <p class="slide-subtitle">Les moments où le rythme a durablement changé</p>
                <ol class="chapter-list">${items}</ol>
            </div>
        `,
    };
}
