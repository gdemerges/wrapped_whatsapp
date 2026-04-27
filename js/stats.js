/**
 * Statistics computation from parsed WhatsApp messages.
 * Single-pass where possible.
 */

import { DAYS_FR, localDayKey, localMonthKey } from './utils.js';
import { stopwordsFor, detectLanguage } from './lang/stopwords.js';

const EMOJI_RE = /\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;
const WORD_RE = /[a-zàâäéèêëïîôùûüÿçœæ']+/gi;
const URL_RE = /https?:\/\/\S+/g;
const URL_TEST_RE = /https?:\/\/\S+/;
const HTML_STRIP_RE = /<[^>]+>/g;
const GHOST_THRESHOLD_MIN = 60 * 24; // 24h = ghosted

export function compute(messages) {
    if (!messages || messages.length === 0) {
        throw new Error('Aucun message à analyser');
    }

    // Ensure chronological order
    messages = [...messages].sort((a, b) => a.datetime - b.datetime);

    const stats = initAccumulators();

    // Language detection on a sample before the loop
    const sample = messages.slice(0, 500).map(m => m.message).join(' ');
    stats.lang = detectLanguage(sample);
    const stopwords = stopwordsFor(stats.lang);

    let prev = null;
    let prevDayKey = null;
    let longestMsg = null;

    for (const m of messages) {
        const author = m.author;
        const person = stats.perPerson[author] ||= newPerson();

        // --- Counts & lengths ---
        stats.totalMessages++;
        stats.totalChars += m.msgLen;
        person.count++;
        person.totalChars += m.msgLen;

        if (m.isMedia) {
            stats.totalMedia++;
            person.media++;
            bucketMediaType(stats.mediaTypes, m.message);
        } else {
            stats.textCount++;
            stats.textChars += m.msgLen;
            person.textCount++;
            person.textChars += m.msgLen;

            if (!longestMsg || m.msgLen > longestMsg.msgLen) longestMsg = m;

            // Word counts
            const cleaned = m.message.toLowerCase().replace(URL_RE, '').replace(HTML_STRIP_RE, '');
            const words = cleaned.match(WORD_RE) || [];
            for (const w of words) {
                if (w.length <= 2 || stopwords.has(w)) continue;
                stats.wordFreq[w] = (stats.wordFreq[w] || 0) + 1;
                const entry = stats.wordAuthors[w];
                if (!entry) {
                    stats.wordAuthors[w] = { authors: new Set([author]), count: 1 };
                } else {
                    entry.authors.add(author);
                    entry.count++;
                }
                (person.wordFreq[w] ||= 0);
                person.wordFreq[w]++;
            }
        }

        if (m.isEdited) { stats.totalEdited++; person.edited++; }

        if (URL_TEST_RE.test(m.message)) { stats.totalLinks++; person.links++; }

        // --- Reactions ---
        if (m.isReaction) {
            stats.reactions.total++;
            stats.reactions.perAuthor[author] = (stats.reactions.perAuthor[author] || 0) + 1;
            const e = m.reactionEmoji;
            if (e) stats.reactions.perEmoji[e] = (stats.reactions.perEmoji[e] || 0) + 1;
        }

        // --- Emojis ---
        const emojis = m.message.match(EMOJI_RE) || [];
        for (const e of emojis) {
            stats.emojiFreq[e] = (stats.emojiFreq[e] || 0) + 1;
            stats.totalEmojis++;
            person.emojis++;
        }

        // --- Time buckets ---
        const dt = m.datetime;
        const hour = dt.getHours();
        const day = (dt.getDay() + 6) % 7; // 0=Monday
        stats.hourly[hour]++;
        stats.weekday[day]++;
        stats.heatmap[day][hour]++;

        if (hour < 5) person.nightMsgs++;
        else if (hour < 8) person.morningMsgs++;

        const dayKey = localDayKey(dt);
        stats.daily[dayKey] = (stats.daily[dayKey] || 0) + 1;
        const monthKey = localMonthKey(dt);
        stats.monthly[monthKey] = (stats.monthly[monthKey] || 0) + 1;
        stats.monthlyPerPerson[author] ||= {};
        stats.monthlyPerPerson[author][monthKey] = (stats.monthlyPerPerson[author][monthKey] || 0) + 1;

        // --- Initiator of the day ---
        if (dayKey !== prevDayKey) {
            stats.initiator[author] = (stats.initiator[author] || 0) + 1;
            prevDayKey = dayKey;
        }

        // --- Response time & ghosting ---
        if (prev) {
            const diffMin = (dt - prev.datetime) / 60000;
            if (prev.author !== author && diffMin > 0) {
                if (diffMin < 1440) {
                    person.responseTimes.push(diffMin);
                }
                // Ghost breaker: ≥24h silence then different person speaks
                if (diffMin >= GHOST_THRESHOLD_MIN) {
                    stats.ghosts.push({
                        silenced: prev.author,
                        revived: author,
                        minutes: diffMin,
                        when: dt,
                    });
                }
            }
        }
        prev = m;

        if (!stats.firstMessage) stats.firstMessage = m;
    }

    stats.longestMessage = longestMsg
        ? { author: longestMsg.author, datetime: longestMsg.datetime, msgLen: longestMsg.msgLen }
        : { author: '', datetime: null, msgLen: 0 };
    if (stats.firstMessage) {
        stats.firstMessage = {
            author: stats.firstMessage.author,
            datetime: stats.firstMessage.datetime,
        };
    }

    return finalize(stats, messages);
}

function initAccumulators() {
    return {
        totalMessages: 0,
        totalChars: 0,
        textCount: 0,
        textChars: 0,
        totalMedia: 0,
        totalEdited: 0,
        totalLinks: 0,
        totalEmojis: 0,
        perPerson: {},
        mediaTypes: { images: 0, gifs: 0, stickers: 0, videos: 0, audio: 0, documents: 0, links: 0 },
        hourly: new Array(24).fill(0),
        weekday: new Array(7).fill(0),
        heatmap: Array.from({ length: 7 }, () => new Array(24).fill(0)),
        daily: {},
        monthly: {},
        monthlyPerPerson: {},
        emojiFreq: {},
        wordFreq: {},
        wordAuthors: {}, // word → {authors: Set, count}
        reactions: { total: 0, perAuthor: {}, perEmoji: {} },
        ghosts: [],
        initiator: {},
        firstMessage: null,
    };
}

function newPerson() {
    return {
        count: 0,
        textCount: 0,
        totalChars: 0,
        textChars: 0,
        media: 0,
        edited: 0,
        links: 0,
        emojis: 0,
        nightMsgs: 0,
        morningMsgs: 0,
        responseTimes: [],
        wordFreq: {},
    };
}

function bucketMediaType(mediaTypes, msg) {
    if (/image absente|image omitted/i.test(msg)) mediaTypes.images++;
    else if (/GIF retiré|GIF omitted/i.test(msg)) mediaTypes.gifs++;
    else if (/sticker omis|sticker omitted/i.test(msg)) mediaTypes.stickers++;
    else if (/vidéo absente|video omitted/i.test(msg)) mediaTypes.videos++;
    else if (/audio omis|audio omitted/i.test(msg)) mediaTypes.audio++;
    else if (/document omis|document omitted/i.test(msg)) mediaTypes.documents++;
}

function finalize(acc, messages) {
    // messages are sorted chronologically in compute()
    const startDate = new Date(messages[0].datetime);
    const endDate = new Date(messages[messages.length - 1].datetime);
    const totalDays = Math.ceil((endDate - startDate) / 86400000) + 1;

    // Per-person derived metrics
    const perPerson = {};
    for (const [author, p] of Object.entries(acc.perPerson)) {
        perPerson[author] = {
            count: p.count,
            percent: ((p.count / acc.totalMessages) * 100).toFixed(1),
            media: p.media,
            edited: p.edited,
            emojis: p.emojis,
            links: p.links,
            totalChars: p.totalChars,
            avgLen: p.textCount > 0 ? Math.round(p.textChars / p.textCount) : 0,
            nightMsgs: p.nightMsgs,
            morningMsgs: p.morningMsgs,
            avgResponseMin: p.responseTimes.length
                ? Math.round(p.responseTimes.reduce((s, t) => s + t, 0) / p.responseTimes.length)
                : null,
            _wordFreq: p.wordFreq, // kept internally, stripped before share
        };
    }

    const ranking = Object.entries(perPerson).sort((a, b) => b[1].count - a[1].count);

    // Media totals
    acc.mediaTypes.links = acc.totalLinks;

    // Top words (global)
    const topWords = Object.entries(acc.wordFreq)
        .sort((a, b) => b[1] - a[1]).slice(0, 30);

    // Top words per top-5 person
    const topWordsPerPerson = {};
    for (const [author] of ranking.slice(0, 5)) {
        const pf = perPerson[author]?._wordFreq || {};
        topWordsPerPerson[author] = Object.entries(pf).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }

    // Unique vocabulary per person (signature lexicale)
    const uniqueWordsPerPerson = {};
    for (const [word, { authors, count }] of Object.entries(acc.wordAuthors)) {
        if (count < 3) continue; // noise floor
        if (authors.size !== 1) continue;
        const owner = [...authors][0];
        (uniqueWordsPerPerson[owner] ||= []).push([word, count]);
    }
    for (const author of Object.keys(uniqueWordsPerPerson)) {
        uniqueWordsPerPerson[author].sort((a, b) => b[1] - a[1]);
        uniqueWordsPerPerson[author] = uniqueWordsPerPerson[author].slice(0, 15);
    }

    // Emojis
    const emojiEntries = Object.entries(acc.emojiFreq).sort((a, b) => b[1] - a[1]);
    const emojisPerPerson = Object.entries(perPerson)
        .map(([name, p]) => [name, p.emojis])
        .sort((a, b) => b[1] - a[1]);

    // Response stats
    const responseEntries = Object.entries(perPerson)
        .filter(([, p]) => p.avgResponseMin != null)
        .map(([name, p]) => [name, p.avgResponseMin])
        .sort((a, b) => a[1] - b[1]);

    const responseStats = responseEntries.length
        ? {
            fastest: responseEntries[0],
            slowest: responseEntries[responseEntries.length - 1],
            all: responseEntries,
        }
        : null;

    // Most active day
    const dailyEntries = Object.entries(acc.daily).sort((a, b) => b[1] - a[1]);
    const mostActiveDay = dailyEntries[0] || ['N/A', 0];

    // Peak hour/day
    const peakHour = acc.hourly.indexOf(Math.max(...acc.hourly));
    const peakDay = DAYS_FR[acc.weekday.indexOf(Math.max(...acc.weekday))];

    // Night owl / early bird
    const nightOwlE = Object.entries(perPerson).map(([n, p]) => [n, p.nightMsgs])
        .filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);
    const earlyBirdE = Object.entries(perPerson).map(([n, p]) => [n, p.morningMsgs])
        .filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]);

    // Streak
    const streak = computeStreak(acc.daily);

    // Initiator ranking
    const initiatorRanking = Object.entries(acc.initiator).sort((a, b) => b[1] - a[1]);

    // Ghosting: top silences + revival rates
    const ghostsSorted = [...acc.ghosts].sort((a, b) => b.minutes - a.minutes);
    const ghostInitiator = {}; // who revives most often
    const ghostSilenced = {};  // whose last message goes longest unanswered
    for (const g of acc.ghosts) {
        ghostInitiator[g.revived] = (ghostInitiator[g.revived] || 0) + 1;
        ghostSilenced[g.silenced] = (ghostSilenced[g.silenced] || 0) + 1;
    }

    // Compatibility (for 2-person conversations)
    const compatibility = ranking.length === 2
        ? computeCompatibility(perPerson, ranking, acc)
        : null;

    const result = {
        lang: acc.lang,
        startDate,
        endDate,
        totalDays,
        totalMessages: acc.totalMessages,
        avgPerDay: (acc.totalMessages / totalDays).toFixed(1),
        totalChars: acc.totalChars,
        totalMedia: acc.totalMedia,
        totalEdited: acc.totalEdited,
        totalLinks: acc.totalLinks,
        avgMsgLen: acc.textCount > 0 ? Math.round(acc.textChars / acc.textCount) : 0,
        participants: Object.keys(perPerson).length,
        perPerson,
        ranking,
        hourly: acc.hourly,
        weekday: acc.weekday,
        heatmap: acc.heatmap,
        daily: acc.daily,
        monthly: acc.monthly,
        monthlyPerPerson: acc.monthlyPerPerson,
        peakHour,
        peakDay,
        mostActiveDay,
        topWords,
        topWordsPerPerson,
        uniqueWordsPerPerson,
        emojis: {
            total: acc.totalEmojis,
            unique: Object.keys(acc.emojiFreq).length,
            top: emojiEntries.slice(0, 15),
            perPerson: emojisPerPerson,
        },
        mediaTypes: acc.mediaTypes,
        responseStats,
        longestMessage: acc.longestMessage,
        streak,
        firstMessage: acc.firstMessage,
        nightOwl: nightOwlE[0] || null,
        earlyBird: earlyBirdE[0] || null,
        reactions: {
            total: acc.reactions.total,
            topEmojis: Object.entries(acc.reactions.perEmoji).sort((a, b) => b[1] - a[1]).slice(0, 10),
            perAuthor: Object.entries(acc.reactions.perAuthor).sort((a, b) => b[1] - a[1]),
        },
        initiator: initiatorRanking,
        ghosting: {
            count: acc.ghosts.length,
            longest: ghostsSorted.slice(0, 5),
            revivers: Object.entries(ghostInitiator).sort((a, b) => b[1] - a[1]),
            silenced: Object.entries(ghostSilenced).sort((a, b) => b[1] - a[1]),
        },
        sentiment: null,
        compatibility,
    };

    return stripInternal(result);
}

function stripInternal(stats) {
    for (const p of Object.values(stats.perPerson)) delete p._wordFreq;
    return stats;
}

function computeStreak(daily) {
    const dates = Object.keys(daily).sort();
    if (dates.length === 0) return { max: 0 };
    let maxStreak = 1;
    let cur = 1;
    for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1]);
        const curr = new Date(dates[i]);
        const diff = Math.round((curr - prev) / 86400000);
        if (diff === 1) { cur++; maxStreak = Math.max(maxStreak, cur); }
        else cur = 1;
    }
    return { max: maxStreak };
}

/**
 * Compatibility score for a 2-person chat.
 * Combines hour-pattern overlap, message-length similarity, and reciprocity.
 * Returns 0–100.
 */
function computeCompatibility(perPerson, ranking, acc) {
    const [a, b] = ranking.map(r => r[0]);

    // Message-length similarity (1 = identical)
    const la = perPerson[a].avgLen || 1;
    const lb = perPerson[b].avgLen || 1;
    const lenSim = 1 - Math.abs(la - lb) / Math.max(la, lb);

    // 3. Volume balance (1 = 50/50)
    const ca = perPerson[a].count;
    const cb = perPerson[b].count;
    const balance = 1 - Math.abs(ca - cb) / (ca + cb);

    // 4. Reciprocity: close response times on both sides
    const rtA = perPerson[a].avgResponseMin ?? 60;
    const rtB = perPerson[b].avgResponseMin ?? 60;
    const rtMax = Math.max(rtA, rtB, 1);
    const rtMin = Math.min(rtA, rtB, 1);
    const rtSim = rtMin / rtMax;

    // 5. Low ghost rate bonus: fewer 24h+ silences relative to days
    const days = Object.keys(acc.daily).length || 1;
    const ghostRate = acc.ghosts.length / days;
    const ghostScore = Math.max(0, 1 - ghostRate * 2);

    const score = (lenSim * 0.2 + balance * 0.3 + rtSim * 0.3 + ghostScore * 0.2) * 100;

    return {
        score: Math.round(score),
        components: {
            lengthSimilarity: Math.round(lenSim * 100),
            volumeBalance: Math.round(balance * 100),
            reciprocity: Math.round(rtSim * 100),
            consistency: Math.round(ghostScore * 100),
        },
    };
}

/**
 * Compare two stats objects (year N vs N-1).
 * Returns deltas for a handful of key metrics.
 */
export function compareYears(current, previous) {
    if (!current || !previous) return null;
    const pct = (a, b) => b === 0 ? null : Math.round(((a - b) / b) * 100);
    return {
        messages: { current: current.totalMessages, previous: previous.totalMessages, pct: pct(current.totalMessages, previous.totalMessages) },
        days: { current: current.totalDays, previous: previous.totalDays },
        avgPerDay: { current: +current.avgPerDay, previous: +previous.avgPerDay, pct: pct(+current.avgPerDay, +previous.avgPerDay) },
        emojis: { current: current.emojis.total, previous: previous.emojis.total, pct: pct(current.emojis.total, previous.emojis.total) },
        media: { current: current.totalMedia, previous: previous.totalMedia, pct: pct(current.totalMedia, previous.totalMedia) },
        streak: { current: current.streak.max, previous: previous.streak.max },
    };
}
