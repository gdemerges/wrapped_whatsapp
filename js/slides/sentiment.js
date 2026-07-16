import { escapeHtml } from '../utils.js';
import { CHART_COLORS } from './_constants.js';
import { monthLabels, cssVar } from './_helpers.js';

export function ambianceSlide(stats, gradient) {
    const st = stats.sentiment;
    if (!st || st.perPerson.length === 0) return null;
    const items = [];
    if (st.sweetest?.compliment > 0)
        items.push(`<div class="fun-fact"><div class="fun-fact-icon">🌸</div><div class="fun-fact-text">Le plus gentil : <strong>${escapeHtml(st.sweetest.author)}</strong> (${st.sweetest.compliment} compliments)</div></div>`);
    if (st.sharpest?.insult > 0)
        items.push(`<div class="fun-fact"><div class="fun-fact-icon">🌶️</div><div class="fun-fact-text">Le plus piquant : <strong>${escapeHtml(st.sharpest.author)}</strong> (${st.sharpest.insult} piques)</div></div>`);
    if (st.mostPositive)
        items.push(`<div class="fun-fact"><div class="fun-fact-icon">☀️</div><div class="fun-fact-text">Ton le plus positif : <strong>${escapeHtml(st.mostPositive.author)}</strong></div></div>`);
    if (st.mostNegative && st.mostNegative !== st.mostPositive)
        items.push(`<div class="fun-fact"><div class="fun-fact-icon">🌧️</div><div class="fun-fact-text">Ton le plus negatif : <strong>${escapeHtml(st.mostNegative.author)}</strong></div></div>`);
    if (st.mostVolatile && st.mostVolatile !== st.mostStable)
        items.push(`<div class="fun-fact"><div class="fun-fact-icon">🎢</div><div class="fun-fact-text">Le plus en montagnes russes : <strong>${escapeHtml(st.mostVolatile.author)}</strong></div></div>`);
    if (st.mostStable && st.perPerson.length > 1)
        items.push(`<div class="fun-fact"><div class="fun-fact-icon">🧘</div><div class="fun-fact-text">Le plus constant : <strong>${escapeHtml(st.mostStable.author)}</strong></div></div>`);
    if (!st.mlEnabled)
        items.push(`<div class="fun-fact"><div class="fun-fact-icon">ℹ️</div><div class="fun-fact-text">Analyse ML indisponible — données basées sur le lexique</div></div>`);
    if (items.length === 0) return null;
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Ton</span>
                <h2 class="slide-title">L'ambiance du chat</h2>
                <div class="fun-facts">${items.join('')}</div>
            </div>
        `,
    };
}

export function sentimentTimelineSlide(stats, gradient) {
    const st = stats.sentiment;
    if (!st || !st.mlEnabled) return null;
    const months = Object.keys(st.monthly || {}).sort();
    const authors = st.perPerson.filter(p => p.sampled > 0).map(p => p.author);
    if (months.length < 3) return null;
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Atmosphere</span>
                <h2 class="slide-title">L'ambiance dans le temps</h2>
                <div class="chart-wrapper"><canvas id="chart-sent-timeline" height="280"></canvas></div>
            </div>
        `,
        chart: (_, slide) => {
            const canvas = slide.querySelector('#chart-sent-timeline');
            const labels = monthLabels(months);
            const datasets = [];
            datasets.push({
                label: 'Moyenne',
                data: months.map(m => {
                    const v = st.monthly[m];
                    return v != null ? Math.round(v * 100) : null;
                }),
                borderColor: 'rgba(255,255,255,0.6)',
                borderWidth: 2,
                borderDash: [5, 3],
                pointRadius: 2,
                tension: 0.3,
                fill: false,
                spanGaps: true,
            });
            authors.forEach((author, idx) => {
                const color = CHART_COLORS[idx % CHART_COLORS.length];
                datasets.push({
                    label: author,
                    data: months.map(m => {
                        const v = st.monthlyPerPerson[author]?.[m];
                        return v != null ? Math.round(v * 100) : null;
                    }),
                    borderColor: color,
                    backgroundColor: color + '22',
                    borderWidth: 2,
                    pointRadius: 3,
                    tension: 0.3,
                    fill: false,
                    spanGaps: true,
                });
            });
            new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            display: authors.length <= 5,
                            position: 'bottom',
                            labels: { color: cssVar('--text-secondary'), padding: 8, font: { size: 9 }, boxWidth: 10 },
                        },
                    },
                    scales: {
                        x: { ticks: { color: cssVar('--text-muted'), font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
                        y: {
                            ticks: { color: cssVar('--text-muted'), callback: v => `${v > 0 ? '+' : ''}${v}%` },
                            grid: { color: cssVar('--grid-line') },
                        },
                    },
                },
            });
        },
    };
}

export function moodHourlySlide(stats, gradient) {
    const st = stats.sentiment;
    if (!st || !st.mlEnabled) return null;
    const sentHourly = st.sentimentHourly ?? [];
    const validHours = sentHourly.map((v, h) => ({ h, v })).filter(x => x.v != null);
    if (validHours.length < 8) return null;
    const bestHour  = [...validHours].sort((a, b) => b.v - a.v)[0];
    const worstHour = [...validHours].sort((a, b) => a.v - b.v)[0];
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Humeur</span>
                <h2 class="slide-title">L'horloge des humeurs</h2>
                <div class="chart-wrapper"><canvas id="chart-sent-hourly" height="200"></canvas></div>
                <div class="fun-facts" style="margin-top:0.75rem;">
                    ${bestHour  ? `<div class="fun-fact"><div class="fun-fact-icon">🌞</div><div class="fun-fact-text">Heure la plus positive : <strong>${bestHour.h}h</strong></div></div>` : ''}
                    ${worstHour ? `<div class="fun-fact"><div class="fun-fact-icon">😴</div><div class="fun-fact-text">Heure la plus negative : <strong>${worstHour.h}h</strong></div></div>` : ''}
                </div>
            </div>
        `,
        chart: (_, slide) => {
            const canvas = slide.querySelector('#chart-sent-hourly');
            const labels = Array.from({ length: 24 }, (_, h) => `${h}h`);
            const data   = sentHourly.map(v => v != null ? Math.round(v * 100) : null);
            const bgColors = data.map(v => {
                if (v == null) return 'transparent';
                const alpha = 0.3 + Math.min(0.7, Math.abs(v) / 80);
                return v >= 0 ? `rgba(16,185,129,${alpha})` : `rgba(239,68,68,${alpha})`;
            });
            new Chart(canvas.getContext('2d'), {
                type: 'bar',
                data: { labels, datasets: [{ data, backgroundColor: bgColors, borderRadius: 3 }] },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: cssVar('--text-muted'), font: { size: 9 } }, grid: { display: false } },
                        y: { ticks: { color: cssVar('--text-muted'), callback: v => `${v > 0 ? '+' : ''}${v}%` }, grid: { color: cssVar('--grid-line') } },
                    },
                },
            });
        },
    };
}

export function momentsSlide(stats, gradient) {
    const st = stats.sentiment;
    if (!st || !st.mlEnabled) return null;
    const hasBest  = st.bestDays?.length > 0;
    const hasWorst = st.worstDays?.length > 0;
    if (!hasBest && !hasWorst) return null;
    const fmtDay = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const moodIcon  = v => v > 0.5 ? '🌟' : v > 0.15 ? '☀️' : v < -0.5 ? '⛈️' : '🌧️';
    const moodLabel = v => v > 0.5 ? 'super positif' : v > 0.15 ? 'bonne ambiance' : v < -0.5 ? 'vraiment difficile' : 'ambiance tendue';
    const bestItems = (st.bestDays || []).slice(0, 3).map(d =>
        `<div class="fun-fact"><div class="fun-fact-icon">${moodIcon(d.mean)}</div><div class="fun-fact-text"><strong>${fmtDay(d.date)}</strong> — ${moodLabel(d.mean)}</div></div>`
    ).join('');
    const worstItems = (st.worstDays || [])
        .filter(d => !(st.bestDays || []).some(b => b.date === d.date))
        .slice(0, 2).map(d =>
            `<div class="fun-fact"><div class="fun-fact-icon">${moodIcon(d.mean)}</div><div class="fun-fact-text"><strong>${fmtDay(d.date)}</strong> — ${moodLabel(d.mean)}</div></div>`
        ).join('');
    if (!bestItems && !worstItems) return null;
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Moments</span>
                <h2 class="slide-title">Vos journees marquantes</h2>
                ${bestItems  ? `<p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:0.4rem;">Meilleures journees ✨</p>${bestItems}` : ''}
                ${worstItems ? `<p style="color:var(--text-muted);font-size:0.8rem;margin:0.75rem 0 0.4rem;">Journees plus difficiles</p>${worstItems}` : ''}
            </div>
        `,
    };
}

export function influenceSlide(stats, gradient) {
    const st = stats.sentiment;
    if (!st || !st.mlEnabled) return null;
    const after = Object.entries(st.afterAuthor || {})
        .sort((a, b) => Math.abs(b[1].mean) - Math.abs(a[1].mean))
        .slice(0, 6);
    if (after.length < 2) return null;
    const items = after.map(([author, { mean }]) => {
        const pct  = Math.round(mean * 100);
        const icon = pct > 10 ? '🌟' : pct > 0 ? '☀️' : pct < -10 ? '⛈️' : '🌧️';
        const desc = pct >= 0
            ? `+${pct}% de positivite apres ses messages`
            : `${pct}% d'ambiance apres ses messages`;
        return `<div class="fun-fact"><div class="fun-fact-icon">${icon}</div><div class="fun-fact-text"><strong>${escapeHtml(author)}</strong> : ${desc}</div></div>`;
    }).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Influence</span>
                <h2 class="slide-title">Qui met de bonne humeur ?</h2>
                <div class="fun-facts">${items}</div>
            </div>
        `,
    };
}
