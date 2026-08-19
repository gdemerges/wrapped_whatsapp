import { escapeHtml, fmt } from '../utils.js';
import { CHART_COLORS } from './_constants.js';
import { barsFrom } from './_card.js';

/** Where the conversation sends each other — top shared domains. */
export function linksSlide(stats, gradient) {
    const domains = stats.topDomains || [];
    if (domains.length < 3) return null;

    const max = domains[0][1] || 1;
    const rows = domains.slice(0, 8).map(([domain, count], i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const w = ((count / max) * 100).toFixed(1);
        return `
            <div class="ranking-item">
                <div class="ranking-pos ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal'}">${i + 1}</div>
                <div class="ranking-bar-wrapper">
                    <div class="ranking-bar-label"><span class="name">${escapeHtml(domain)}</span><span class="value">${fmt(count)}</span></div>
                    <div class="ranking-bar"><div class="ranking-bar-fill" style="--bar-width: ${w}%; background: ${color};"></div></div>
                </div>
            </div>`;
    }).join('');

    return {
        gradient,
        card: {
            gradient,
            tag: 'Liens',
            big: { value: fmt(stats.totalLinks), label: 'liens partagés' },
            subtitle: 'Les sites qui reviennent le plus',
            bars: barsFrom(domains, d => d[1], d => fmt(d[1])),
        },
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Liens</span>
                <div class="big-number">${fmt(stats.totalLinks)}</div>
                <div class="big-label">liens partagés</div>
                <p class="slide-subtitle">Les sites qui reviennent le plus</p>
                <div class="ranking-list">${rows}</div>
            </div>
        `,
    };
}
