import { escapeHtml, fmt, fmtTime } from '../utils.js';
import { CHART_COLORS } from './_constants.js';

const MAX_PROFILES = 8;

/** "13h" — the hour a person is most likely to be typing. */
function hourLabel(h) {
    return typeof h === 'number' && h >= 0 ? `${h}h` : '—';
}

/**
 * One identity card per participant: the "who is this person in the chat"
 * view. Everything shown is already computed in stats.js.
 */
export function profilesSlide(stats, gradient) {
    const profiles = (stats.profiles || []).slice(0, MAX_PROFILES);
    if (profiles.length === 0) return null;

    const cards = profiles.map((p, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const traits = [
            ['messages', fmt(p.count)],
            ['du total', `${p.percent}%`],
            ['car. / msg', fmt(p.avgLen)],
            ['heure fétiche', hourLabel(p.peakHour)],
            ['réponse', p.avgResponseMin != null ? fmtTime(p.avgResponseMin) : '—'],
            ['jours lancés', fmt(p.initiations)],
        ].map(([label, value]) =>
            `<div class="profile-trait"><span class="profile-trait-value">${value}</span><span class="profile-trait-label">${label}</span></div>`
        ).join('');

        const badges = [
            p.topEmoji ? `<span class="profile-badge" style="border-color:${color};">${escapeHtml(p.topEmoji[0])} <small>×${fmt(p.topEmoji[1])}</small></span>` : '',
            p.signatureWord ? `<span class="profile-badge" style="border-color:${color};">« ${escapeHtml(p.signatureWord[0])} »</span>` : '',
            p.topDomain ? `<span class="profile-badge" style="border-color:${color};">🔗 ${escapeHtml(p.topDomain[0])}</span>` : '',
        ].filter(Boolean).join('');

        return `
            <article class="profile-card" style="--profile-color:${color};">
                <header class="profile-head">
                    <span class="profile-avatar" aria-hidden="true">${escapeHtml(initials(p.name))}</span>
                    <h3>${escapeHtml(p.name)}</h3>
                </header>
                <div class="profile-traits">${traits}</div>
                <div class="profile-badges">${badges}</div>
            </article>`;
    }).join('');

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Profils</span>
                <h2 class="slide-title">Carte d'identité de chacun</h2>
                <div class="profile-grid">${cards}</div>
            </div>
        `,
    };
}

function initials(name) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => [...p][0] || '').join('').toUpperCase() || '?';
}
