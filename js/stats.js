/**
 * Statistics computation from parsed WhatsApp messages
 */

const StatsEngine = {

    STOP_WORDS: new Set([
        'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'on',
        'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'en',
        'au', 'aux', 'ce', 'se', 'sa', 'son', 'ses', 'mon', 'ma', 'mes',
        'ton', 'ta', 'tes', 'que', 'qui', 'quoi', 'dont', 'ou', 'mais',
        'si', 'ne', 'pas', 'plus', 'par', 'pour', 'dans', 'sur', 'avec',
        'tout', 'tous', 'toute', 'toutes', 'bien', 'aussi', 'comme',
        'quand', 'alors', 'donc', 'car', 'encore', 'trop', 'fait',
        'avoir', 'etre', 'faire', 'dire', 'aller', 'voir', 'venir',
        'est', 'sont', 'suis', 'avons', 'avez', 'ont', 'ai', 'as',
        'era', 'ete', 'cette', 'ces', 'ici', 'moi', 'toi', 'lui',
        'elle', 'leur', 'leurs', 'notre', 'votre', 'meme', 'autre',
        'autres', 'peu', 'rien', 'tres', 'peut', 'faut', 'chez',
        'sans', 'sous', 'vers', 'apres', 'avant', 'entre', 'contre',
        'image', 'absente', 'gif', 'retire', 'sticker', 'omis',
        'message', 'modifie', 'nan', 'https', 'http', 'www',
        'oui', 'non', 'bon', 'bah', 'ben', 'ouais', 'haha',
        'the', 'and', 'for', 'that', 'this', 'with', 'you', 'was',
        'are', 'not', 'but', 'have', 'has', 'had', 'from', 'they',
        'medias',
    ]),

    DAYS_FR: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'],

    /**
     * Compute all statistics from messages
     */
    compute(messages) {
        const stats = {};

        // Basic info
        const dates = messages.map(m => m.datetime);
        stats.startDate = new Date(Math.min(...dates));
        stats.endDate = new Date(Math.max(...dates));
        stats.totalDays = Math.ceil((stats.endDate - stats.startDate) / (1000 * 60 * 60 * 24)) + 1;
        stats.totalMessages = messages.length;
        stats.avgPerDay = (stats.totalMessages / stats.totalDays).toFixed(1);
        stats.totalChars = messages.reduce((s, m) => s + m.msgLen, 0);
        stats.totalMedia = messages.filter(m => m.isMedia).length;
        stats.totalEdited = messages.filter(m => m.isEdited).length;
        stats.totalLinks = messages.filter(m => /https?:\/\//.test(m.message)).length;

        const textMessages = messages.filter(m => !m.isMedia);
        stats.avgMsgLen = textMessages.length > 0
            ? Math.round(textMessages.reduce((s, m) => s + m.msgLen, 0) / textMessages.length)
            : 0;

        // Participants
        const authors = [...new Set(messages.map(m => m.author))];
        stats.participants = authors.length;

        // Per person stats
        stats.perPerson = {};
        for (const author of authors) {
            const msgs = messages.filter(m => m.author === author);
            const texts = msgs.filter(m => !m.isMedia);
            stats.perPerson[author] = {
                count: msgs.length,
                percent: ((msgs.length / stats.totalMessages) * 100).toFixed(1),
                media: msgs.filter(m => m.isMedia).length,
                edited: msgs.filter(m => m.isEdited).length,
                avgLen: texts.length > 0 ? Math.round(texts.reduce((s, m) => s + m.msgLen, 0) / texts.length) : 0,
                totalChars: msgs.reduce((s, m) => s + m.msgLen, 0),
                links: msgs.filter(m => /https?:\/\//.test(m.message)).length,
            };
        }

        // Sort by message count
        stats.ranking = Object.entries(stats.perPerson)
            .sort((a, b) => b[1].count - a[1].count);

        // Hourly distribution
        stats.hourly = new Array(24).fill(0);
        for (const m of messages) {
            stats.hourly[m.datetime.getHours()]++;
        }
        stats.peakHour = stats.hourly.indexOf(Math.max(...stats.hourly));

        // Day of week distribution
        stats.weekday = new Array(7).fill(0);
        for (const m of messages) {
            // JS: 0=Sunday, we want 0=Monday
            const day = (m.datetime.getDay() + 6) % 7;
            stats.weekday[day]++;
        }
        stats.peakDay = this.DAYS_FR[stats.weekday.indexOf(Math.max(...stats.weekday))];

        // Heatmap: day x hour
        stats.heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0));
        for (const m of messages) {
            const day = (m.datetime.getDay() + 6) % 7;
            const hour = m.datetime.getHours();
            stats.heatmap[day][hour]++;
        }

        // Daily message counts
        stats.daily = {};
        for (const m of messages) {
            const key = m.datetime.toISOString().split('T')[0];
            stats.daily[key] = (stats.daily[key] || 0) + 1;
        }

        // Most active day
        const dailyEntries = Object.entries(stats.daily);
        dailyEntries.sort((a, b) => b[1] - a[1]);
        stats.mostActiveDay = dailyEntries[0] || ['N/A', 0];

        // Monthly counts
        stats.monthly = {};
        for (const m of messages) {
            const key = `${m.datetime.getFullYear()}-${String(m.datetime.getMonth() + 1).padStart(2, '0')}`;
            stats.monthly[key] = (stats.monthly[key] || 0) + 1;
        }

        // Monthly per person (for evolution chart)
        stats.monthlyPerPerson = {};
        for (const m of messages) {
            const key = `${m.datetime.getFullYear()}-${String(m.datetime.getMonth() + 1).padStart(2, '0')}`;
            if (!stats.monthlyPerPerson[m.author]) stats.monthlyPerPerson[m.author] = {};
            stats.monthlyPerPerson[m.author][key] = (stats.monthlyPerPerson[m.author][key] || 0) + 1;
        }

        // Top words
        stats.topWords = this.computeTopWords(textMessages.map(m => m.message));

        // Top words per person (top 5 authors)
        stats.topWordsPerPerson = {};
        const topAuthors = stats.ranking.slice(0, 5).map(r => r[0]);
        for (const author of topAuthors) {
            const msgs = textMessages.filter(m => m.author === author).map(m => m.message);
            stats.topWordsPerPerson[author] = this.computeTopWords(msgs, 10);
        }

        // Emojis
        stats.emojis = this.computeEmojis(messages);

        // Media types
        stats.mediaTypes = this.computeMediaTypes(messages);

        // Response times (for 1-on-1 or group)
        stats.responseStats = this.computeResponseTimes(messages);

        // Longest message
        const longestMsg = textMessages.reduce((max, m) => m.msgLen > max.msgLen ? m : max, textMessages[0] || { msgLen: 0 });
        stats.longestMessage = longestMsg;

        // Streaks
        stats.streak = this.computeStreak(stats.daily);

        // First message
        stats.firstMessage = messages[0];

        // Night owl & early bird
        const nightMessages = messages.filter(m => {
            const h = m.datetime.getHours();
            return h >= 0 && h < 5;
        });
        const nightOwlCounts = {};
        for (const m of nightMessages) {
            nightOwlCounts[m.author] = (nightOwlCounts[m.author] || 0) + 1;
        }
        const nightOwlEntries = Object.entries(nightOwlCounts).sort((a, b) => b[1] - a[1]);
        stats.nightOwl = nightOwlEntries[0] || null;

        const morningMessages = messages.filter(m => {
            const h = m.datetime.getHours();
            return h >= 5 && h < 8;
        });
        const earlyBirdCounts = {};
        for (const m of morningMessages) {
            earlyBirdCounts[m.author] = (earlyBirdCounts[m.author] || 0) + 1;
        }
        const earlyBirdEntries = Object.entries(earlyBirdCounts).sort((a, b) => b[1] - a[1]);
        stats.earlyBird = earlyBirdEntries[0] || null;

        return stats;
    },

    computeTopWords(textArray, limit = 30) {
        const allText = textArray.join(' ').toLowerCase();
        const cleaned = allText
            .replace(/https?:\/\/\S+/g, '')
            .replace(/<[^>]+>/g, '');
        const words = cleaned.match(/[a-zàâäéèêëïîôùûüÿçœæ]+/gi) || [];
        const freq = {};
        for (const word of words) {
            const w = word.toLowerCase();
            if (w.length > 2 && !this.STOP_WORDS.has(w)) {
                freq[w] = (freq[w] || 0) + 1;
            }
        }
        return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
    },

    computeEmojis(messages) {
        const emojiRegex = /\p{Extended_Pictographic}/gu;
        const freq = {};
        let total = 0;
        const perPerson = {};

        for (const m of messages) {
            const emojis = m.message.match(emojiRegex) || [];
            for (const e of emojis) {
                freq[e] = (freq[e] || 0) + 1;
                total++;
            }
            if (!perPerson[m.author]) perPerson[m.author] = 0;
            perPerson[m.author] += emojis.length;
        }

        const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15);
        const perPersonSorted = Object.entries(perPerson).sort((a, b) => b[1] - a[1]);

        return { total, unique: Object.keys(freq).length, top, perPerson: perPersonSorted };
    },

    computeMediaTypes(messages) {
        return {
            images: messages.filter(m => /image absente|image omitted/i.test(m.message)).length,
            gifs: messages.filter(m => /GIF retiré|GIF omitted/i.test(m.message)).length,
            stickers: messages.filter(m => /sticker omis|sticker omitted/i.test(m.message)).length,
            videos: messages.filter(m => /vidéo absente|video omitted/i.test(m.message)).length,
            audio: messages.filter(m => /audio omis|audio omitted/i.test(m.message)).length,
            documents: messages.filter(m => /document omis|document omitted/i.test(m.message)).length,
            links: messages.filter(m => /https?:\/\//.test(m.message)).length,
        };
    },

    computeResponseTimes(messages) {
        if (messages.length < 2) return null;

        const times = [];
        for (let i = 1; i < messages.length; i++) {
            if (messages[i].author !== messages[i - 1].author) {
                const diff = (messages[i].datetime - messages[i - 1].datetime) / 1000 / 60; // minutes
                if (diff > 0 && diff < 1440) { // max 24h
                    times.push({ author: messages[i].author, time: diff });
                }
            }
        }

        // Average response time per person
        const perPerson = {};
        for (const t of times) {
            if (!perPerson[t.author]) perPerson[t.author] = [];
            perPerson[t.author].push(t.time);
        }

        const avgPerPerson = {};
        for (const [author, timesArr] of Object.entries(perPerson)) {
            const avg = timesArr.reduce((s, t) => s + t, 0) / timesArr.length;
            avgPerPerson[author] = Math.round(avg);
        }

        const sorted = Object.entries(avgPerPerson).sort((a, b) => a[1] - b[1]);
        return { fastest: sorted[0] || null, slowest: sorted[sorted.length - 1] || null, all: sorted };
    },

    computeStreak(daily) {
        const dates = Object.keys(daily).sort();
        if (dates.length === 0) return { max: 0, current: 0 };

        let maxStreak = 1;
        let currentStreak = 1;

        for (let i = 1; i < dates.length; i++) {
            const prev = new Date(dates[i - 1]);
            const curr = new Date(dates[i]);
            const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                currentStreak++;
                maxStreak = Math.max(maxStreak, currentStreak);
            } else {
                currentStreak = 1;
            }
        }

        return { max: maxStreak };
    },

    /**
     * Format a number with locale separators
     */
    fmt(n) {
        return Number(n).toLocaleString('fr-FR');
    },

    /**
     * Format minutes into human-readable string
     */
    fmtTime(minutes) {
        if (minutes < 60) return `${Math.round(minutes)} min`;
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return m > 0 ? `${h}h ${m}min` : `${h}h`;
    },

    /**
     * Format date to FR locale string
     */
    fmtDate(date) {
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    },
};
