import { escapeHtml, fmt } from '../utils.js';
import { CHART_COLORS } from './_constants.js';
import { rankingBars, monthLabels, cssVar } from './_helpers.js';

export function topMessagersSlide(stats, gradient) {
    const top10 = stats.ranking;
    const maxCount = top10[0]?.[1].count || 1;
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Classement</span>
                <h2 class="slide-title">Les plus bavard·e·s</h2>
                <div class="ranking-list">${rankingBars(top10, r => r[1].count, r => `${fmt(r[1].count)} (${r[1].percent}%)`, maxCount)}</div>
            </div>
        `,
    };
}

export function pieSlide(stats, gradient) {
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Répartition</span>
                <h2 class="slide-title">Qui parle le plus ?</h2>
                <div class="chart-wrapper" style="max-width:350px;margin:1.5rem auto;">
                    <canvas id="chart-pie" height="350"></canvas>
                </div>
            </div>
        `,
        chart: (ctx) => {
            const topN = stats.ranking.slice(0, 8);
            const othersCount = stats.ranking.slice(8).reduce((s, r) => s + r[1].count, 0);
            const labels = topN.map(r => r[0]);
            const data = topN.map(r => r[1].count);
            if (othersCount > 0) { labels.push('Autres'); data.push(othersCount); }
            new Chart(ctx, {
                type: 'doughnut',
                data: { labels, datasets: [{ data, backgroundColor: CHART_COLORS.slice(0, labels.length), borderWidth: 2, borderColor: 'rgba(0,0,0,0.3)' }] },
                options: {
                    responsive: true, maintainAspectRatio: true,
                    plugins: { legend: { position: 'bottom', labels: { color: cssVar('--text-primary'), padding: 12, font: { size: 11 } } } },
                    cutout: '55%',
                },
            });
        },
    };
}

export function evolutionPerPersonSlide(stats, gradient) {
    const allAuthors = stats.ranking.map(r => r[0]);
    const filterBtns = ['Tous', ...allAuthors].map((name, i) => {
        const active = i === 0 ? ' active' : '';
        return `<button class="filter-btn${active}" data-filter="${i === 0 ? '__all__' : escapeHtml(name)}">${escapeHtml(name)}</button>`;
    }).join('');

    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Évolution</span>
                <h2 class="slide-title">Qui parle quand ?</h2>
                <div class="filter-bar" id="evolution-filters">${filterBtns}</div>
                <div class="chart-wrapper"><canvas id="chart-evolution" height="300"></canvas></div>
            </div>
        `,
        chart: (_, slide) => {
            const canvas = slide.querySelector('#chart-evolution');
            const months = Object.keys(stats.monthly).sort();
            const labels = monthLabels(months);

            function makeDatasets(filter) {
                const authors = filter === '__all__' ? allAuthors : [filter];
                return authors.map((author) => {
                    const idx = allAuthors.indexOf(author);
                    const data = months.map(m => stats.monthlyPerPerson[author]?.[m] || 0);
                    const color = CHART_COLORS[idx % CHART_COLORS.length];
                    return {
                        label: author, data,
                        borderColor: color, backgroundColor: color + '33',
                        borderWidth: filter === '__all__' ? 2 : 3,
                        pointRadius: filter === '__all__' ? 2 : 4,
                        pointHoverRadius: 6, tension: 0.3,
                        fill: filter !== '__all__',
                    };
                });
            }

            const chart = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: { labels, datasets: makeDatasets('__all__') },
                options: {
                    responsive: true, interaction: { mode: 'index', intersect: false },
                    plugins: { legend: { display: true, position: 'bottom', labels: { color: cssVar('--text-secondary'), padding: 8, font: { size: 9 }, boxWidth: 10 } } },
                    scales: {
                        x: { ticks: { color: cssVar('--text-muted'), font: { size: 9 } }, grid: { display: false } },
                        y: { ticks: { color: cssVar('--text-muted') }, grid: { color: cssVar('--grid-line') }, beginAtZero: true },
                    },
                },
            });

            slide.querySelector('#evolution-filters').addEventListener('click', (e) => {
                const btn = e.target.closest('.filter-btn');
                if (!btn) return;
                slide.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filter = btn.dataset.filter;
                chart.data.datasets = makeDatasets(filter);
                chart.options.plugins.legend.display = filter === '__all__';
                chart.update();
            });
        },
    };
}

export function messageLengthSlide(stats, gradient) {
    const avgLenRanking = [...stats.ranking].sort((a, b) => b[1].avgLen - a[1].avgLen);
    const maxAvgLen = avgLenRanking[0]?.[1].avgLen || 1;
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Longueur</span>
                <h2 class="slide-title">Qui ecrit les plus longs messages ?</h2>
                <p class="slide-subtitle">Longueur moyenne par message (en caractères)</p>
                <div class="ranking-list">${rankingBars(avgLenRanking, r => r[1].avgLen, r => `${r[1].avgLen} car.`, maxAvgLen)}</div>
            </div>
        `,
    };
}

export function initiatorSlide(stats, gradient) {
    if (!stats.initiator || stats.initiator.length === 0) return null;
    const totalInit = stats.initiator.reduce((s, [, n]) => s + n, 0);
    const maxInit = stats.initiator[0][1];
    const bars = stats.initiator.map(([name, n], i) => {
        const w = ((n / maxInit) * 100).toFixed(1);
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
        const pct = ((n / totalInit) * 100).toFixed(1);
        return `
            <div class="ranking-item">
                <div class="ranking-pos ${posClass}">${i + 1}</div>
                <div class="ranking-bar-wrapper">
                    <div class="ranking-bar-label"><span class="name">${escapeHtml(name)}</span><span class="value">${n} jours (${pct}%)</span></div>
                    <div class="ranking-bar"><div class="ranking-bar-fill" style="--bar-width: ${w}%; background: ${color};"></div></div>
                </div>
            </div>`;
    }).join('');
    return {
        gradient,
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Initiative</span>
                <h2 class="slide-title">Qui lance la conversation ?</h2>
                <p class="slide-subtitle">Nombre de jours ou cette personne a envoyé le premier message</p>
                <div class="ranking-list">${bars}</div>
            </div>
        `,
    };
}
