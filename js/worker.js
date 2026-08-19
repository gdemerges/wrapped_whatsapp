/**
 * Worker entry.
 *
 * The worker owns the heavy data end-to-end: it reads the file, parses it,
 * keeps the parsed messages, hits the IndexedDB cache and computes the stats.
 * The main thread never holds the chat text — previously it kept the full
 * string *and* structured-cloned a second copy into the worker on every call,
 * which doubled peak memory on large exports.
 *
 * Protocol
 *   → { kind: 'load', blob }              ← { kind: 'years', years, yearCounts }
 *   → { kind: 'stats', year, range, ai }  ← { kind: 'stats', stats, comparison }
 *   → { kind: 'reset' }                   (drops the retained parse)
 *   ←  { kind: 'progress', text }
 *   ←  { kind: 'error', message, diagnostics? }
 */

import { parse, diagnose } from './parser.js';
import { compute, compareYears } from './stats.js';
import { computeSentimentML } from './worker/sentiment-ml.js';
import { hashText, getCached, setCached } from './cache.js';

/** @type {import('./types.d.ts').Message[] | null} */
let messages = null;
/** Hash of the loaded file — the cache-key prefix for every derived result. */
let fileHash = null;

const post = (msg) => self.postMessage(msg);
const progress = (text) => post({ kind: 'progress', text });

self.onmessage = async (e) => {
    const msg = e.data || {};
    try {
        switch (msg.kind) {
            case 'load':   await handleLoad(msg); break;
            case 'stats':  await handleStats(msg); break;
            case 'reset':  messages = null; fileHash = null; break;
            default: throw new Error(`Message worker inconnu: ${msg.kind}`);
        }
    } catch (err) {
        post({ kind: 'error', message: err.message, diagnostics: err.diagnostics || null });
    }
};

async function handleLoad({ blob }) {
    progress('Lecture du fichier...');
    const text = await blob.text();

    progress('Analyse des messages...');
    fileHash = await hashText(text);
    try {
        messages = parse(text);
    } catch (err) {
        // Attach a diagnostic snapshot so the UI can tell the user *why* the
        // file was rejected instead of just flashing "format non reconnu".
        err.diagnostics = diagnose(text);
        throw err;
    }

    if (messages.length === 0) {
        const err = new Error('Aucun message exploitable dans ce fichier.');
        err.diagnostics = diagnose(text);
        throw err;
    }

    const yearCounts = {};
    for (const m of messages) {
        const y = m.datetime.getFullYear();
        yearCounts[y] = (yearCounts[y] || 0) + 1;
    }
    const years = Object.keys(yearCounts).map(Number).sort((a, b) => b - a);

    post({
        kind: 'years',
        years,
        yearCounts,
        bounds: {
            from: messages[0].datetime.toISOString(),
            to: messages[messages.length - 1].datetime.toISOString(),
        },
    });
}

async function handleStats({ year = null, range = null, ai = false }) {
    if (!messages) throw new Error('Aucun fichier chargé.');

    const selection = selectMessages(messages, year, range);
    if (selection.length < 5) throw new Error('Trop peu de messages sur cette période.');

    const cacheKey = `${fileHash}|y=${year}|r=${range ? range.from + '_' + range.to : ''}|ai=${ai ? 1 : 0}`;
    const cached = await getCached(cacheKey);
    if (cached) {
        progress('Restauration depuis le cache...');
        post({ kind: 'stats', stats: cached.stats, comparison: cached.comparison, cached: true });
        return;
    }

    progress('Calcul des stats...');
    const stats = compute(selection);
    const comparison = buildComparison(messages, stats, year, range);

    stats.sentiment = await computeSentimentML(selection, stats.lang, progress, { useML: ai });

    setCached(cacheKey, { stats, comparison });
    post({ kind: 'stats', stats, comparison, cached: false });
}

/** Filter by explicit date range if given, else by year, else everything. */
function selectMessages(all, year, range) {
    if (range) {
        const from = new Date(range.from).getTime();
        const to = new Date(range.to).getTime();
        return all.filter(m => {
            const t = m.datetime.getTime();
            return t >= from && t <= to;
        });
    }
    if (year != null) return all.filter(m => m.datetime.getFullYear() === year);
    return all;
}

/**
 * Comparison baseline: the previous calendar year, or — for a custom range —
 * the window of equal length immediately before it.
 */
function buildComparison(all, stats, year, range) {
    let previous;
    if (range) {
        const from = new Date(range.from).getTime();
        const to = new Date(range.to).getTime();
        const span = to - from;
        previous = all.filter(m => {
            const t = m.datetime.getTime();
            return t >= from - span - 1 && t < from;
        });
    } else if (year != null) {
        previous = all.filter(m => m.datetime.getFullYear() === year - 1);
    } else {
        return null;
    }
    if (previous.length < 20) return null;
    return compareYears(stats, compute(previous));
}
