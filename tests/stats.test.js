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

describe('stats — link domains, interactions, chapters, profiles', () => {
    const line = (d, h, who, body) =>
        `[${String(d).padStart(2, '0')}/03/2024 ${String(h).padStart(2, '0')}:00:00] ${who}: ${body}`;

    it('buckets shared links by domain, ignoring www and ports', () => {
        const text = [
            line(1, 10, 'Alice', 'regarde https://www.youtube.com/watch?v=1'),
            line(1, 11, 'Bob', 'et https://youtube.com/watch?v=2'),
            line(2, 10, 'Alice', 'aussi https://lemonde.fr/article'),
            line(2, 11, 'Bob', 'ok'),
            line(3, 10, 'Alice', 'encore https://youtube.com/watch?v=3'),
        ].join('\n');
        const s = compute(parse(text));
        expect(s.topDomains[0]).toEqual(['youtube.com', 3]);
        expect(s.topDomains).toContainEqual(['lemonde.fr', 1]);
        expect(s.perPerson.Alice.topDomain[0]).toBe('youtube.com');
    });

    it('records who answers whom within the day', () => {
        const text = [
            line(1, 10, 'Alice', 'salut'),
            line(1, 11, 'Bob', 'yo'),
            line(1, 12, 'Alice', 'ça va ?'),
            line(1, 13, 'Bob', 'oui'),
            line(2, 10, 'Carol', 'coucou'),
            line(2, 11, 'Bob', 'hello Carol'),
        ].join('\n');
        const s = compute(parse(text));
        expect(s.interactions.matrix.Bob.Alice).toBe(2);
        expect(s.interactions.closest.Bob.author).toBe('Alice');
        expect(s.interactions.pairs[0].count).toBe(3); // Alice↔Bob, both directions
    });

    it('leaves chapters empty for a conversation too short to segment', () => {
        const text = [
            line(1, 10, 'Alice', 'un'),
            line(2, 10, 'Bob', 'deux'),
            line(3, 10, 'Alice', 'trois'),
            line(4, 10, 'Bob', 'quatre'),
            line(5, 10, 'Alice', 'cinq'),
        ].join('\n');
        expect(compute(parse(text)).chapters).toEqual([]);
    });

    it('splits a conversation into chapters when the rhythm changes durably', () => {
        const lines = [];
        // Three quiet months, then three loud ones.
        for (let month = 1; month <= 3; month++) {
            for (let i = 1; i <= 4; i++) {
                lines.push(`[0${i}/0${month}/2024 10:00:00] Alice: msg`);
                lines.push(`[0${i}/0${month}/2024 11:00:00] Bob: msg`);
            }
        }
        for (let month = 4; month <= 6; month++) {
            for (let i = 1; i <= 25; i++) {
                const d = String(i).padStart(2, '0');
                lines.push(`[${d}/0${month}/2024 10:00:00] Alice: msg`);
                lines.push(`[${d}/0${month}/2024 11:00:00] Bob: msg`);
            }
        }
        const s = compute(parse(lines.join('\n')));
        expect(s.chapters.length).toBeGreaterThanOrEqual(2);
        expect(s.chapters[0].intensity).toBe('low');
        expect(s.chapters[s.chapters.length - 1].intensity).toBe('high');
    });

    it('builds one profile per participant, ranked', () => {
        const text = [
            line(1, 22, 'Alice', 'bonsoir bonsoir bonsoir 😀'),
            line(1, 23, 'Bob', 'salut'),
            line(2, 22, 'Alice', 'bonsoir encore 😀'),
            line(2, 23, 'Bob', 'ok'),
            line(3, 22, 'Alice', 'bonsoir 😀'),
        ].join('\n');
        const s = compute(parse(text));
        expect(s.profiles.map(p => p.name)).toEqual(['Alice', 'Bob']);
        expect(s.profiles[0].topEmoji[0]).toBe('😀');
        expect(s.profiles[0].peakHour).toBe(22);
        expect(s.profiles[0].signatureWord[0]).toBe('bonsoir');
        expect(s.profiles[0].initiations).toBe(3);
    });
});
