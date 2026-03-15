/**
 * Main app — Handles file upload, navigation, and slide rendering
 */

(function () {
    const $ = (sel) => document.querySelector(sel);
    const uploadScreen = $('#upload-screen');
    const loadingScreen = $('#loading-screen');
    const wrappedScreen = $('#wrapped-screen');
    const slidesContainer = $('#slides-container');
    const navDots = $('#nav-dots');
    const fileInput = $('#file-input');
    const dropZone = $('#drop-zone');
    const loadingStatus = $('#loading-status');

    let currentSlide = 0;
    let totalSlides = 0;
    let slideElements = [];
    let chartInitialized = {};

    // ========== Screen management ==========
    function showScreen(screen) {
        [uploadScreen, loadingScreen, wrappedScreen].forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    }

    // ========== File handling ==========
    fileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    async function handleFile(file) {
        showScreen(loadingScreen);

        try {
            let text;
            if (file.name.endsWith('.zip')) {
                loadingStatus.textContent = 'Decompression du fichier...';
                // Simple ZIP handling — look for .txt inside
                const JSZip = window.JSZip;
                if (!JSZip) {
                    throw new Error('Pour les fichiers ZIP, veuillez d\'abord extraire le fichier .txt');
                }
                const zip = await JSZip.loadAsync(file);
                const txtFile = Object.values(zip.files).find(f => f.name.endsWith('.txt'));
                if (!txtFile) throw new Error('Aucun fichier .txt trouvé dans le ZIP');
                text = await txtFile.async('string');
            } else {
                loadingStatus.textContent = 'Lecture du fichier...';
                text = await file.text();
            }

            loadingStatus.textContent = 'Analyse des messages...';
            await new Promise(r => setTimeout(r, 100)); // Let UI update

            // Parse all messages first to detect available years
            const allMessages = WhatsAppParser.parse(text);

            if (allMessages.length < 5) {
                throw new Error('Trop peu de messages trouves. Verifiez que le fichier est bien un export WhatsApp.');
            }

            // Detect available years
            const yearCounts = {};
            for (const m of allMessages) {
                const y = m.datetime.getFullYear();
                yearCounts[y] = (yearCounts[y] || 0) + 1;
            }
            const years = Object.keys(yearCounts).map(Number).sort((a, b) => b - a);

            // Let user pick a year if multiple exist
            let selectedYear = null;
            if (years.length > 1) {
                showScreen(uploadScreen);
                selectedYear = await pickYear(years, yearCounts);
                showScreen(loadingScreen);
            } else {
                selectedYear = years[0];
            }

            // Re-parse with year filter (null = all years)
            const messages = WhatsAppParser.parse(text, selectedYear ? { year: selectedYear } : {});

            const yearLabel = selectedYear ? `en ${selectedYear}` : 'au total';
            loadingStatus.textContent = `${messages.length} messages ${yearLabel} ! Calcul des stats...`;
            await new Promise(r => setTimeout(r, 200));

            const stats = StatsEngine.compute(messages);

            loadingStatus.textContent = 'Generation du Wrapped...';
            await new Promise(r => setTimeout(r, 200));

            const slides = generateSlides(stats);
            renderSlides(slides);
            buildSummary(stats);
            showScreen(wrappedScreen);

        } catch (err) {
            console.error(err);
            alert('Erreur : ' + err.message);
            showScreen(uploadScreen);
        }
    }

    // ========== Year picker ==========
    function pickYear(years, yearCounts) {
        return new Promise((resolve) => {
            // Create overlay
            const overlay = document.createElement('div');
            overlay.className = 'year-picker-overlay';
            overlay.innerHTML = `
                <div class="year-picker">
                    <h2>Quelle annee analyser ?</h2>
                    <p style="color:rgba(255,255,255,0.5);margin-bottom:1.5rem;font-size:0.9rem;">
                        Plusieurs annees detectees dans la conversation
                    </p>
                    <div class="year-options">
                        ${years.map(y => `
                            <button class="year-btn" data-year="${y}">
                                <span class="year-value">${y}</span>
                                <span class="year-count">${yearCounts[y].toLocaleString('fr-FR')} messages</span>
                            </button>
                        `).join('')}
                        <button class="year-btn year-btn-all" data-year="all">
                            <span class="year-value">Toutes les annees</span>
                            <span class="year-count">${Object.values(yearCounts).reduce((a, b) => a + b, 0).toLocaleString('fr-FR')} messages</span>
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            // Force reflow then add active class for animation
            requestAnimationFrame(() => overlay.classList.add('active'));

            overlay.querySelectorAll('.year-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const raw = btn.dataset.year;
                    overlay.remove();
                    resolve(raw === 'all' ? null : parseInt(raw));
                });
            });
        });
    }

    // ========== Slide rendering ==========
    function renderSlides(slides) {
        slidesContainer.innerHTML = '';
        navDots.innerHTML = '';
        slideElements = [];
        chartInitialized = {};
        totalSlides = slides.length;
        currentSlide = 0;

        slides.forEach((slide, i) => {
            const el = document.createElement('div');
            el.className = `slide ${slide.gradient} ${i === 0 ? 'active' : ''}`;
            el.innerHTML = slide.html;
            el.dataset.index = i;
            if (slide.chart) el._chartInit = slide.chart;
            slidesContainer.appendChild(el);
            slideElements.push(el);

            const dot = document.createElement('div');
            dot.className = `nav-dot ${i === 0 ? 'active' : ''}`;
            dot.addEventListener('click', () => goToSlide(i));
            navDots.appendChild(dot);
        });

        // Add reset button
        const resetBtn = document.createElement('button');
        resetBtn.className = 'reset-btn';
        resetBtn.textContent = 'Nouvelle analyse';
        resetBtn.addEventListener('click', () => location.reload());
        wrappedScreen.appendChild(resetBtn);

        // Initialize chart for first slide if any
        initChartForSlide(0);

        // Setup navigation
        setupNavigation();
    }

    function initChartForSlide(index) {
        if (chartInitialized[index]) return;
        const el = slideElements[index];
        if (!el || !el._chartInit) return;

        // Find canvas in the slide
        const canvas = el.querySelector('canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            el._chartInit(ctx, el);
            chartInitialized[index] = true;
        }
    }

    let isAnimating = false;

    function goToSlide(index) {
        if (index < 0 || index >= totalSlides || index === currentSlide || isAnimating) return;
        isAnimating = true;

        const goingForward = index > currentSlide;
        const oldSlide = slideElements[currentSlide];
        const newSlide = slideElements[index];

        // Disable transitions temporarily to position the new slide off-screen
        newSlide.style.transition = 'none';
        newSlide.style.transform = goingForward ? 'translateX(100%)' : 'translateX(-100%)';
        newSlide.style.opacity = '1';
        newSlide.classList.add('active');

        // Force reflow so the position takes effect before we animate
        newSlide.offsetHeight;

        // Re-enable transitions and animate both slides
        newSlide.style.transition = '';
        newSlide.style.transform = 'translateX(0)';

        oldSlide.style.transform = goingForward ? 'translateX(-100%)' : 'translateX(100%)';
        oldSlide.style.opacity = '0';

        // After animation completes, clean up
        setTimeout(() => {
            oldSlide.classList.remove('active');
            oldSlide.style.transform = '';
            oldSlide.style.opacity = '';
            oldSlide.style.transition = '';
            currentSlide = index;
            isAnimating = false;
        }, 500);

        // Update dots
        navDots.querySelectorAll('.nav-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });

        // Initialize chart
        initChartForSlide(index);

        // Hide swipe hint after first navigation
        const hint = $('#swipe-hint');
        if (hint) hint.style.display = 'none';
    }

    // ========== Navigation ==========
    function setupNavigation() {
        // Arrow buttons
        $('#nav-prev').addEventListener('click', () => goToSlide(currentSlide - 1));
        $('#nav-next').addEventListener('click', () => goToSlide(currentSlide + 1));

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!wrappedScreen.classList.contains('active')) return;
            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                goToSlide(currentSlide + 1);
            }
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goToSlide(currentSlide - 1);
            }
        });

        // Touch/swipe navigation
        let touchStartX = 0;
        let touchStartY = 0;

        slidesContainer.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        slidesContainer.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            const dy = e.changedTouches[0].clientY - touchStartY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                if (dx < 0) goToSlide(currentSlide + 1);
                else goToSlide(currentSlide - 1);
            }
        }, { passive: true });

        // Mouse wheel
        let wheelTimeout;
        slidesContainer.addEventListener('wheel', (e) => {
            if (wheelTimeout) return;
            wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 800);
            if (e.deltaY > 30) goToSlide(currentSlide + 1);
            else if (e.deltaY < -30) goToSlide(currentSlide - 1);
        }, { passive: true });
    }

    // ========== Summary ==========
    const summaryOverlay = $('#summary-overlay');
    const summaryContent = $('#summary-content');
    const summaryBtn = $('#summary-btn');
    const summaryClose = $('#summary-close');

    summaryBtn.addEventListener('click', () => {
        summaryOverlay.classList.add('active');
    });

    summaryClose.addEventListener('click', () => {
        summaryOverlay.classList.remove('active');
    });

    summaryOverlay.addEventListener('click', (e) => {
        if (e.target === summaryOverlay) summaryOverlay.classList.remove('active');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') summaryOverlay.classList.remove('active');
    });

    function buildSummary(stats) {
        const fmt = StatsEngine.fmt;
        const fmtDate = StatsEngine.fmtDate;
        const fmtTime = StatsEngine.fmtTime;

        // --- Section: Vue d'ensemble ---
        let html = `
            <section class="summary-section">
                <h3>Vue d'ensemble</h3>
                <table class="summary-table">
                    <tr><td>Periode</td><td>${fmtDate(stats.startDate)} — ${fmtDate(stats.endDate)}</td></tr>
                    <tr><td>Duree</td><td>${stats.totalDays} jours</td></tr>
                    <tr><td>Participants</td><td>${stats.participants}</td></tr>
                    <tr><td>Total messages</td><td>${fmt(stats.totalMessages)}</td></tr>
                    <tr><td>Moyenne / jour</td><td>${stats.avgPerDay}</td></tr>
                    <tr><td>Total caracteres</td><td>${fmt(stats.totalChars)}</td></tr>
                    <tr><td>Longueur moy. message</td><td>${stats.avgMsgLen} car.</td></tr>
                    <tr><td>Medias partages</td><td>${fmt(stats.totalMedia)}</td></tr>
                    <tr><td>Liens partages</td><td>${fmt(stats.totalLinks)}</td></tr>
                    <tr><td>Messages modifies</td><td>${fmt(stats.totalEdited)}</td></tr>
                    <tr><td>Emojis envoyes</td><td>${fmt(stats.emojis.total)} (${stats.emojis.unique} differents)</td></tr>
                    <tr><td>Meilleur streak</td><td>${stats.streak.max} jours consecutifs</td></tr>
                </table>
            </section>
        `;

        // --- Section: Classement ---
        html += `
            <section class="summary-section">
                <h3>Classement des participants</h3>
                <table class="summary-table summary-table-full">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Nom</th>
                            <th>Messages</th>
                            <th>%</th>
                            <th>Moy. car.</th>
                            <th>Medias</th>
                            <th>Emojis</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.ranking.map(([name, data], i) => {
                            const emojiCount = stats.emojis.perPerson.find(e => e[0] === name)?.[1] || 0;
                            return `<tr>
                                <td>${i + 1}</td>
                                <td>${name}</td>
                                <td>${fmt(data.count)}</td>
                                <td>${data.percent}%</td>
                                <td>${data.avgLen}</td>
                                <td>${data.media}</td>
                                <td>${fmt(emojiCount)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </section>
        `;

        // --- Section: Activite ---
        html += `
            <section class="summary-section">
                <h3>Activite</h3>
                <table class="summary-table">
                    <tr><td>Heure de pointe</td><td>${stats.peakHour}h</td></tr>
                    <tr><td>Jour prefere</td><td>${stats.peakDay}</td></tr>
                    <tr><td>Jour le plus actif</td><td>${new Date(stats.mostActiveDay[0]).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} (${stats.mostActiveDay[1]} msgs)</td></tr>
                </table>
            </section>
        `;

        // --- Section: Top emojis ---
        if (stats.emojis.top.length > 0) {
            html += `
                <section class="summary-section">
                    <h3>Top emojis</h3>
                    <div class="summary-emoji-list">
                        ${stats.emojis.top.slice(0, 15).map(([emoji, count]) =>
                            `<span class="summary-emoji">${emoji} <small>${fmt(count)}</small></span>`
                        ).join('')}
                    </div>
                </section>
            `;
        }

        // --- Section: Top mots ---
        if (stats.topWords.length > 0) {
            html += `
                <section class="summary-section">
                    <h3>Top 20 mots</h3>
                    <table class="summary-table summary-table-compact">
                        ${stats.topWords.slice(0, 20).map(([word, count], i) =>
                            `<tr><td>${i + 1}.</td><td>${word}</td><td>${fmt(count)}</td></tr>`
                        ).join('')}
                    </table>
                </section>
            `;
        }

        // --- Section: Medias ---
        const mediaLabels = { images: 'Images', gifs: 'GIFs', stickers: 'Stickers', videos: 'Videos', audio: 'Audios', documents: 'Documents', links: 'Liens' };
        const mediaEntries = Object.entries(stats.mediaTypes).filter(([, v]) => v > 0);
        if (mediaEntries.length > 0) {
            html += `
                <section class="summary-section">
                    <h3>Medias</h3>
                    <table class="summary-table">
                        ${mediaEntries.sort((a, b) => b[1] - a[1]).map(([key, val]) =>
                            `<tr><td>${mediaLabels[key] || key}</td><td>${fmt(val)}</td></tr>`
                        ).join('')}
                    </table>
                </section>
            `;
        }

        // --- Section: Fun facts ---
        const facts = [];
        if (stats.longestMessage?.msgLen > 0) {
            facts.push(`Le plus long message : ${fmt(stats.longestMessage.msgLen)} caracteres par ${stats.longestMessage.author}`);
        }
        if (stats.nightOwl) facts.push(`Couche-tard : ${stats.nightOwl[0]} (${stats.nightOwl[1]} msgs entre 0h-5h)`);
        if (stats.earlyBird) facts.push(`Leve-tot : ${stats.earlyBird[0]} (${stats.earlyBird[1]} msgs entre 5h-8h)`);
        if (stats.responseStats?.fastest) {
            facts.push(`Plus reactif : ${stats.responseStats.fastest[0]} (${fmtTime(stats.responseStats.fastest[1])} en moyenne)`);
        }
        if (stats.responseStats?.slowest) {
            facts.push(`Plus lent a repondre : ${stats.responseStats.slowest[0]} (${fmtTime(stats.responseStats.slowest[1])} en moyenne)`);
        }

        if (facts.length > 0) {
            html += `
                <section class="summary-section">
                    <h3>Fun facts</h3>
                    <ul class="summary-facts">
                        ${facts.map(f => `<li>${f}</li>`).join('')}
                    </ul>
                </section>
            `;
        }

        summaryContent.innerHTML = html;
    }
})();
