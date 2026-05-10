import { fmt } from '../utils.js';

const LABELS = { images: 'Images', gifs: 'GIFs', stickers: 'Stickers', videos: 'Videos', audio: 'Audios', documents: 'Documents', links: 'Liens' };
const ICONS  = { images: '📸',     gifs: '🎞️',   stickers: '🏷️',     videos: '🎬',     audio: '🎵',    documents: '📄',         links: '🔗' };

export function mediaSlide(stats, gradient) {
    const entries = Object.entries(stats.mediaTypes).filter(([, v]) => v > 0);
    if (entries.length === 0) return null;
    const totalMedia = entries.reduce((s, [, v]) => s + v, 0);
    const cards = entries.sort((a, b) => b[1] - a[1]).map(([key, val]) => `
        <div class="stat-card"><div class="stat-value">${ICONS[key] || ''} ${fmt(val)}</div><div class="stat-label">${LABELS[key] || key}</div></div>
    `).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Medias</span>
                <div class="big-number">${fmt(totalMedia)}</div>
                <div class="big-label">medias et liens partages</div>
                <div class="stat-grid">${cards}</div>
            </div>
        `,
    };
}
