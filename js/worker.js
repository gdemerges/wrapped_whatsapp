/**
 * Worker entry: parses text, computes stats, runs ML sentiment analysis.
 */

import { parse } from './parser.js';
import { compute, compareYears } from './stats.js';
import { computeSentimentML } from './worker/sentiment-ml.js';

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
