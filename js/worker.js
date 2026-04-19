/**
 * Worker: parses text and computes stats off the main thread.
 * Handles optional year filtering + N-1 comparison in one round trip.
 */

import { parse } from './parser.js';
import { compute, compareYears } from './stats.js';

self.onmessage = (e) => {
    const { text, year } = e.data;
    try {
        // Parse all first to expose available years
        const all = parse(text);
        const yearCounts = {};
        for (const m of all) {
            const y = m.datetime.getFullYear();
            yearCounts[y] = (yearCounts[y] || 0) + 1;
        }
        const years = Object.keys(yearCounts).map(Number).sort((a, b) => b - a);

        if (year === undefined) {
            // First round: just return available years for the picker
            self.postMessage({ kind: 'years', years, yearCounts });
            return;
        }

        const filtered = year == null
            ? all
            : all.filter(m => m.datetime.getFullYear() === year);

        if (filtered.length < 5) {
            throw new Error('Trop peu de messages trouvés.');
        }

        const stats = compute(filtered);

        let comparison = null;
        if (year != null) {
            const prev = all.filter(m => m.datetime.getFullYear() === year - 1);
            if (prev.length >= 20) {
                const prevStats = compute(prev);
                comparison = compareYears(stats, prevStats);
            }
        }

        self.postMessage({ kind: 'stats', stats, comparison });
    } catch (err) {
        self.postMessage({ kind: 'error', message: err.message });
    }
};
