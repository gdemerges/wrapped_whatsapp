import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse } from '../js/parser.js';
import { compute } from '../js/stats.js';
import { serializeStats, rehydrateDates, sanitizeShared } from '../js/payload.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('payload privacy', () => {
    const messages = parse(fixture('ios_fr.txt'));
    const stats = compute(messages);

    it('never serializes raw message bodies', () => {
        const json = JSON.stringify(serializeStats(stats));
        // Distinctive substrings from the fixture's message bodies must not leak.
        expect(json).not.toContain('aide hier');
        expect(json).not.toContain('regardez ce lien');
    });

    it('serializeStats does not mutate the original stats object', () => {
        const before = stats.startDate;
        serializeStats(stats);
        expect(stats.startDate).toBe(before);
        expect(stats.startDate).toBeInstanceOf(Date);
    });
});

describe('sanitizeShared', () => {
    it('strips markup from strings, including nested values and keys', () => {
        const dirty = {
            avgPerDay: '<img src=x onerror=alert(1)>',
            streak: { max: '12"><b>pwn</b>' },
            perPerson: { '<i>Eve</i>': { count: 3 } },
            ranking: [['Alice', { percent: '<script>1</script>' }]],
        };
        const clean = sanitizeShared(dirty);
        const json = JSON.stringify(clean);
        expect(json).not.toContain('<');
        expect(json).not.toContain('>');
        expect(json).not.toContain('\\"><');
        expect(clean.perPerson['iEve/i'].count).toBe(3);
    });

    it('leaves numbers, booleans and null untouched', () => {
        const input = { a: 42, b: true, c: null, d: [1, 2.5], e: 'Léo & Zoé' };
        expect(sanitizeShared(input)).toEqual(input);
    });
});

describe('payload date round-trip', () => {
    const messages = parse(fixture('ios_fr.txt'));
    const stats = compute(messages);

    it('round-trips dates through serialize → rehydrate', () => {
        const restored = rehydrateDates(serializeStats(stats));
        expect(restored.startDate).toBeInstanceOf(Date);
        expect(restored.endDate).toBeInstanceOf(Date);
        expect(restored.startDate.getTime()).toBe(stats.startDate.getTime());
        expect(restored.endDate.getTime()).toBe(stats.endDate.getTime());
    });

    it('round-trips firstMessage datetime', () => {
        const restored = rehydrateDates(serializeStats(stats));
        if (stats.firstMessage?.datetime) {
            expect(restored.firstMessage.datetime).toBeInstanceOf(Date);
            expect(restored.firstMessage.datetime.getTime())
                .toBe(stats.firstMessage.datetime.getTime());
        }
    });
});
