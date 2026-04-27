/**
 * Worker: parses text, computes stats, then runs ML sentiment + irony analysis.
 * Uses Transformers.js v3 with optional WebGPU acceleration.
 */

import { parse } from './parser.js';
import { compute, compareYears } from './stats.js';
import { COMPLIMENT, INSULT } from './lang/sentiment.js';
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2';

env.allowLocalModels = false;

// --- Models ---
// Sentiment: multilingual DistilBERT (student-distilled), 3 classes pos/neu/neg.
// Verified Xenova model, ~70MB quantised. Trained on multilingual reviews +
// conversational data — works well on FR/EN/ES short messages.
const SENTIMENT_MODEL = 'Xenova/distilbert-base-multilingual-cased-sentiments-student';
// Irony detector (English): Twitter RoBERTa base, binary irony / non_irony.
const IRONY_MODEL = 'Xenova/twitter-roberta-base-irony';

// --- Sampling ---
const SAMPLE_PER_AUTHOR_GPU = 250;   // WebGPU is fast: analyse a lot
const SAMPLE_PER_AUTHOR_CPU = 60;
const MAX_TOTAL_GPU = 2000;
const MAX_TOTAL_CPU = 400;
const MIN_CHARS = 8;
const MAX_CHARS = 400;
const BATCH_GPU = 32;
const BATCH_CPU = 8;

// Strong polarity threshold on a [-1, +1] scale.
const STRONG = 0.4;
// When irony is detected, flip the polarity with this confidence weight.
const IRONY_FLIP_WEIGHT = 0.7;

// FR / generic sarcasm markers (irony model is EN-only).
const SARCASM_PATTERNS = [
    /\bouais bien s[uû]rs?\b/i,
    /\bouais c['e ]?est [çc]a\b/i,
    /\bmais bien s[uû]r\b/i,
    /\bcomme par hasard\b/i,
    /\bbravo champion\b/i,
    /\bsuper g[ée]nial\b.*🙄/iu,
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
    if (_ironyClassifier === false) return null;        // previously failed
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
        console.warn('Irony model failed to load, falling back to lexical:', err);
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
 * Pick up to `n` messages biased toward longer ones, spread across timeline thirds.
 */
function selectSample(messages, n) {
    if (messages.length <= n) return messages.slice();
    const third = Math.ceil(messages.length / 3);
    const buckets = [
        messages.slice(0, third),
        messages.slice(third, third * 2),
        messages.slice(third * 2),
    ].map(b => [...b].sort((a, b) => b.length - a.length));
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

/**
 * Convert classifier output to a polarity score in [-1, +1].
 * Robust to: arrays vs single object, capitalised labels, LABEL_N format,
 * and top-1-only returns (defaults to score-or-zero for missing classes).
 */
function polarityFromScores(scores) {
    if (!scores) return 0;
    // Normalize to a flat array of {label, score}.
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

/**
 * Run a batched classification, returning one result per input (null on failure).
 */
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
    // Pass 1 — categorical (compliments / insults / words) on ALL text messages.
    const byAuthor = {};
    const categorical = {};
    for (const m of messages) {
        if (m.isMedia || m.isReaction || !m.message) continue;
        const cat = categorical[m.author] ??= { compliment: 0, insult: 0, words: 0 };
        for (const w of m.message.toLowerCase().split(/\s+/)) {
            if (COMPLIMENT.has(w)) cat.compliment++;
            if (INSULT.has(w)) cat.insult++;
            cat.words++;
        }
        if (m.message.length >= MIN_CHARS) (byAuthor[m.author] ??= []).push(m.message);
    }

    const authors = Object.keys(byAuthor);
    if (authors.length === 0) return buildResult(authors, categorical, {}, { mlEnabled: false, device: null });

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
        return buildResult(authors, categorical, {}, { mlEnabled: false, device, error: String(err) });
    }
    // Smoke-test the classifier so we can detect format issues immediately.
    try {
        const probe = await sentClassifier('je suis tres heureux', { top_k: 3 });
        console.log('[sentiment] probe output:', JSON.stringify(probe));
        const probeScore = polarityFromScores(probe);
        console.log('[sentiment] probe polarity:', probeScore);
    } catch (err) {
        console.error('[sentiment] probe inference failed:', err);
    }

    // Try to load irony model only for English-leaning chats (model is EN-only).
    let ironyClassifier = null;
    if (lang === 'en') ironyClassifier = await loadIrony(device, onProgress);

    // Build samples per author.
    const samples = {};
    let totalSamples = 0;
    for (const author of authors) {
        samples[author] = selectSample(byAuthor[author], budgetPerAuthor)
            .map(t => t.slice(0, MAX_CHARS));
        totalSamples += samples[author].length;
    }
    // We run sentiment + (optionally) irony, so progress is split across both.
    const totalSteps = totalSamples * (ironyClassifier ? 2 : 1);
    let done = 0;
    const tick = (n) => {
        done += n;
        onProgress(`Analyse des sentiments... ${Math.round(done / totalSteps * 100)}%`);
    };

    const polarity = {};
    for (const author of authors) {
        const texts = samples[author];

        const polarities = await classifyBatched(
            sentClassifier, texts, batchSize, 3, polarityFromScores, tick,
        );

        let ironyFlags = null;
        if (ironyClassifier) {
            ironyFlags = await classifyBatched(
                ironyClassifier, texts, batchSize, 2, isIrony, tick,
            );
        }

        let pos = 0, neg = 0, strongPos = 0, strongNeg = 0, count = 0, sumNorm = 0;
        let sarcasmHits = 0;
        let sumAbs = 0; // for variance/intensity

        for (let i = 0; i < texts.length; i++) {
            let norm = polarities[i];
            if (norm == null) continue;

            const ironyML = ironyFlags ? ironyFlags[i] : false;
            const ironyLex = lexicalSarcasm(texts[i]);
            if ((ironyML || ironyLex) && norm > 0.2) {
                norm = -norm * IRONY_FLIP_WEIGHT;
                sarcasmHits++;
            }

            if (norm > 0) pos += norm; else neg += -norm;
            if (norm >= STRONG) strongPos++;
            if (norm <= -STRONG) strongNeg++;
            sumNorm += norm;
            sumAbs += Math.abs(norm);
            count++;
        }

        polarity[author] = {
            pos, neg, strongPos, strongNeg, count, sarcasmHits,
            mean: count > 0 ? sumNorm / count : 0,
            intensity: count > 0 ? sumAbs / count : 0,
        };
        console.log(`[sentiment] ${author}: ${count} samples, pos=${pos.toFixed(2)}, neg=${neg.toFixed(2)}, mean=${(count > 0 ? sumNorm / count : 0).toFixed(2)}`);
    }

    return buildResult(authors, categorical, polarity, { mlEnabled: true, device, ironyModel: !!ironyClassifier });
}

function buildResult(authors, categorical, polarity, meta) {
    const entries = authors.map(author => {
        const cat = categorical[author] ?? {};
        const pol = polarity[author] ?? { pos: 0, neg: 0, strongPos: 0, strongNeg: 0, count: 0, sarcasmHits: 0, mean: 0, intensity: 0 };
        return {
            author,
            pos: Math.round(pol.pos * 10) / 10,
            neg: Math.round(pol.neg * 10) / 10,
            strongPos: pol.strongPos,
            strongNeg: pol.strongNeg,
            sampled: pol.count,
            sarcasmHits: pol.sarcasmHits,
            intensity: Math.round(pol.intensity * 100) / 100,
            compliment: cat.compliment ?? 0,
            insult: cat.insult ?? 0,
            words: cat.words ?? 0,
            rate: pol.mean,
        };
    });

    const ranked = (key, dir, requireSamples) => [...entries]
        .filter(e => !requireSamples || e.sampled > 0)
        .sort((a, b) => dir * (b[key] - a[key]))[0] ?? null;

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
