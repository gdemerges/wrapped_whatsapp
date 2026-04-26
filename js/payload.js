/**
 * Shared serialization for stats payloads (sessionStorage + #share URL).
 * Never include raw message bodies — only metadata.
 */

export function serializeStats(stats) {
    const s = JSON.parse(JSON.stringify(stats));
    s.startDate = new Date(stats.startDate).toISOString();
    s.endDate = new Date(stats.endDate).toISOString();
    if (s.firstMessage?.datetime) {
        s.firstMessage.datetime = new Date(stats.firstMessage.datetime).toISOString();
        delete s.firstMessage.message;
    }
    if (s.longestMessage?.datetime) {
        s.longestMessage.datetime = new Date(stats.longestMessage.datetime).toISOString();
        delete s.longestMessage.message;
    }
    if (s.ghosting?.longest) {
        s.ghosting.longest = s.ghosting.longest.map(g => ({ ...g, when: new Date(g.when).toISOString() }));
    }
    return s;
}

export function rehydrateDates(stats) {
    if (typeof stats.startDate === 'string') stats.startDate = new Date(stats.startDate);
    if (typeof stats.endDate === 'string') stats.endDate = new Date(stats.endDate);
    if (stats.firstMessage?.datetime && typeof stats.firstMessage.datetime === 'string') {
        stats.firstMessage.datetime = new Date(stats.firstMessage.datetime);
    }
    if (stats.longestMessage?.datetime && typeof stats.longestMessage.datetime === 'string') {
        stats.longestMessage.datetime = new Date(stats.longestMessage.datetime);
    }
    if (stats.ghosting?.longest) {
        stats.ghosting.longest = stats.ghosting.longest.map(g => ({
            ...g,
            when: g.when instanceof Date ? g.when : new Date(g.when),
        }));
    }
    return stats;
}

export function buildShareURL(stats, comparison, opts = {}) {
    const s = serializeStats(stats);
    if (opts.dropDaily) delete s.daily;
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify({ s, c: comparison }));
    return window.location.origin + window.location.pathname + '#share=' + compressed;
}
