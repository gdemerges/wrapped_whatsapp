/**
 * Slide generator — builds the Wrapped slides from stats.
 */

import { escapeHtml, fmt, fmtDate, fmtTime, DAYS_FR } from './utils.js';

const GRADIENTS = [
    'slide-gradient-1', 'slide-gradient-2', 'slide-gradient-3',
    'slide-gradient-4', 'slide-gradient-5', 'slide-gradient-6',
    'slide-gradient-7', 'slide-gradient-8', 'slide-gradient-9',
    'slide-gradient-10', 'slide-gradient-11',
];

const CHART_COLORS = [
    '#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F97316',
    '#EAB308', '#06B6D4', '#F43F5E', '#84CC16', '#A855F7',
    '#14B8A6', '#FB923C', '#6366F1', '#D946EF', '#22D3EE',
];

export function generateSlides(stats, comparison = null) {
    const slides = [];
    let gi = 0;
    const g = () => GRADIENTS[gi++ % GRADIENTS.length];

    // ===== Overview =====
    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Ta conversation</span>
                <div class="big-number">${fmt(stats.totalMessages)}</div>
                <div class="big-label">messages echanges</div>
                <p class="slide-subtitle">Du ${fmtDate(stats.startDate)} au ${fmtDate(stats.endDate)}</p>
                <div class="stat-grid">
                    <div class="stat-card"><div class="stat-value">${stats.participants}</div><div class="stat-label">participants</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.totalDays}</div><div class="stat-label">jours</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.avgPerDay}</div><div class="stat-label">messages / jour</div></div>
                    <div class="stat-card"><div class="stat-value">${fmt(stats.totalChars)}</div><div class="stat-label">caracteres</div></div>
                </div>
            </div>
        `,
    });

    // ===== Year comparison (N vs N-1) =====
    if (comparison) {
        const row = (label, d, unit = '') => {
            const pct = d.pct;
            const arrow = pct == null ? '' : pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
            const color = pct == null ? 'var(--text-muted)' : pct > 0 ? 'var(--accent-green)' : 'var(--accent-pink)';
            const pctText = pct == null ? '' : `<span style="color:${color};font-weight:600;">${arrow} ${Math.abs(pct)}%</span>`;
            return `<tr><td>${label}</td><td>${fmt(d.previous)}${unit}</td><td>${fmt(d.current)}${unit}</td><td>${pctText}</td></tr>`;
        };
        slides.push({
            gradient: g(),
            html: `
                <div class="slide-inner">
                    <span class="slide-tag">Comparaison</span>
                    <h2 class="slide-title">Cette annee vs l'annee derniere</h2>
                    <table class="compare-table">
                        <thead><tr><th></th><th>Avant</th><th>Maintenant</th><th>Evolution</th></tr></thead>
                        <tbody>
                            ${row('Messages', comparison.messages)}
                            ${row('Par jour', comparison.avgPerDay)}
                            ${row('Emojis', comparison.emojis)}
                            ${row('Medias', comparison.media)}
                        </tbody>
                    </table>
                </div>
            `,
        });
    }

    // ===== Top Messagers =====
    const top10 = stats.ranking;
    const maxCount = top10[0]?.[1].count || 1;
    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Classement</span>
                <h2 class="slide-title">Les plus bavard·e·s</h2>
                <div class="ranking-list">${rankingBars(top10, r => r[1].count, r => `${fmt(r[1].count)} (${r[1].percent}%)`, maxCount)}</div>
            </div>
        `,
    });

    // ===== Pie =====
    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Repartition</span>
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
                    plugins: { legend: { position: 'bottom', labels: { color: 'var(--text-primary)', padding: 12, font: { size: 11 } } } },
                    cutout: '55%',
                },
            });
        },
    });

    // ===== Monthly timeline =====
    slides.push({
        gradient: g(),
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
            const monthLabels = months.map(m => {
                const [y, mo] = m.split('-');
                return new Date(y, parseInt(mo) - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
            });
            new Chart(ctx, {
                type: 'bar',
                data: { labels: monthLabels, datasets: [{ data: values, backgroundColor: values.map((_, i) => `hsl(${260 + (i / Math.max(values.length - 1, 1)) * 100}, 70%, 60%)`), borderRadius: 4 }] },
                options: {
                    responsive: true, plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: 'var(--text-secondary)', maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
                        y: { ticks: { color: 'var(--text-secondary)' }, grid: { color: 'var(--grid-line)' } },
                    },
                },
            });
        },
    });

    // ===== Evolution per person =====
    const allAuthors = stats.ranking.map(r => r[0]);
    const filterBtns = ['Tous', ...allAuthors].map((name, i) => {
        const active = i === 0 ? ' active' : '';
        return `<button class="filter-btn${active}" data-filter="${i === 0 ? '__all__' : escapeHtml(name)}">${escapeHtml(name)}</button>`;
    }).join('');

    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Evolution</span>
                <h2 class="slide-title">Qui parle quand ?</h2>
                <div class="filter-bar" id="evolution-filters">${filterBtns}</div>
                <div class="chart-wrapper"><canvas id="chart-evolution" height="300"></canvas></div>
            </div>
        `,
        chart: (_, slide) => {
            const canvas = slide.querySelector('#chart-evolution');
            const months = Object.keys(stats.monthly).sort();
            const monthLabels = months.map(m => {
                const [y, mo] = m.split('-');
                return new Date(y, parseInt(mo) - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
            });

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
                data: { labels: monthLabels, datasets: makeDatasets('__all__') },
                options: {
                    responsive: true, interaction: { mode: 'index', intersect: false },
                    plugins: { legend: { display: true, position: 'bottom', labels: { color: 'var(--text-secondary)', padding: 8, font: { size: 9 }, boxWidth: 10 } } },
                    scales: {
                        x: { ticks: { color: 'var(--text-muted)', font: { size: 9 } }, grid: { display: false } },
                        y: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'var(--grid-line)' }, beginAtZero: true },
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
    });

    // ===== Heatmap =====
    slides.push(heatmapSlide(stats, g()));

    // ===== Hourly + weekday =====
    slides.push(hourlyWeekdaySlide(stats, g()));

    // ===== Top words =====
    const wordTags = stats.topWords.slice(0, 25).map(([word, count], i) => {
        const size = 0.75 + (1 - i / 25) * 0.8;
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const opacity = 0.15 + (1 - i / 25) * 0.2;
        const bg = color + Math.round(opacity * 255).toString(16).padStart(2, '0');
        return `<span class="word-tag" style="font-size:${size}rem;background:${bg};color:${color};">${escapeHtml(word)} <small style="opacity:0.6;">${count}</small></span>`;
    }).join('');
    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Vocabulaire</span>
                <h2 class="slide-title">Les mots les plus utilises</h2>
                <div class="words-cloud">${wordTags}</div>
            </div>
        `,
    });

    // ===== NEW: Unique vocabulary per person =====
    const uniqEntries = Object.entries(stats.uniqueWordsPerPerson || {}).filter(([, v]) => v.length > 0);
    if (uniqEntries.length > 0) {
        const blocks = uniqEntries.slice(0, 6).map(([author, words], i) => {
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const tags = words.slice(0, 8).map(([w, c]) => `<span class="word-tag" style="background:${color}33;color:${color};">${escapeHtml(w)} <small>${c}</small></span>`).join('');
            return `<div class="uniq-block"><h4 style="color:${color};">${escapeHtml(author)}</h4><div class="words-cloud">${tags}</div></div>`;
        }).join('');
        slides.push({
            gradient: g(),
            html: `
                <div class="slide-inner">
                    <span class="slide-tag">Signature</span>
                    <h2 class="slide-title">Les mots de chacun</h2>
                    <p class="slide-subtitle">Mots utilises uniquement par une seule personne</p>
                    <div class="uniq-grid">${blocks}</div>
                </div>
            `,
        });
    }

    // ===== Emojis =====
    const emojiItems = stats.emojis.top.slice(0, 12).map(([emoji, count]) =>
        `<div class="emoji-item"><span class="emoji">${escapeHtml(emoji)}</span><span class="emoji-count">${fmt(count)}</span></div>`
    ).join('');
    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Emojis</span>
                <div class="big-number">${fmt(stats.emojis.total)}</div>
                <div class="big-label">emojis envoyes</div>
                <p class="slide-subtitle">${stats.emojis.unique} emojis differents utilises</p>
                <div class="emoji-grid">${emojiItems}</div>
            </div>
        `,
    });

    // ===== NEW: Reactions =====
    if (stats.reactions && stats.reactions.total > 0) {
        const topReactions = stats.reactions.topEmojis.map(([e, n]) =>
            `<div class="emoji-item"><span class="emoji">${escapeHtml(e)}</span><span class="emoji-count">${fmt(n)}</span></div>`
        ).join('');
        const topReacters = stats.reactions.perAuthor.slice(0, 5).map(([name, n]) =>
            `<li><strong>${escapeHtml(name)}</strong> — ${fmt(n)} reactions</li>`
        ).join('');
        slides.push({
            gradient: g(),
            html: `
                <div class="slide-inner">
                    <span class="slide-tag">Reactions</span>
                    <div class="big-number">${fmt(stats.reactions.total)}</div>
                    <div class="big-label">reactions envoyees</div>
                    <div class="emoji-grid">${topReactions}</div>
                    <ul class="plain-list">${topReacters}</ul>
                </div>
            `,
        });
    }

    // ===== Media =====
    const mediaEntries = Object.entries(stats.mediaTypes).filter(([, v]) => v > 0);
    const mediaLabels = { images: 'Images', gifs: 'GIFs', stickers: 'Stickers', videos: 'Videos', audio: 'Audios', documents: 'Documents', links: 'Liens' };
    const mediaIcons = { images: '📸', gifs: '🎞️', stickers: '🏷️', videos: '🎬', audio: '🎵', documents: '📄', links: '🔗' };
    if (mediaEntries.length > 0) {
        const totalMedia = mediaEntries.reduce((s, [, v]) => s + v, 0);
        const mediaCards = mediaEntries.sort((a, b) => b[1] - a[1]).map(([key, val]) => `
            <div class="stat-card"><div class="stat-value">${mediaIcons[key] || ''} ${fmt(val)}</div><div class="stat-label">${mediaLabels[key] || key}</div></div>
        `).join('');
        slides.push({
            gradient: g(),
            html: `
                <div class="slide-inner">
                    <span class="slide-tag">Medias</span>
                    <div class="big-number">${fmt(totalMedia)}</div>
                    <div class="big-label">medias et liens partages</div>
                    <div class="stat-grid">${mediaCards}</div>
                </div>
            `,
        });
    }

    // ===== Message length ranking =====
    const avgLenRanking = [...stats.ranking].sort((a, b) => b[1].avgLen - a[1].avgLen);
    const maxAvgLen = avgLenRanking[0]?.[1].avgLen || 1;
    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Longueur</span>
                <h2 class="slide-title">Qui ecrit les plus longs messages ?</h2>
                <p class="slide-subtitle">Longueur moyenne par message (en caracteres)</p>
                <div class="ranking-list">${rankingBars(avgLenRanking, r => r[1].avgLen, r => `${r[1].avgLen} car.`, maxAvgLen)}</div>
            </div>
        `,
    });

    // ===== NEW: Who initiates =====
    if (stats.initiator && stats.initiator.length > 0) {
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
        slides.push({
            gradient: g(),
            html: `
                <div class="slide-inner">
                    <span class="slide-tag">Initiative</span>
                    <h2 class="slide-title">Qui lance la conversation ?</h2>
                    <p class="slide-subtitle">Nombre de jours ou cette personne a envoye le premier message</p>
                    <div class="ranking-list">${bars}</div>
                </div>
            `,
        });
    }

    // ===== NEW: Ghosting =====
    if (stats.ghosting && stats.ghosting.count > 0) {
        const longest = stats.ghosting.longest.slice(0, 3).map(g => {
            const days = (g.minutes / 1440).toFixed(1);
            return `<li><strong>${escapeHtml(g.silenced)}</strong> ghosté ${days}j, relancé par <strong>${escapeHtml(g.revived)}</strong></li>`;
        }).join('');
        const revivers = stats.ghosting.revivers.slice(0, 3).map(([n, c]) =>
            `<li><strong>${escapeHtml(n)}</strong> a relance ${c} fois</li>`
        ).join('');
        slides.push({
            gradient: g(),
            html: `
                <div class="slide-inner">
                    <span class="slide-tag">Ghosting</span>
                    <h2 class="slide-title">${stats.ghosting.count} grands silences</h2>
                    <p class="slide-subtitle">Quand personne ne parle pendant plus de 24h</p>
                    <h4 style="margin-top:1.5rem;opacity:0.8;">Plus longs silences</h4>
                    <ul class="plain-list">${longest}</ul>
                    <h4 style="margin-top:1.5rem;opacity:0.8;">Qui reprend le plus souvent ?</h4>
                    <ul class="plain-list">${revivers}</ul>
                </div>
            `,
        });
    }

    // ===== Sentiment : ambiance =====
    if (stats.sentiment && stats.sentiment.perPerson.length > 0) {
        const st = stats.sentiment;
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
        if (items.length > 0) {
            slides.push({
                gradient: g(),
                html: `
                    <div class="slide-inner">
                        <span class="slide-tag">Ton</span>
                        <h2 class="slide-title">L'ambiance du chat</h2>
                        <div class="fun-facts">${items.join('')}</div>
                    </div>
                `,
            });
        }

        // ===== Sentiment dans le temps =====
        const sentMonths = Object.keys(st.monthly || {}).sort();
        const sentAuthors = st.perPerson.filter(p => p.sampled > 0).map(p => p.author);
        if (st.mlEnabled && sentMonths.length >= 3) {
            slides.push({
                gradient: g(),
                html: `
                    <div class="slide-inner">
                        <span class="slide-tag">Atmosphere</span>
                        <h2 class="slide-title">L'ambiance dans le temps</h2>
                        <div class="chart-wrapper"><canvas id="chart-sent-timeline" height="280"></canvas></div>
                    </div>
                `,
                chart: (_, slide) => {
                    const canvas = slide.querySelector('#chart-sent-timeline');
                    const monthLabels = sentMonths.map(m => {
                        const [y, mo] = m.split('-');
                        return new Date(y, parseInt(mo) - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
                    });
                    const datasets = [];
                    // Global average line (dashed white).
                    datasets.push({
                        label: 'Moyenne',
                        data: sentMonths.map(m => {
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
                    sentAuthors.forEach((author, idx) => {
                        const color = CHART_COLORS[idx % CHART_COLORS.length];
                        datasets.push({
                            label: author,
                            data: sentMonths.map(m => {
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
                        data: { labels: monthLabels, datasets },
                        options: {
                            responsive: true,
                            interaction: { mode: 'index', intersect: false },
                            plugins: {
                                legend: {
                                    display: sentAuthors.length <= 5,
                                    position: 'bottom',
                                    labels: { color: 'var(--text-secondary)', padding: 8, font: { size: 9 }, boxWidth: 10 },
                                },
                            },
                            scales: {
                                x: { ticks: { color: 'var(--text-muted)', font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
                                y: {
                                    ticks: { color: 'var(--text-muted)', callback: v => `${v > 0 ? '+' : ''}${v}%` },
                                    grid: { color: 'var(--grid-line)' },
                                },
                            },
                        },
                    });
                },
            });
        }

        // ===== Horloge des humeurs =====
        const sentHourly = st.sentimentHourly ?? [];
        const validHours = sentHourly.map((v, h) => ({ h, v })).filter(x => x.v != null);
        if (st.mlEnabled && validHours.length >= 8) {
            const bestHour  = [...validHours].sort((a, b) => b.v - a.v)[0];
            const worstHour = [...validHours].sort((a, b) => a.v - b.v)[0];
            slides.push({
                gradient: g(),
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
                                x: { ticks: { color: 'var(--text-muted)', font: { size: 9 } }, grid: { display: false } },
                                y: { ticks: { color: 'var(--text-muted)', callback: v => `${v > 0 ? '+' : ''}${v}%` }, grid: { color: 'var(--grid-line)' } },
                            },
                        },
                    });
                },
            });
        }

        // ===== Moments forts =====
        const hasBest  = st.bestDays?.length > 0;
        const hasWorst = st.worstDays?.length > 0;
        if (st.mlEnabled && (hasBest || hasWorst)) {
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
            if (bestItems || worstItems) {
                slides.push({
                    gradient: g(),
                    html: `
                        <div class="slide-inner">
                            <span class="slide-tag">Moments</span>
                            <h2 class="slide-title">Vos journees marquantes</h2>
                            ${bestItems  ? `<p style="color:var(--text-muted);font-size:0.8rem;margin-bottom:0.4rem;">Meilleures journees ✨</p>${bestItems}` : ''}
                            ${worstItems ? `<p style="color:var(--text-muted);font-size:0.8rem;margin:0.75rem 0 0.4rem;">Journees plus difficiles</p>${worstItems}` : ''}
                        </div>
                    `,
                });
            }
        }

        // ===== Sentiment dirigé =====
        const afterEntries = Object.entries(st.afterAuthor || {})
            .sort((a, b) => Math.abs(b[1].mean) - Math.abs(a[1].mean))
            .slice(0, 6);
        if (st.mlEnabled && afterEntries.length >= 2) {
            const afterItems = afterEntries.map(([author, { mean }]) => {
                const pct  = Math.round(mean * 100);
                const icon = pct > 10 ? '🌟' : pct > 0 ? '☀️' : pct < -10 ? '⛈️' : '🌧️';
                const desc = pct >= 0
                    ? `+${pct}% de positivite apres ses messages`
                    : `${pct}% d'ambiance apres ses messages`;
                return `<div class="fun-fact"><div class="fun-fact-icon">${icon}</div><div class="fun-fact-text"><strong>${escapeHtml(author)}</strong> : ${desc}</div></div>`;
            }).join('');
            slides.push({
                gradient: g(),
                html: `
                    <div class="slide-inner">
                        <span class="slide-tag">Influence</span>
                        <h2 class="slide-title">Qui met de bonne humeur ?</h2>
                        <div class="fun-facts">${afterItems}</div>
                    </div>
                `,
            });
        }
    }

    // ===== Compatibility (2 personnes) =====
    if (stats.compatibility) {
        const c = stats.compatibility;
        slides.push({
            gradient: g(),
            html: `
                <div class="slide-inner">
                    <span class="slide-tag">Compatibilite</span>
                    <div class="big-number">${c.score}<span style="font-size:2rem;opacity:0.7;">/100</span></div>
                    <div class="big-label">score de compatibilite</div>
                    <div class="stat-grid">
                        <div class="stat-card"><div class="stat-value">${c.components.lengthSimilarity}</div><div class="stat-label">longueurs similaires</div></div>
                        <div class="stat-card"><div class="stat-value">${c.components.volumeBalance}</div><div class="stat-label">equilibre des messages</div></div>
                        <div class="stat-card"><div class="stat-value">${c.components.reciprocity}</div><div class="stat-label">reciprocite</div></div>
                        <div class="stat-card"><div class="stat-value">${c.components.consistency}</div><div class="stat-label">regularite</div></div>
                    </div>
                </div>
            `,
        });
    }

    // ===== Fun facts =====
    const funFacts = [];
    funFacts.push({ icon: '📅', text: `Le jour le plus actif etait le <strong>${new Date(stats.mostActiveDay[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> avec <strong>${stats.mostActiveDay[1]} messages</strong> !` });
    if (stats.streak.max > 1) funFacts.push({ icon: '🔥', text: `Record de conversation : <strong>${stats.streak.max} jours consecutifs</strong> sans interruption !` });
    if (stats.longestMessage && stats.longestMessage.msgLen > 0) funFacts.push({ icon: '📝', text: `Le plus long message (<strong>${fmt(stats.longestMessage.msgLen)} caracteres</strong>) par <strong>${escapeHtml(stats.longestMessage.author)}</strong>` });
    if (stats.nightOwl) funFacts.push({ icon: '🦉', text: `Couche-tard : <strong>${escapeHtml(stats.nightOwl[0])}</strong> (${stats.nightOwl[1]} msgs entre 0h-5h)` });
    if (stats.earlyBird) funFacts.push({ icon: '🐦', text: `Leve-tot : <strong>${escapeHtml(stats.earlyBird[0])}</strong> (${stats.earlyBird[1]} msgs entre 5h-8h)` });
    if (stats.responseStats?.fastest) funFacts.push({ icon: '⚡', text: `Plus reactif : <strong>${escapeHtml(stats.responseStats.fastest[0])}</strong> (${fmtTime(stats.responseStats.fastest[1])})` });

    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Fun facts</span>
                <h2 class="slide-title">Le saviez-vous ?</h2>
                <div class="fun-facts">${funFacts.map(f => `<div class="fun-fact"><div class="fun-fact-icon">${f.icon}</div><div class="fun-fact-text">${f.text}</div></div>`).join('')}</div>
            </div>
        `,
    });

    // ===== Emojis per person =====
    if (stats.emojis.perPerson.length > 0) {
        const maxE = stats.emojis.perPerson[0][1] || 1;
        const rows = stats.emojis.perPerson.map(([name, count], i) => {
            const msgCount = stats.perPerson[name]?.count || 1;
            const ratio = (count / msgCount).toFixed(2);
            const w = ((count / maxE) * 100).toFixed(1);
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
            return `
                <div class="ranking-item">
                    <div class="ranking-pos ${posClass}">${i + 1}</div>
                    <div class="ranking-bar-wrapper">
                        <div class="ranking-bar-label"><span class="name">${escapeHtml(name)}</span><span class="value">${fmt(count)} (${ratio}/msg)</span></div>
                        <div class="ranking-bar"><div class="ranking-bar-fill" style="--bar-width: ${w}%; background: ${color};"></div></div>
                    </div>
                </div>`;
        }).join('');
        slides.push({
            gradient: g(),
            html: `
                <div class="slide-inner">
                    <span class="slide-tag">Emojis</span>
                    <h2 class="slide-title">Les fans d'emojis</h2>
                    <div class="ranking-list">${rows}</div>
                </div>
            `,
        });
    }

    // ===== Recap =====
    slides.push({
        gradient: 'slide-gradient-2',
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Recapitulatif</span>
                <h2 class="slide-title">Votre conversation en chiffres</h2>
                <div class="stat-grid">
                    <div class="stat-card"><div class="stat-value">${fmt(stats.totalMessages)}</div><div class="stat-label">messages</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.participants}</div><div class="stat-label">participants</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.totalDays}</div><div class="stat-label">jours</div></div>
                    <div class="stat-card"><div class="stat-value">${fmt(stats.emojis.total)}</div><div class="stat-label">emojis</div></div>
                    <div class="stat-card"><div class="stat-value">${fmt(stats.totalMedia)}</div><div class="stat-label">medias</div></div>
                    <div class="stat-card"><div class="stat-value">${stats.streak.max}j</div><div class="stat-label">meilleur streak</div></div>
                </div>
                <p class="slide-subtitle" style="margin-top:1.5rem;">
                    ${stats.ranking[0] ? `<strong>${escapeHtml(stats.ranking[0][0])}</strong> domine avec ${stats.ranking[0][1].percent}% des messages` : ''}
                </p>
                <button class="file-btn" onclick="location.reload()" style="margin-top:1rem;">Analyser une autre conversation</button>
            </div>
        `,
    });

    return slides;
}

function rankingBars(items, valueFn, labelFn, max) {
    return items.map(([name, data], i) => {
        const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
        const w = ((valueFn([name, data]) / max) * 100).toFixed(1);
        const color = CHART_COLORS[i % CHART_COLORS.length];
        return `
            <div class="ranking-item">
                <div class="ranking-pos ${posClass}">${i + 1}</div>
                <div class="ranking-bar-wrapper">
                    <div class="ranking-bar-label"><span class="name">${escapeHtml(name)}</span><span class="value">${labelFn([name, data])}</span></div>
                    <div class="ranking-bar"><div class="ranking-bar-fill" style="--bar-width: ${w}%; background: ${color};"></div></div>
                </div>
            </div>`;
    }).join('');
}

function heatmapSlide(stats, gradient) {
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

function hourlyWeekdaySlide(stats, gradient) {
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
