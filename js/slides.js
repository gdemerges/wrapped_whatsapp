/**
 * Slide generator — Creates the Wrapped slides from stats
 */

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

const BAR_COLORS_GRADIENT = [
    '#8B5CF6', '#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95',
    '#EC4899', '#DB2777', '#BE185D', '#9D174D', '#831843',
];

function generateSlides(stats) {
    const slides = [];
    let gi = 0;
    const g = () => GRADIENTS[gi++ % GRADIENTS.length];

    // ===== SLIDE 1: Overview =====
    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Ta conversation</span>
                <div class="big-number">${StatsEngine.fmt(stats.totalMessages)}</div>
                <div class="big-label">messages echanges</div>
                <p class="slide-subtitle">
                    Du ${StatsEngine.fmtDate(stats.startDate)} au ${StatsEngine.fmtDate(stats.endDate)}
                </p>
                <div class="stat-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.participants}</div>
                        <div class="stat-label">participants</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.totalDays}</div>
                        <div class="stat-label">jours</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.avgPerDay}</div>
                        <div class="stat-label">messages / jour</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${StatsEngine.fmt(stats.totalChars)}</div>
                        <div class="stat-label">caracteres</div>
                    </div>
                </div>
            </div>
        `,
    });

    // ===== SLIDE 2: Top Messagers =====
    const top10 = stats.ranking.slice(0, 10);
    const maxCount = top10[0]?.[1].count || 1;
    const rankingHTML = top10.map(([name, data], i) => {
        const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
        const barWidth = ((data.count / maxCount) * 100).toFixed(1);
        const color = CHART_COLORS[i % CHART_COLORS.length];
        return `
            <div class="ranking-item">
                <div class="ranking-pos ${posClass}">${i + 1}</div>
                <div class="ranking-bar-wrapper">
                    <div class="ranking-bar-label">
                        <span class="name">${name}</span>
                        <span class="value">${StatsEngine.fmt(data.count)} (${data.percent}%)</span>
                    </div>
                    <div class="ranking-bar">
                        <div class="ranking-bar-fill" style="--bar-width: ${barWidth}%; background: ${color};"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Classement</span>
                <h2 class="slide-title">Les plus bavard·e·s</h2>
                <div class="ranking-list">${rankingHTML}</div>
            </div>
        `,
    });

    // ===== SLIDE 3: Message Distribution Pie =====
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
            if (othersCount > 0) {
                labels.push('Autres');
                data.push(othersCount);
            }
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data,
                        backgroundColor: CHART_COLORS.slice(0, labels.length),
                        borderWidth: 2,
                        borderColor: 'rgba(0,0,0,0.3)',
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: '#fff', padding: 12, font: { size: 11 } },
                        },
                    },
                    cutout: '55%',
                },
            });
        },
    });

    // ===== SLIDE 4: Activity Timeline =====
    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Activite</span>
                <h2 class="slide-title">Messages par mois</h2>
                <div class="chart-wrapper">
                    <canvas id="chart-monthly" height="250"></canvas>
                </div>
            </div>
        `,
        chart: (ctx) => {
            const months = Object.keys(stats.monthly).sort();
            const values = months.map(k => stats.monthly[k]);
            const monthLabels = months.map(m => {
                const [y, mo] = m.split('-');
                const d = new Date(y, parseInt(mo) - 1);
                return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
            });
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: monthLabels,
                    datasets: [{
                        data: values,
                        backgroundColor: values.map((_, i) => {
                            const ratio = i / Math.max(values.length - 1, 1);
                            return `hsl(${260 + ratio * 100}, 70%, 60%)`;
                        }),
                        borderRadius: 4,
                    }],
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: {
                            ticks: { color: 'rgba(255,255,255,0.6)', maxRotation: 45, font: { size: 10 } },
                            grid: { display: false },
                        },
                        y: {
                            ticks: { color: 'rgba(255,255,255,0.6)' },
                            grid: { color: 'rgba(255,255,255,0.06)' },
                        },
                    },
                },
            });
        },
    });

    // ===== SLIDE 5: Heatmap =====
    const maxHeat = Math.max(...stats.heatmap.flat());
    const heatCells = [];
    // Header row with hour labels
    heatCells.push('<div class="heatmap-label"></div>');
    for (let h = 0; h < 24; h++) {
        heatCells.push(`<div class="heatmap-label hour-label">${h}h</div>`);
    }
    for (let d = 0; d < 7; d++) {
        heatCells.push(`<div class="heatmap-label">${StatsEngine.DAYS_FR[d]}</div>`);
        for (let h = 0; h < 24; h++) {
            const val = stats.heatmap[d][h];
            const intensity = maxHeat > 0 ? val / maxHeat : 0;
            const alpha = 0.1 + intensity * 0.9;
            const hue = 280 - intensity * 100; // purple to green
            const color = val === 0
                ? 'rgba(255,255,255,0.03)'
                : `hsla(${hue}, 70%, 55%, ${alpha})`;
            heatCells.push(`<div class="heatmap-cell" style="background:${color}" data-tooltip="${StatsEngine.DAYS_FR[d]} ${h}h: ${val} msgs"></div>`);
        }
    }

    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Patterns</span>
                <h2 class="slide-title">Quand discutez-vous ?</h2>
                <p class="slide-subtitle">Heure de pointe : <strong>${stats.peakHour}h</strong> | Jour prefere : <strong>${stats.peakDay}</strong></p>
                <div class="heatmap-container">
                    <div class="heatmap-grid">${heatCells.join('')}</div>
                </div>
            </div>
        `,
    });

    // ===== SLIDE 6: Hourly + Weekly patterns =====
    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Rythme</span>
                <h2 class="slide-title">L'horloge du groupe</h2>
                <div class="chart-wrapper">
                    <canvas id="chart-hourly" height="200"></canvas>
                </div>
                <div class="chart-wrapper" style="margin-top:1rem;">
                    <canvas id="chart-weekday" height="160"></canvas>
                </div>
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
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 9 } }, grid: { display: false } },
                        y: { ticks: { color: 'rgba(255,255,255,0.5)' }, grid: { color: 'rgba(255,255,255,0.06)' } },
                    },
                },
            });

            const weekdayCtx = slide.querySelector('#chart-weekday');
            new Chart(weekdayCtx, {
                type: 'bar',
                data: {
                    labels: StatsEngine.DAYS_FR,
                    datasets: [{
                        data: stats.weekday,
                        backgroundColor: CHART_COLORS.slice(0, 7),
                        borderRadius: 4,
                    }],
                },
                options: {
                    responsive: true,
                    indexAxis: 'y',
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: 'rgba(255,255,255,0.5)' }, grid: { color: 'rgba(255,255,255,0.06)' } },
                        y: { ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } }, grid: { display: false } },
                    },
                },
            });
        },
    });

    // ===== SLIDE 7: Top Words =====
    const wordTags = stats.topWords.slice(0, 25).map(([word, count], i) => {
        const size = 0.75 + (1 - i / 25) * 0.8;
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const opacity = 0.15 + (1 - i / 25) * 0.2;
        return `<span class="word-tag" style="font-size:${size}rem;background:${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')};color:${color};">${word} <small style="opacity:0.6;">${count}</small></span>`;
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

    // ===== SLIDE 8: Emojis =====
    const emojiItems = stats.emojis.top.slice(0, 12).map(([emoji, count]) =>
        `<div class="emoji-item"><span class="emoji">${emoji}</span><span class="emoji-count">${StatsEngine.fmt(count)}</span></div>`
    ).join('');

    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Emojis</span>
                <div class="big-number">${StatsEngine.fmt(stats.emojis.total)}</div>
                <div class="big-label">emojis envoyes</div>
                <p class="slide-subtitle">${stats.emojis.unique} emojis differents utilises</p>
                <div class="emoji-grid">${emojiItems}</div>
            </div>
        `,
    });

    // ===== SLIDE 9: Media =====
    const mediaEntries = Object.entries(stats.mediaTypes).filter(([, v]) => v > 0);
    const mediaLabels = {
        images: 'Images', gifs: 'GIFs', stickers: 'Stickers',
        videos: 'Videos', audio: 'Audios', documents: 'Documents', links: 'Liens',
    };
    const mediaIcons = {
        images: '📸', gifs: '🎞️', stickers: '🏷️',
        videos: '🎬', audio: '🎵', documents: '📄', links: '🔗',
    };

    if (mediaEntries.length > 0) {
        const totalMedia = mediaEntries.reduce((s, [, v]) => s + v, 0);
        const mediaCards = mediaEntries
            .sort((a, b) => b[1] - a[1])
            .map(([key, val]) => `
                <div class="stat-card">
                    <div class="stat-value">${mediaIcons[key] || ''} ${StatsEngine.fmt(val)}</div>
                    <div class="stat-label">${mediaLabels[key] || key}</div>
                </div>
            `).join('');

        slides.push({
            gradient: g(),
            html: `
                <div class="slide-inner">
                    <span class="slide-tag">Medias</span>
                    <div class="big-number">${StatsEngine.fmt(totalMedia)}</div>
                    <div class="big-label">medias et liens partages</div>
                    <div class="stat-grid">${mediaCards}</div>
                </div>
            `,
        });
    }

    // ===== SLIDE 10: Message Length Ranking =====
    const avgLenRanking = [...stats.ranking]
        .sort((a, b) => b[1].avgLen - a[1].avgLen)
        .slice(0, 8);
    const maxAvgLen = avgLenRanking[0]?.[1].avgLen || 1;
    const lenRankHTML = avgLenRanking.map(([name, data], i) => {
        const barWidth = ((data.avgLen / maxAvgLen) * 100).toFixed(1);
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
        return `
            <div class="ranking-item">
                <div class="ranking-pos ${posClass}">${i + 1}</div>
                <div class="ranking-bar-wrapper">
                    <div class="ranking-bar-label">
                        <span class="name">${name}</span>
                        <span class="value">${data.avgLen} car.</span>
                    </div>
                    <div class="ranking-bar">
                        <div class="ranking-bar-fill" style="--bar-width: ${barWidth}%; background: ${color};"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Longueur</span>
                <h2 class="slide-title">Qui ecrit les plus longs messages ?</h2>
                <p class="slide-subtitle">Longueur moyenne par message (en caracteres)</p>
                <div class="ranking-list">${lenRankHTML}</div>
            </div>
        `,
    });

    // ===== SLIDE 11: Fun Facts =====
    const funFacts = [];

    funFacts.push({
        icon: '📅',
        text: `Le jour le plus actif etait le <strong>${new Date(stats.mostActiveDay[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> avec <strong>${stats.mostActiveDay[1]} messages</strong> !`,
    });

    if (stats.streak.max > 1) {
        funFacts.push({
            icon: '🔥',
            text: `Record de conversation : <strong>${stats.streak.max} jours consecutifs</strong> de messages sans interruption !`,
        });
    }

    if (stats.longestMessage && stats.longestMessage.msgLen > 0) {
        funFacts.push({
            icon: '📝',
            text: `Le plus long message (<strong>${StatsEngine.fmt(stats.longestMessage.msgLen)} caracteres</strong>) a ete envoye par <strong>${stats.longestMessage.author}</strong>`,
        });
    }

    if (stats.nightOwl) {
        funFacts.push({
            icon: '🦉',
            text: `Le couche-tard du groupe : <strong>${stats.nightOwl[0]}</strong> avec ${stats.nightOwl[1]} messages envoyes entre 0h et 5h`,
        });
    }

    if (stats.earlyBird) {
        funFacts.push({
            icon: '🐦',
            text: `Le leve-tot du groupe : <strong>${stats.earlyBird[0]}</strong> avec ${stats.earlyBird[1]} messages envoyes entre 5h et 8h`,
        });
    }

    if (stats.responseStats && stats.responseStats.fastest) {
        funFacts.push({
            icon: '⚡',
            text: `Le plus reactif : <strong>${stats.responseStats.fastest[0]}</strong> avec un temps de reponse moyen de <strong>${StatsEngine.fmtTime(stats.responseStats.fastest[1])}</strong>`,
        });
    }

    const funFactsHTML = funFacts.map(f =>
        `<div class="fun-fact"><div class="fun-fact-icon">${f.icon}</div><div class="fun-fact-text">${f.text}</div></div>`
    ).join('');

    slides.push({
        gradient: g(),
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Fun facts</span>
                <h2 class="slide-title">Le saviez-vous ?</h2>
                <div class="fun-facts">${funFactsHTML}</div>
            </div>
        `,
    });

    // ===== SLIDE 12: Emoji per person =====
    if (stats.emojis.perPerson.length > 0) {
        const maxEmojiCount = stats.emojis.perPerson[0][1] || 1;
        const emojiRankHTML = stats.emojis.perPerson.slice(0, 8).map(([name, count], i) => {
            const msgCount = stats.perPerson[name]?.count || 1;
            const ratio = (count / msgCount).toFixed(2);
            const barWidth = ((count / maxEmojiCount) * 100).toFixed(1);
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
            return `
                <div class="ranking-item">
                    <div class="ranking-pos ${posClass}">${i + 1}</div>
                    <div class="ranking-bar-wrapper">
                        <div class="ranking-bar-label">
                            <span class="name">${name}</span>
                            <span class="value">${StatsEngine.fmt(count)} (${ratio}/msg)</span>
                        </div>
                        <div class="ranking-bar">
                            <div class="ranking-bar-fill" style="--bar-width: ${barWidth}%; background: ${color};"></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        slides.push({
            gradient: g(),
            html: `
                <div class="slide-inner">
                    <span class="slide-tag">Emojis</span>
                    <h2 class="slide-title">Les fans d'emojis</h2>
                    <p class="slide-subtitle">Nombre total d'emojis envoyes par personne</p>
                    <div class="ranking-list">${emojiRankHTML}</div>
                </div>
            `,
        });
    }

    // ===== SLIDE 13: Final recap =====
    slides.push({
        gradient: 'slide-gradient-2',
        html: `
            <div class="slide-inner">
                <span class="slide-tag">Recapitulatif</span>
                <h2 class="slide-title">Votre conversation en chiffres</h2>
                <div class="stat-grid">
                    <div class="stat-card">
                        <div class="stat-value">${StatsEngine.fmt(stats.totalMessages)}</div>
                        <div class="stat-label">messages</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.participants}</div>
                        <div class="stat-label">participants</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.totalDays}</div>
                        <div class="stat-label">jours</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${StatsEngine.fmt(stats.emojis.total)}</div>
                        <div class="stat-label">emojis</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${StatsEngine.fmt(stats.totalMedia)}</div>
                        <div class="stat-label">medias</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.streak.max}j</div>
                        <div class="stat-label">meilleur streak</div>
                    </div>
                </div>
                <p class="slide-subtitle" style="margin-top:1.5rem;">
                    ${stats.ranking[0] ? `<strong>${stats.ranking[0][0]}</strong> domine avec ${stats.ranking[0][1].percent}% des messages` : ''}
                </p>
                <button class="file-btn" onclick="location.reload()" style="margin-top:1rem;">Analyser une autre conversation</button>
            </div>
        `,
    });

    return slides;
}
