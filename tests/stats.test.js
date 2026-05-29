import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse } from '../js/parser.js';
import { compute, compareYears } from '../js/stats.js';
import { localDayKey } from '../js/utils.js';
import { detectLanguage } from '../js/lang/stopwords.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('stats.compute', () => {
    const messages = parse(fixture('ios_fr.txt'));
    const stats = compute(messages);

    it('computes basic counts', () => {
        expect(stats.totalMessages).toBe(messages.filter(m => !m.isReaction).length);
        expect(stats.participants).toBe(2);
    });

    it('ranks participants by message count', () => {
        expect(stats.ranking[0][0]).toBeTruthy();
        const total = stats.ranking.reduce((s, [, d]) => s + d.count, 0);
        expect(total).toBe(stats.totalMessages);
    });

    it('has hourly and weekday distributions', () => {
        expect(stats.hourly.length).toBe(24);
        expect(stats.weekday.length).toBe(7);
        expect(stats.hourly.reduce((a, b) => a + b, 0)).toBe(stats.totalMessages);
    });

    it('computes emojis', () => {
        expect(stats.emojis.total).toBeGreaterThan(0);
        expect(Array.isArray(stats.emojis.top)).toBe(true);
    });

    it('computes initiator per day', () => {
        expect(stats.initiator.length).toBeGreaterThan(0);
        const totalInit = stats.initiator.reduce((s, [, n]) => s + n, 0);
        const uniqueDays = new Set(messages.map(m => localDayKey(m.datetime))).size;
        expect(totalInit).toBe(uniqueDays);
    });

    it('detects reactions in stats', () => {
        expect(stats.reactions.total).toBe(1);
        expect(stats.reactions.topEmojis[0][0]).toBe('❤️');
    });

    it('detects compatibility for 2-person chats', () => {
        expect(stats.compatibility).toBeTruthy();
        expect(stats.compatibility.score).toBeGreaterThanOrEqual(0);
        expect(stats.compatibility.score).toBeLessThanOrEqual(100);
    });

    it('ghost detection triggers on 24h+ gaps', () => {
        // Fixture has gap from 23:45 day 1 to 07:15 day 2 (~7.5h — below 24h)
        // and from 13 March to 15 March — 2 days. Should trigger.
        expect(stats.ghosting.count).toBeGreaterThan(0);
    });

    it('computes unique vocabulary with floor=3', () => {
        // With short fixture no word hits floor=3, but shape should be valid
        expect(typeof stats.uniqueWordsPerPerson).toBe('object');
    });
});

describe('reactions are excluded from message-level stats', () => {
    const text = [
        '[01/01/2024 10:00:00] Alice: salut comment vas tu aujourdhui',
        '[01/01/2024 10:01:00] Bob: a réagi ❤️ à "salut comment vas tu"',
        '[01/01/2024 10:02:00] Bob: tres bien merci beaucoup',
    ].join('\n');
    const messages = parse(text);
    const stats = compute(messages);

    it('does not count reactions as messages', () => {
        expect(messages.filter(m => m.isReaction).length).toBe(1);
        expect(stats.totalMessages).toBe(2);
    });

    it('does not leak reaction-body words into word frequency', () => {
        const words = Object.fromEntries(stats.topWords);
        // "réagi" only ever appears in the reaction line
        expect(words['réagi']).toBeUndefined();
    });

    it('does not double-count reaction emojis as message emojis', () => {
        expect(stats.reactions.total).toBe(1);
        // ❤️ belongs to the reaction tally, not the general emoji stats
        expect(stats.emojis.top.find(([e]) => e === '❤️')).toBeUndefined();
        expect(stats.emojis.total).toBe(0);
    });
});

describe('stats timezone safety', () => {
    it('localDayKey uses local date, not UTC', () => {
        // 23:30 local is same day locally, but UTC might shift to next day for some zones
        const d = new Date(2024, 2, 15, 23, 30); // local construction
        expect(localDayKey(d)).toBe('2024-03-15');
    });
});

describe('language detection', () => {
    it('detects FR from French stopwords', () => {
        expect(detectLanguage('je suis dans la maison et nous avons du pain')).toBe('fr');
    });
    it('detects EN from English stopwords', () => {
        expect(detectLanguage('the quick brown fox has been jumping over that lazy dog for you')).toBe('en');
    });
});

describe('compareYears', () => {
    it('returns null for missing years', () => {
        expect(compareYears(null, null)).toBeNull();
    });
    it('computes deltas', () => {
        const a = { totalMessages: 200, totalDays: 100, avgPerDay: '2.0', emojis: { total: 50 }, totalMedia: 10, streak: { max: 5 } };
        const b = { totalMessages: 100, totalDays: 100, avgPerDay: '1.0', emojis: { total: 25 }, totalMedia: 5, streak: { max: 3 } };
        const cmp = compareYears(a, b);
        expect(cmp.messages.pct).toBe(100);
        expect(cmp.emojis.pct).toBe(100);
    });
});
