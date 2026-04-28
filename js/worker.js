/**
 * Worker: parses text, computes stats, then runs ML sentiment analysis.
 * Uses Transformers.js v3 with optional WebGPU acceleration.
 */

import { parse } from './parser.js';
import { compute, compareYears } from './stats.js';
import { COMPLIMENT, INSULT } from './lang/sentiment.js';
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2';

env.allowLocalModels = false;

const SENTIMENT_MODEL = 'Xenova/distilbert-base-multilingual-cased-sentiments-student';
const IRONY_MODEL = 'Xenova/twitter-roberta-base-irony';

const SAMPLE_PER_AUTHOR_GPU = 250;
const SAMPLE_PER_AUTHOR_CPU = 60;
const MAX_TOTAL_GPU = 2000;
const MAX_TOTAL_CPU = 400;
const MIN_CHARS = 8;
const MAX_CHARS = 400;
const BATCH_GPU = 32;
const BATCH_CPU = 8;
const STRONG = 0.4;
const IRONY_FLIP_WEIGHT = 0.7;
const MIN_DAY_SAMPLES = 3;   // min events/day for best/worst ranking
const MIN_AFTER_SAMPLES = 5; // min events after author for directed sentiment
const MIN_STABLE_SAMPLES = 30; // need enough variance to call someone "stable"

// Emoji reactions as a strong, full-coverage sentiment signal.
// Polarity in [-1, +1]. Only listed emojis contribute; unknown ones are ignored.
const EMOJI_POLARITY = {
    '❤️': 1, '❤': 1, '🧡': 1, '💛': 1, '💚': 1, '💙': 1, '💜': 1, '🤍': 0.9, '🤎': 0.9,
    '💖': 1, '💗': 1, '💓': 1, '💞': 1, '💕': 1, '💝': 1, '💘': 1, '😍': 1, '🥰': 1,
    '😘': 0.9, '😻': 1, '🌹': 0.8, '🌸': 0.7, '✨': 0.7, '🌟': 0.8, '⭐': 0.7,
    '🎉': 0.9, '🎊': 0.9, '🥳': 0.9, '🔥': 0.6, '💯': 0.8, '🙌': 0.7, '👏': 0.7,
    '👍': 0.6, '👌': 0.6, '✅': 0.5, '💪': 0.6, '🤝': 0.5, '🤗': 0.8,
    '😂': 0.7, '🤣': 0.7, '😆': 0.7, '😄': 0.7, '😃': 0.6, '😁': 0.6, '😊': 0.7, '🙂': 0.4,
    '😮': 0, '😯': 0, '😲': 0, '🤔': 0, '🤨': -0.1, '😐': 0, '😑': -0.1,
    '🙄': -0.4, '😒': -0.5, '😕': -0.4, '😟': -0.5, '😔': -0.6, '😞': -0.6,
    '😢': -0.7, '😭': -0.8, '😿': -0.7, '💔': -0.9,
    '😡': -1, '😠': -0.9, '🤬': -1, '👎': -0.7, '❌': -0.5, '🤮': -0.8, '🤢': -0.7,
};

const SARCASM_PATTERNS = [
    /\bouais bien s[uû]rs?\b/i,
    /\bouais c['e ]?est [çc]a\b/i,
    /\bmais bien s[uû]r\b/i,
    /\bcomme par hasard\b/i,
    /\bbravo champion\b/i,
    /\/s(\b|$)/,
    /\bquelle surprise\b/i,
];
const SARCASM_EMOJIS = ['🙄', '😒', '🤡', '🥲'];

let _sentClassifier = null;
let _ironyClassifier = null;
let _device = null;

async function detectDevice() {
    if (_device) return _device;
    const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator;
    if (hasWebGPU) {
        try { await navigator.gpu.requestAdapter(); _device = 'webgpu'; return _device; }
        catch { /* fall through */ }
    }
    _device = 'wasm';
    return _device;
}

async function loadSentiment(device, onProgress) {
    if (_sentClassifier) return _sentClassifier;
    _sentClassifier = await pipeline('text-classification', SENTIMENT_MODEL, {
        device,
        dtype: device === 'webgpu' ? 'fp32' : 'q8',
        progress_callback: (info) => {
            if (info.status === 'progress' && typeof info.progress === 'number') {
                onProgress(`Chargement du modele de sentiment... ${Math.round(info.progress)}%`);
            }
        },
    });
    return _sentClassifier;
}

async function loadIrony(device, onProgress) {
    if (_ironyClassifier === false) return null;
    if (_ironyClassifier) return _ironyClassifier;
    try {
        _ironyClassifier = await pipeline('text-classification', IRONY_MODEL, {
            device,
            dtype: device === 'webgpu' ? 'fp32' : 'q8',
            progress_callback: (info) => {
                if (info.status === 'progress' && typeof info.progress === 'number') {
                    onProgress(`Chargement du modele d'ironie... ${Math.round(info.progress)}%`);
                }
            },
        });
        return _ironyClassifier;
    } catch (err) {
        console.warn('Irony model unavailable, using lexical fallback:', err);
        _ironyClassifier = false;
        return null;
    }
}

function lexicalSarcasm(text) {
    for (const re of SARCASM_PATTERNS) if (re.test(text)) return true;
    for (const e of SARCASM_EMOJIS) if (text.includes(e)) return true;
    return false;
}

/**
 * Pick up to `n` items from an array of {text, dt, prevAuthor},
 * biased toward longer messages, spread across 3 timeline thirds.
 */
function selectSample(items, n) {
    if (items.length <= n) return items.slice();
    const third = Math.ceil(items.length / 3);
    const buckets = [
        items.slice(0, third),
        items.slice(third, third * 2),
        items.slice(third * 2),
    ].map(b => [...b].sort((a, b) => b.text.length - a.text.length));
    const out = [];
    let i = 0;
    while (out.length < n) {
        let added = false;
        for (const b of buckets) {
            if (i < b.length && out.length < n) { out.push(b[i]); added = true; }
        }
        if (!added) break;
        i++;
    }
    return out;
}

function polarityFromScores(scores) {
    if (!scores) return 0;
    let flat;
    if (Array.isArray(scores)) {
        flat = (scores.length > 0 && Array.isArray(scores[0])) ? scores[0] : scores;
    } else if (typeof scores === 'object' && 'label' in scores) {
        flat = [scores];
    } else {
        return 0;
    }
    let pos = 0, neg = 0;
    for (const item of flat) {
        if (!item || typeof item.label !== 'string') continue;
        const l = item.label.toLowerCase();
        const s = Number(item.score) || 0;
        if (l === 'label_2' || l.startsWith('pos')) pos = Math.max(pos, s);
        else if (l === 'label_0' || l.startsWith('neg')) neg = Math.max(neg, s);
    }
    return pos - neg;
}

function isIrony(scores) {
    if (!scores) return false;
    const flat = Array.isArray(scores) && Array.isArray(scores[0]) ? scores[0]
               : Array.isArray(scores) ? scores : [scores];
    for (const item of flat) {
        if (!item || typeof item.label !== 'string') continue;
        const l = item.label.toLowerCase();
        if ((l === 'irony' || l === 'label_1') && (Number(item.score) || 0) > 0.6) return true;
    }
    return false;
}

async function classifyBatched(classifier, texts, batchSize, topK, mapFn, onProgressTick) {
    const out = new Array(texts.length);
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        let results;
        try {
            results = await classifier(batch, { top_k: topK });
        } catch {
            results = [];
            for (const t of batch) {
                try { results.push(await classifier(t, { top_k: topK })); }
                catch { results.push(null); }
            }
        }
        for (let j = 0; j < batch.length; j++) {
            const r = results[j];
            out[i + j] = r ? mapFn(r) : null;
        }
        onProgressTick(batch.length);
    }
    return out;
}

async function computeSentimentML(messages, lang, onProgress) {
    // Pass 1 — categorical (compliments / insults / words), reaction-based
    // sentiment events on the FULL dataset, and sample lists for the ML pass.
    const byAuthor = {};
    const categorical = {};
    const reactionStats = {};   // author → { sent: {sum,count}, received: {sum,count} }

    // Aggregates for temporal / directed analysis. Fed by BOTH reactions (full
    // coverage) and ML polarities (sampled) — same [-1,+1] scale.
    const monthlyAgg   = {};
    const monthlyPPAgg = {};
    const hourlyAgg    = {};
    const dailyAgg     = {};
    const afterAgg     = {};

    const addEvent = (author, dt, pol, prevAuthor) => {
        if (dt) {
            const y  = dt.getFullYear();
            const mo = String(dt.getMonth() + 1).padStart(2, '0');
            const d  = String(dt.getDate()).padStart(2, '0');
            const mKey = `${y}-${mo}`;
            const dKey = `${y}-${mo}-${d}`;
            const h  = dt.getHours();
            (monthlyAgg[mKey] ??= { sum: 0, count: 0 }).sum += pol;
            monthlyAgg[mKey].count++;
            ((monthlyPPAgg[author] ??= {})[mKey] ??= { sum: 0, count: 0 }).sum += pol;
            monthlyPPAgg[author][mKey].count++;
            (hourlyAgg[h] ??= { sum: 0, count: 0 }).sum += pol;
            hourlyAgg[h].count++;
            (dailyAgg[dKey] ??= { sum: 0, count: 0 }).sum += pol;
            dailyAgg[dKey].count++;
        }
        if (prevAuthor) {
            (afterAgg[prevAuthor] ??= { sum: 0, count: 0 }).sum += pol;
            afterAgg[prevAuthor].count++;
        }
    };

    // Tracks the last *conversational* author (skips reactions, which aren't turns).
    let prevTurnAuthor = null;

    for (const m of messages) {
        if (m.isReaction) {
            const pol = EMOJI_POLARITY[m.reactionEmoji];
            if (typeof pol === 'number') {
                const reactor = m.author;
                const target  = prevTurnAuthor;
                const sent     = (reactionStats[reactor] ??= { sent: { sum: 0, count: 0 }, received: { sum: 0, count: 0 } }).sent;
                sent.sum += pol; sent.count++;
                if (target && target !== reactor) {
                    const rec = (reactionStats[target] ??= { sent: { sum: 0, count: 0 }, received: { sum: 0, count: 0 } }).received;
                    rec.sum += pol; rec.count++;
                }
                // The reactor expresses mood at this time → contribute to temporal.
                // For "after": reaction is a response to the target's message, so
                // attribute the reactor's polarity to `target` as influencer.
                addEvent(reactor, m.datetime, pol, (target && target !== reactor) ? target : null);
            }
            // Reactions don't advance the conversational turn.
            continue;
        }
        if (!m.message) continue;

        // Non-reaction message → counts as a turn (even media, since users
        // respond to media). System messages already filtered by the parser.
        if (!m.isMedia) {
            const cat = categorical[m.author] ??= { compliment: 0, insult: 0, words: 0 };
            for (const w of m.message.toLowerCase().split(/\s+/)) {
                if (COMPLIMENT.has(w)) cat.compliment++;
                if (INSULT.has(w)) cat.insult++;
                cat.words++;
            }
            if (m.message.length >= MIN_CHARS) {
                (byAuthor[m.author] ??= []).push({
                    text: m.message,
                    dt: m.datetime,
                    prevAuthor: prevTurnAuthor !== m.author ? prevTurnAuthor : null,
                });
            }
        }
        prevTurnAuthor = m.author;
    }

    const authors = Object.keys(byAuthor);
    const reactionAuthors = Object.keys(reactionStats);
    const allAuthors = Array.from(new Set([...authors, ...reactionAuthors]));

    // Reactions alone can already produce useful aggregates even if there's
    // no text long enough for ML.
    if (authors.length === 0) {
        const aggregates = finalizeAggregates(monthlyAgg, monthlyPPAgg, hourlyAgg, dailyAgg, afterAgg);
        return buildResult(allAuthors, categorical, {}, reactionStats, aggregates, { mlEnabled: false, device: null });
    }

    onProgress('Detection du materiel...');
    const device = await detectDevice();

    const samplePerAuthor = device === 'webgpu' ? SAMPLE_PER_AUTHOR_GPU : SAMPLE_PER_AUTHOR_CPU;
    const maxTotal       = device === 'webgpu' ? MAX_TOTAL_GPU       : MAX_TOTAL_CPU;
    const batchSize      = device === 'webgpu' ? BATCH_GPU           : BATCH_CPU;
    const budgetPerAuthor = Math.max(10, Math.min(samplePerAuthor, Math.floor(maxTotal / authors.length)));

    let sentClassifier;
    try {
        sentClassifier = await loadSentiment(device, onProgress);
    } catch (err) {
        const msg = `[sentiment] modele KO sur ${device}: ${err && err.message ? err.message : err}`;
        console.error(msg, err);
        onProgress(msg);
        const aggregates = finalizeAggregates(monthlyAgg, monthlyPPAgg, hourlyAgg, dailyAgg, afterAgg);
        return buildResult(allAuthors, categorical, {}, reactionStats, aggregates, { mlEnabled: false, device, error: String(err) });
    }

    // Smoke-test to catch label/format issues early.
    try {
        const probe = await sentClassifier('je suis tres heureux', { top_k: 3 });
        console.log('[sentiment] probe output:', JSON.stringify(probe));
        console.log('[sentiment] probe polarity:', polarityFromScores(probe));
    } catch (err) {
        console.error('[sentiment] probe inference failed:', err);
    }

    let ironyClassifier = null;
    if (lang === 'en') ironyClassifier = await loadIrony(device, onProgress);

    // Build samples (with datetime + prevAuthor context).
    const samples = {};
    let totalSamples = 0;
    for (const author of authors) {
        samples[author] = selectSample(byAuthor[author], budgetPerAuthor)
            .map(item => ({ ...item, text: item.text.slice(0, MAX_CHARS) }));
        totalSamples += samples[author].length;
    }

    const totalSteps = totalSamples * (ironyClassifier ? 2 : 1);
    let done = 0;
    const tick = (n) => {
        done += n;
        onProgress(`Analyse des sentiments... ${Math.round(done / totalSteps * 100)}%`);
    };

    const polarity = {};

    for (const author of authors) {
        const items = samples[author];
        const texts = items.map(item => item.text);

        const polarities = await classifyBatched(sentClassifier, texts, batchSize, 3, polarityFromScores, tick);

        let ironyFlags = null;
        if (ironyClassifier) {
            ironyFlags = await classifyBatched(ironyClassifier, texts, batchSize, 2, isIrony, tick);
        }

        let pos = 0, neg = 0, strongPos = 0, strongNeg = 0;
        let count = 0, sumNorm = 0, sumAbs = 0, sumSq = 0;
        let sarcasmHits = 0;

        for (let i = 0; i < items.length; i++) {
            let norm = polarities[i];
            if (norm == null) continue;

            const ironyML = ironyFlags ? ironyFlags[i] : false;
            const ironyLex = lexicalSarcasm(items[i].text);
            if ((ironyML || ironyLex) && norm > 0.2) {
                norm = -norm * IRONY_FLIP_WEIGHT;
                sarcasmHits++;
            }

            if (norm > 0) pos += norm; else neg += -norm;
            if (norm >= STRONG) strongPos++;
            if (norm <= -STRONG) strongNeg++;
            sumNorm += norm;
            sumAbs  += Math.abs(norm);
            sumSq   += norm * norm;
            count++;

            // Same aggregates already populated by reactions in pass 1.
            addEvent(author, items[i].dt, norm, items[i].prevAuthor);
        }

        const mean   = count > 0 ? sumNorm / count : 0;
        const stdDev = count > 1 ? Math.sqrt(Math.max(0, sumSq / count - mean * mean)) : 0;
        polarity[author] = {
            pos, neg, strongPos, strongNeg, count, sarcasmHits,
            mean, stdDev,
            intensity: count > 0 ? sumAbs / count : 0,
        };
        console.log(`[sentiment] ${author}: ${count} samples, pos=${pos.toFixed(2)}, neg=${neg.toFixed(2)}, mean=${mean.toFixed(2)}, stdDev=${stdDev.toFixed(2)}`);
    }

    const aggregates = finalizeAggregates(monthlyAgg, monthlyPPAgg, hourlyAgg, dailyAgg, afterAgg);
    return buildResult(allAuthors, categorical, polarity, reactionStats, aggregates,
        { mlEnabled: true, device, ironyModel: !!ironyClassifier });
}

function finalizeAggregates(monthlyAgg, monthlyPPAgg, hourlyAgg, dailyAgg, afterAgg) {
    const monthly = Object.fromEntries(
        Object.entries(monthlyAgg).map(([k, v]) => [k, v.sum / v.count]),
    );
    const monthlyPerPerson = Object.fromEntries(
        Object.entries(monthlyPPAgg).map(([a, months]) => [
            a,
            Object.fromEntries(Object.entries(months).map(([k, v]) => [k, v.sum / v.count])),
        ]),
    );
    const sentimentHourly = Array.from({ length: 24 }, (_, h) => {
        const d = hourlyAgg[h];
        return (d && d.count >= 3) ? d.sum / d.count : null;
    });
    const dayEntries = Object.entries(dailyAgg)
        .filter(([, v]) => v.count >= MIN_DAY_SAMPLES)
        .map(([k, v]) => ({ date: k, mean: v.sum / v.count, count: v.count }));
    const bestDays  = [...dayEntries].sort((a, b) => b.mean - a.mean).slice(0, 3);
    const worstDays = [...dayEntries].sort((a, b) => a.mean - b.mean).slice(0, 3);
    const afterAuthor = Object.fromEntries(
        Object.entries(afterAgg)
            .filter(([, v]) => v.count >= MIN_AFTER_SAMPLES)
            .map(([a, v]) => [a, { mean: v.sum / v.count, count: v.count }]),
    );
    return { monthly, monthlyPerPerson, sentimentHourly, bestDays, worstDays, afterAuthor };
}

function buildResult(authors, categorical, polarity, reactionStats, aggregates, meta) {
    const entries = authors.map(author => {
        const cat = categorical[author] ?? {};
        const pol = polarity[author] ?? { pos: 0, neg: 0, strongPos: 0, strongNeg: 0, count: 0, sarcasmHits: 0, mean: 0, stdDev: 0, intensity: 0 };
        const rx  = reactionStats[author] ?? { sent: { sum: 0, count: 0 }, received: { sum: 0, count: 0 } };
        return {
            author,
            pos:          Math.round(pol.pos * 10) / 10,
            neg:          Math.round(pol.neg * 10) / 10,
            strongPos:    pol.strongPos,
            strongNeg:    pol.strongNeg,
            sampled:      pol.count,
            sarcasmHits:  pol.sarcasmHits,
            intensity:    Math.round(pol.intensity * 100) / 100,
            stdDev:       Math.round(pol.stdDev * 100) / 100,
            compliment:   cat.compliment ?? 0,
            insult:       cat.insult ?? 0,
            words:        cat.words ?? 0,
            rate:         pol.mean,
            reactionsSent:        rx.sent.count,
            reactionsSentMean:    rx.sent.count     > 0 ? rx.sent.sum     / rx.sent.count     : 0,
            reactionsReceived:    rx.received.count,
            reactionsReceivedMean:rx.received.count > 0 ? rx.received.sum / rx.received.count : 0,
        };
    });

    const ranked = (key, dir, requireSamples) => [...entries]
        .filter(e => !requireSamples || e.sampled > 0)
        .sort((a, b) => dir * (b[key] - a[key]))[0] ?? null;

    // Volatility / stability — require enough variance to be meaningful.
    const stableCandidates = entries.filter(e => e.sampled >= MIN_STABLE_SAMPLES);
    const mostVolatile = stableCandidates.length > 0 ? [...stableCandidates].sort((a, b) => b.stdDev - a.stdDev)[0] : null;
    const mostStable   = stableCandidates.length > 1 ? [...stableCandidates].sort((a, b) => a.stdDev - b.stdDev)[0] : null;

    const reactionRanked = entries.filter(e => e.reactionsReceived >= 5);
    const mostBeloved = reactionRanked.length > 1
        ? [...reactionRanked].sort((a, b) => b.reactionsReceivedMean - a.reactionsReceivedMean)[0]
        : null;
    const reactorRanked = entries.filter(e => e.reactionsSent >= 5);
    const mostExpressive = reactorRanked.length > 0
        ? [...reactorRanked].sort((a, b) => b.reactionsSent - a.reactionsSent)[0]
        : null;

    return {
        mlEnabled:  meta.mlEnabled,
        device:     meta.device,
        ironyModel: !!meta.ironyModel,
        perPerson: entries,
        sweetest:     ranked('compliment', 1, false),
        sharpest:     ranked('insult', 1, false),
        mostPositive: ranked('rate', 1, true),
        mostNegative: ranked('rate', -1, true),
        mostIntense:  ranked('intensity', 1, true),
        mostVolatile,
        mostStable,
        mostBeloved,
        mostExpressive,
        // Temporal & directed aggregates.
        monthly:          aggregates.monthly          ?? {},
        monthlyPerPerson: aggregates.monthlyPerPerson ?? {},
        sentimentHourly:  aggregates.sentimentHourly  ?? new Array(24).fill(null),
        bestDays:         aggregates.bestDays          ?? [],
        worstDays:        aggregates.worstDays         ?? [],
        afterAuthor:      aggregates.afterAuthor       ?? {},
    };
}

self.onmessage = async (e) => {
    const { text, year } = e.data;
    try {
        const all = parse(text);
        const yearCounts = {};
        for (const m of all) {
            const y = m.datetime.getFullYear();
            yearCounts[y] = (yearCounts[y] || 0) + 1;
        }
        const years = Object.keys(yearCounts).map(Number).sort((a, b) => b - a);

        if (year === undefined) {
            self.postMessage({ kind: 'years', years, yearCounts });
            return;
        }

        const filtered = year == null
            ? all
            : all.filter(m => m.datetime.getFullYear() === year);

        if (filtered.length < 5) throw new Error('Trop peu de messages trouvés.');

        const stats = compute(filtered);

        let comparison = null;
        if (year != null) {
            const prev = all.filter(m => m.datetime.getFullYear() === year - 1);
            if (prev.length >= 20) {
                const prevStats = compute(prev);
                comparison = compareYears(stats, prevStats);
            }
        }

        const onProgress = (msg) => self.postMessage({ kind: 'progress', text: msg });
        stats.sentiment = await computeSentimentML(filtered, stats.lang, onProgress);

        self.postMessage({ kind: 'stats', stats, comparison });
    } catch (err) {
        self.postMessage({ kind: 'error', message: err.message });
    }
};
