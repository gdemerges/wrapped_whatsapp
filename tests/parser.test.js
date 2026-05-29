import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse, detectPattern, parseDate, cleanLine } from '../js/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

describe('parser', () => {
    it('parses iOS FR format', () => {
        const messages = parse(fixture('ios_fr.txt'));
        expect(messages.length).toBeGreaterThan(8);
        expect(messages[0].author).toBe('Alice');
        expect(messages[0].message).toContain('Bonjour');
    });

    it('parses Android FR format', () => {
        const messages = parse(fixture('android_fr.txt'));
        expect(messages.length).toBe(4);
        expect(messages[0].author).toBe('Alice');
        expect(messages[2].author).toBe('Alice');
    });

    it('filters by year', () => {
        const text = `[01/01/2023 10:00:00] Alice: Old message
[01/01/2024 10:00:00] Alice: New message
[02/01/2024 10:00:00] Bob: Reply`;
        const msgs2024 = parse(text, { year: 2024 });
        expect(msgs2024.length).toBe(2);
        const msgs2023 = parse(text, { year: 2023 });
        expect(msgs2023.length).toBe(1);
    });

    it('marks media messages', () => {
        const messages = parse(fixture('ios_fr.txt'));
        const media = messages.filter(m => m.isMedia);
        expect(media.length).toBeGreaterThan(0);
    });

    it('detects reactions', () => {
        const messages = parse(fixture('ios_fr.txt'));
        const reactions = messages.filter(m => m.isReaction);
        expect(reactions.length).toBe(1);
        expect(reactions[0].reactionEmoji).toBe('❤️');
    });

    it('rejects non-WhatsApp text', () => {
        expect(() => parse('just some random text\nwith no structure')).toThrow(/Format/);
    });

    it('parses Android US format (M/D/YY, h:mm AM/PM)', () => {
        const messages = parse(fixture('android_us.txt'));
        expect(messages.length).toBe(4);
        expect(messages[0].author).toBe('Alice');
        const d = messages[0].datetime;
        expect(d.getFullYear()).toBe(2024);
        expect(d.getMonth()).toBe(2); // March
        expect(d.getDate()).toBe(15);
        expect(d.getHours()).toBe(14); // 2:30 PM
        expect(messages[2].datetime.getHours()).toBe(23); // 11:45 PM
        expect(messages[3].datetime.getHours()).toBe(7);  // 7:15 AM
    });

    it('throws instead of silently dropping when no date can be parsed', () => {
        // MM/DD/YYYY dates whose day>12 are invalid under the detected DD/MM format.
        // Previously these were silently filtered out, returning an empty result.
        const text = [
            '[03/25/2024 10:00:00] Alice: one',
            '[03/26/2024 10:01:00] Bob: two',
            '[03/27/2024 10:02:00] Alice: three',
            '[03/28/2024 10:03:00] Bob: four',
        ].join('\n');
        expect(() => parse(text)).toThrow(/date/i);
    });

    it('handles Left-To-Right marks in iOS exports', () => {
        const line = '\u200e[12/03/2024 14:30:00] Alice: \u200emessage';
        expect(cleanLine(line)).toBe('[12/03/2024 14:30:00] Alice: \u200emessage');
    });

    it('parseDate handles DD/MM/YYYY', () => {
        const d = parseDate('15/03/2024', '10:30:00');
        expect(d.getFullYear()).toBe(2024);
        expect(d.getMonth()).toBe(2); // March
        expect(d.getDate()).toBe(15);
    });

    it('parseDate handles US M/D/YY with AM/PM', () => {
        const d = parseDate('3/15/24', '2:30 PM');
        expect(d.getFullYear()).toBe(2024);
        expect(d.getHours()).toBe(14);
    });

    it('detectPattern returns null for unrecognized format', () => {
        const lines = ['hello', 'world', 'foo bar'];
        expect(detectPattern(lines)).toBeNull();
    });
});
