import { describe, it, expect } from 'vitest';
import {
    PRESETS, MAX_CANVAS_PIXELS, resolvePreset,
    participantsHeadline, periodLabel, buildPosterCard,
} from '../js/export-presets.js';
import { parse } from '../js/parser.js';
import { compute } from '../js/stats.js';

describe('resolvePreset', () => {
    it('passes screen presets through untouched', () => {
        const p = resolvePreset('story');
        expect(p).toMatchObject({ id: 'story', widthPx: 1080, heightPx: 1920, dpi: null, downscaled: false });
    });

    it('converts millimetres and DPI into pixels', () => {
        const p = resolvePreset('a4');
        // 210 mm at 300 dpi = 8.268 in = 2480 px
        expect(p.widthPx).toBe(2480);
        expect(p.heightPx).toBe(3508);
        expect(p.dpi).toBe(300);
        expect(p.downscaled).toBe(false);
    });

    it('keeps every shipped print preset within the canvas budget', () => {
        for (const id of Object.keys(PRESETS)) {
            const p = resolvePreset(id);
            expect(p.widthPx * p.heightPx).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
        }
    });

    it('steps the DPI down rather than exceeding a tighter budget', () => {
        const budget = 4_000_000;
        const p = resolvePreset('a4', budget);
        expect(p.downscaled).toBe(true);
        expect(p.dpi).toBeLessThan(300);
        expect(p.widthPx * p.heightPx).toBeLessThanOrEqual(budget);
    });

    it('falls back to the story preset for an unknown id', () => {
        expect(resolvePreset('nope').id).toBe('story');
    });
});

describe('poster labels', () => {
    it('lists participants, then summarises past three', () => {
        expect(participantsHeadline([])).toBe('Notre conversation');
        expect(participantsHeadline(['Alice'])).toBe('Alice');
        expect(participantsHeadline(['Alice', 'Bob'])).toBe('Alice & Bob');
        expect(participantsHeadline(['Alice', 'Bob', 'Carol'])).toBe('Alice, Bob & Carol');
        expect(participantsHeadline(['A', 'B', 'C', 'D', 'E'])).toBe('A, B & 3 autres');
    });

    it('collapses a single-year period to one year', () => {
        expect(periodLabel('2024-01-01', '2024-12-31')).toBe('2024');
        expect(periodLabel('2024-01-01', '2025-02-28')).toBe('2024 – 2025');
    });
});

describe('buildPosterCard', () => {
    const chat = [];
    for (let d = 1; d <= 9; d++) {
        chat.push(`[0${d}/03/2024 10:00:00] Alice: coucou 😀`);
        chat.push(`[0${d}/03/2024 11:00:00] Bob: salut`);
    }
    const stats = compute(parse(chat.join('\n')));
    const card = buildPosterCard(stats);

    it('leads with the participants and the headline figure', () => {
        expect(card.title).toBe('Alice & Bob');
        expect(card.tag).toBe('2024');
        expect(card.big.value).toBe('18');
    });

    it('ranks participants as bars normalised to the leader', () => {
        expect(card.bars).toHaveLength(2);
        expect(card.bars[0].ratio).toBe(1);
        expect(card.bars.every(b => b.color)).toBe(true);
    });

    it('stays within what the renderer will draw', () => {
        expect(card.grid.length).toBeLessThanOrEqual(6);
        expect(card.bars.length).toBeLessThanOrEqual(8);
        expect(card.emojis.length).toBeLessThanOrEqual(10);
    });
});
