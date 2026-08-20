import { fmt } from '../format.js';
import { t } from '../i18n.js';

const ICONS = { images: '📸', gifs: '🎞️', stickers: '🏷️', videos: '🎬', audio: '🎵', documents: '📄', links: '🔗' };
const label = (key) => t(`media.${key}`);

export function mediaSlide(stats, gradient) {
    const entries = Object.entries(stats.mediaTypes).filter(([, v]) => v > 0);
    if (entries.length === 0) return null;
    const totalMedia = entries.reduce((s, [, v]) => s + v, 0);
    const cards = entries.sort((a, b) => b[1] - a[1]).map(([key, val]) => `
        <div class="stat-card"><div class="stat-value">${ICONS[key] || ''} ${fmt(val)}</div><div class="stat-label">${label(key)}</div></div>
    `).join('');
    return {
        gradient,
        card: {
            gradient,
            tag: t('slide.media.tag'),
            big: { value: fmt(totalMedia), label: t('slide.media.big') },
            grid: entries.sort((a, b) => b[1] - a[1]).slice(0, 6)
                .map(([key, val]) => [`${ICONS[key] || ''} ${fmt(val)}`, label(key)]),
        },
        html: `
            <div class="slide-inner">
                <span class="slide-tag">${t('slide.media.tag')}</span>
                <div class="big-number">${fmt(totalMedia)}</div>
                <div class="big-label">${t('slide.media.big')}</div>
                <div class="stat-grid">${cards}</div>
            </div>
        `,
    };
}
