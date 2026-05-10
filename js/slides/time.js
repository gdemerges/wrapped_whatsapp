import { DAYS_FR } from '../utils.js';
import { CHART_COLORS } from './_constants.js';
import { monthLabels } from './_helpers.js';

export function monthlySlide(stats, gradient) {
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Activite</span>
                <h2 class="slide-title">Messages par mois</h2>
                <div class="chart-wrapper"><canvas id="chart-monthly" height="250"></canvas></div>
            </div>
        `,
        chart: (ctx) => {
            const months = Object.keys(stats.monthly).sort();
            const values = months.map(k => stats.monthly[k]);
            new Chart(ctx, {
                type: 'bar',
                data: { labels: monthLabels(months), datasets: [{ data: values, backgroundColor: values.map((_, i) => `hsl(${260 + (i / Math.max(values.length - 1, 1)) * 100}, 70%, 60%)`), borderRadius: 4 }] },
                options: {
                    responsive: true, plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: 'var(--text-secondary)', maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
                        y: { ticks: { color: 'var(--text-secondary)' }, grid: { color: 'var(--grid-line)' } },
                    },
                },
            });
        },
    };
}

export function heatmapSlide(stats, gradient) {
    const maxHeat = Math.max(...stats.heatmap.flat());
    const heatCells = [];
    heatCells.push('<div class="heatmap-label"></div>');
    for (let h = 0; h < 24; h++) heatCells.push(`<div class="heatmap-label hour-label">${h}h</div>`);
    for (let d = 0; d < 7; d++) {
        heatCells.push(`<div class="heatmap-label">${DAYS_FR[d]}</div>`);
        for (let h = 0; h < 24; h++) {
            const val = stats.heatmap[d][h];
            const intensity = maxHeat > 0 ? val / maxHeat : 0;
            const alpha = 0.1 + intensity * 0.9;
            const hue = 280 - intensity * 100;
            const color = val === 0 ? 'rgba(255,255,255,0.03)' : `hsla(${hue}, 70%, 55%, ${alpha})`;
            heatCells.push(`<div class="heatmap-cell" style="background:${color}" data-tooltip="${DAYS_FR[d]} ${h}h: ${val} msgs"></div>`);
        }
    }
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Patterns</span>
                <h2 class="slide-title">Quand discutez-vous ?</h2>
                <p class="slide-subtitle">Heure de pointe : <strong>${stats.peakHour}h</strong> | Jour prefere : <strong>${stats.peakDay}</strong></p>
                <div class="heatmap-container"><div class="heatmap-grid">${heatCells.join('')}</div></div>
            </div>
        `,
    };
}

export function hourlyWeekdaySlide(stats, gradient) {
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Rythme</span>
                <h2 class="slide-title">L'horloge du groupe</h2>
                <div class="chart-wrapper"><canvas id="chart-hourly" height="200"></canvas></div>
                <div class="chart-wrapper" style="margin-top:1rem;"><canvas id="chart-weekday" height="160"></canvas></div>
            </div>
        `,
        chart: (_, slide) => {
            const hourlyCtx = slide.querySelector('#chart-hourly');
            new Chart(hourlyCtx, {
                type: 'bar',
                data: {
                    labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
                    datasets: [{
                        data: stats.hourly,
                        backgroundColor: stats.hourly.map((_, i) => {
                            const h = (i < 6 || i > 21) ? 260 : (i < 12 ? 45 : 180);
                            return `hsla(${h}, 70%, 55%, 0.8)`;
                        }),
                        borderRadius: 3,
                    }],
                },
                options: {
                    responsive: true, plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: 'var(--text-muted)', font: { size: 9 } }, grid: { display: false } },
                        y: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'var(--grid-line)' } },
                    },
                },
            });
            const weekdayCtx = slide.querySelector('#chart-weekday');
            new Chart(weekdayCtx, {
                type: 'bar',
                data: { labels: DAYS_FR, datasets: [{ data: stats.weekday, backgroundColor: CHART_COLORS.slice(0, 7), borderRadius: 4 }] },
                options: {
                    responsive: true, indexAxis: 'y', plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'var(--grid-line)' } },
                        y: { ticks: { color: 'var(--text-secondary)', font: { size: 11 } }, grid: { display: false } },
                    },
                },
            });
        },
    };
}
