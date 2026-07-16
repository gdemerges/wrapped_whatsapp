import { escapeHtml, fmt, fmtTime } from '../utils.js';
import { CHART_COLORS } from './_constants.js';

function signatureWord(stats, author) {
    const list = stats.uniqueWordsPerPerson?.[author];
    return list && list[0] ? list[0] : null;
}

/**
 * Duo board: side-by-side comparison for 2-person conversations.
 */
export function duoBoardSlide(stats, gradient) {
    if (stats.participants !== 2 || stats.ranking.length !== 2) return null;
    const [a, b] = stats.ranking;
    const [nameA, pA] = a;
    const [nameB, pB] = b;

    const colorA = CHART_COLORS[0];
    const colorB = CHART_COLORS[1];

    const sigA = signatureWord(stats, nameA);
    const sigB = signatureWord(stats, nameB);

    const cell = (value, label) => `<div class="duo-cell"><div class="duo-value">${value}</div><div class="duo-label">${label}</div></div>`;

    const winnerArrow = (av, bv, higherIsBetter = true) => {
        if (av === bv) return '=';
        const aWins = higherIsBetter ? av > bv : av < bv;
        return aWins ? '◀' : '▶';
    };

    const rtA = pA.avgResponseMin;
    const rtB = pB.avgResponseMin;

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Duo</span>
                <h2 class="slide-title">Vous deux</h2>
                <div class="duo-board">
                    <div class="duo-col" style="border-color:${colorA};">
                        <h3 style="color:${colorA};">${escapeHtml(nameA)}</h3>
                        ${cell(fmt(pA.count), 'messages')}
                        ${cell(`${pA.percent}%`, 'du total')}
                        ${cell(`${pA.avgLen}`, 'car. / msg')}
                        ${cell(rtA != null ? fmtTime(rtA) : '—', 'temps de réponse')}
                        ${cell(fmt(pA.emojis), 'emojis')}
                        ${cell(fmt(pA.media), 'médias')}
                        ${sigA ? cell(escapeHtml(sigA[0]), 'son mot signature') : ''}
                    </div>
                    <div class="duo-vs">
                        <div class="duo-arrow">${winnerArrow(pA.count, pB.count)}</div>
                        <div class="duo-arrow">${winnerArrow(+pA.percent, +pB.percent)}</div>
                        <div class="duo-arrow">${winnerArrow(pA.avgLen, pB.avgLen)}</div>
                        <div class="duo-arrow">${rtA != null && rtB != null ? winnerArrow(rtA, rtB, false) : '—'}</div>
                        <div class="duo-arrow">${winnerArrow(pA.emojis, pB.emojis)}</div>
                        <div class="duo-arrow">${winnerArrow(pA.media, pB.media)}</div>
                        ${sigA || sigB ? '<div class="duo-arrow">—</div>' : ''}
                    </div>
                    <div class="duo-col" style="border-color:${colorB};">
                        <h3 style="color:${colorB};">${escapeHtml(nameB)}</h3>
                        ${cell(fmt(pB.count), 'messages')}
                        ${cell(`${pB.percent}%`, 'du total')}
                        ${cell(`${pB.avgLen}`, 'car. / msg')}
                        ${cell(rtB != null ? fmtTime(rtB) : '—', 'temps de réponse')}
                        ${cell(fmt(pB.emojis), 'emojis')}
                        ${cell(fmt(pB.media), 'médias')}
                        ${sigB ? cell(escapeHtml(sigB[0]), 'son mot signature') : ''}
                    </div>
                </div>
            </div>
        `,
    };
}

/**
 * Side-by-side signature vocabulary for 2 persons.
 */
export function duoWordsSlide(stats, gradient) {
    if (stats.participants !== 2 || stats.ranking.length !== 2) return null;
    const [nameA] = stats.ranking[0];
    const [nameB] = stats.ranking[1];

    const wordsA = stats.uniqueWordsPerPerson?.[nameA] || [];
    const wordsB = stats.uniqueWordsPerPerson?.[nameB] || [];
    if (wordsA.length === 0 && wordsB.length === 0) return null;

    const colorA = CHART_COLORS[0];
    const colorB = CHART_COLORS[1];
    const tag = (w, c, color) =>
        `<span class="word-tag" style="background:${color}33;color:${color};">${escapeHtml(w)} <small>${c}</small></span>`;
    const cloudA = wordsA.slice(0, 10).map(([w, c]) => tag(w, c, colorA)).join('');
    const cloudB = wordsB.slice(0, 10).map(([w, c]) => tag(w, c, colorB)).join('');

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Signature</span>
                <h2 class="slide-title">Le vocabulaire de chacun</h2>
                <p class="slide-subtitle">Mots utilisés uniquement par cette personne</p>
                <div class="duo-words">
                    <div class="duo-words-col">
                        <h4 style="color:${colorA};">${escapeHtml(nameA)}</h4>
                        <div class="words-cloud">${cloudA || '<em style="opacity:0.5;">aucun mot exclusif</em>'}</div>
                    </div>
                    <div class="duo-words-col">
                        <h4 style="color:${colorB};">${escapeHtml(nameB)}</h4>
                        <div class="words-cloud">${cloudB || '<em style="opacity:0.5;">aucun mot exclusif</em>'}</div>
                    </div>
                </div>
            </div>
        `,
    };
}
