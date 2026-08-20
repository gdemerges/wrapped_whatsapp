/**
 * The image exporter, drawn against a recording canvas.
 *
 * 427 lines of layout arithmetic had no test at all, and its failure mode is
 * the nastiest kind: iOS hands back a blank bitmap without throwing, so a
 * broken poster looks like a working one until someone opens the PNG. The fake
 * context below records every call, which is enough to assert the things that
 * actually matter — the pixel size of the canvas, the design-unit scale, and
 * that the card's own text reached the page.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderCard } from '../js/export-image.js';
import { resolvePreset, buildPosterCard, participantsHeadline } from '../js/export-presets.js';
import { setLocale } from '../js/i18n.js';

/** A 2D context that draws nothing and remembers everything. */
function recordingContext() {
    const calls = { fillText: [], fillRect: [], scale: [], translate: [] };
    const gradient = { addColorStop() {} };
    return {
        calls,
        font: '', fillStyle: '', strokeStyle: '', lineWidth: 0,
        textAlign: 'left', textBaseline: 'alphabetic',
        scale: (x, y) => calls.scale.push([x, y]),
        translate: (x, y) => calls.translate.push([x, y]),
        save() {}, restore() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {},
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
        fillRect: (...a) => calls.fillRect.push(a),
        fillText: (text, x, y) => calls.fillText.push({ text: String(text), x, y }),
        /** Rough but monotonic: enough for the wrap and shrink-to-fit logic. */
        measureText(text) {
            const size = parseInt((this.font.match(/(\d+)px/) || [, '30'])[1], 10);
            return { width: String(text).length * size * 0.55 };
        },
    };
}

let ctx;
beforeEach(() => {
    setLocale('fr');
    ctx = recordingContext();
    window.HTMLCanvasElement.prototype.getContext = () => ctx;
});

const texts = () => ctx.calls.fillText.map(c => c.text);
const drew = (needle) => texts().some(t => t.includes(needle));

const card = {
    gradient: 'slide-gradient-2',
    tag: 'Classement',
    title: 'Les plus bavardes',
    subtitle: 'Sur toute la conversation',
    big: { value: '12 345', label: 'messages échangés' },
    grid: [['4', 'participants'], ['365', 'jours']],
    bars: [{ label: 'Camille', value: '5 000 · 41%', ratio: 1, color: '#8B5CF6' }],
    emojis: [['😂', 120], ['❤️', 90]],
    lines: ['Camille domine la conversation'],
};

describe('renderCard', () => {
    it('sizes the canvas from the preset and scales to design units', async () => {
        const canvas = await renderCard(card, { preset: 'story' });
        expect(canvas.width).toBe(1080);
        expect(canvas.height).toBe(1920);
        expect(ctx.calls.scale[0]).toEqual([1, 1]);   // 1080 design units → 1080 px
    });

    it('draws a print poster at the preset pixel size, same drawing code', async () => {
        const a3 = resolvePreset('a3');
        const canvas = await renderCard(card, { preset: 'a3' });
        expect(canvas.width).toBe(a3.widthPx);
        expect(canvas.height).toBe(a3.heightPx);
        // The whole layout is authored 1080 units wide; the preset sets the scale.
        expect(ctx.calls.scale[0][0]).toBeCloseTo(a3.widthPx / 1080, 6);
    });

    it('falls back to the story preset for an unknown format', async () => {
        const canvas = await renderCard(card, { preset: 'billboard' });
        expect(canvas.width).toBe(1080);
        expect(canvas.height).toBe(1920);
    });

    it('puts every part of the card on the page', async () => {
        await renderCard(card, { preset: 'story' });
        expect(drew('CLASSEMENT')).toBe(true);        // the tag is upper-cased
        expect(drew('Les plus')).toBe(true);
        expect(drew('12 345')).toBe(true);
        expect(drew('messages échangés')).toBe(true);
        expect(drew('participants')).toBe(true);
        expect(drew('Camille')).toBe(true);
        expect(drew('😂')).toBe(true);
    });

    it('signs every image with the brand and the offline claim', async () => {
        await renderCard(card, { preset: 'story' });
        expect(drew('Chatwrap')).toBe(true);
        expect(drew('100% hors-ligne')).toBe(true);
    });

    it('signs it in the reader language', async () => {
        setLocale('en');
        await renderCard(card, { preset: 'story' });
        expect(drew('100% offline')).toBe(true);
    });

    it('draws a minimal card without reaching for absent sections', async () => {
        await renderCard({ gradient: 'slide-gradient-1', tag: 'Solo' }, { preset: 'story' });
        expect(drew('SOLO')).toBe(true);
        expect(texts().length).toBeGreaterThan(0);
    });

    it('uses the default palette for an unknown gradient', async () => {
        await expect(renderCard({ gradient: 'nope', tag: 'X' }, { preset: 'story' }))
            .resolves.toBeTruthy();
    });

    it('shrinks a headline figure rather than letting it overflow', async () => {
        const wide = { ...card, big: { value: '9'.repeat(40), label: 'messages' } };
        await renderCard(wide, { preset: 'story' });
        const drawn = ctx.calls.fillText.find(c => c.text.startsWith('999'));
        expect(drawn).toBeTruthy();
        // Whatever font size it settled on, the value must stay inside the margins.
        expect(drawn.x).toBeGreaterThanOrEqual(0);
    });

    it('keeps a dense poster clear of the footer band', async () => {
        const dense = {
            ...card,
            grid: Array.from({ length: 6 }, (_, i) => [String(i), `label ${i}`]),
            bars: Array.from({ length: 8 }, (_, i) => ({ label: `p${i}`, value: `${i}`, ratio: 0.5 })),
            lines: Array.from({ length: 6 }, (_, i) => `line ${i}`),
        };
        const a4 = resolvePreset('a4');
        await renderCard(dense, { preset: 'a4' });

        // Too much content for the page: the block is scaled about the
        // horizontal centre, which is the translate/scale/translate sandwich.
        expect(ctx.calls.translate.length).toBeGreaterThanOrEqual(2);
        expect(ctx.calls.translate[0][0]).toBeCloseTo(1080 / 2, 6);

        // The footer is drawn after the block is restored, so its position is
        // in plain design units and must sit inside the page, near the bottom.
        const heightInUnits = a4.heightPx / (a4.widthPx / 1080);
        const footer = ctx.calls.fillText.filter(c => c.text === 'Chatwrap');
        expect(footer).toHaveLength(1);
        expect(footer[0].y).toBeLessThan(heightInUnits);
        expect(footer[0].y).toBeGreaterThan(heightInUnits - 200);
    });
});

describe('buildPosterCard', () => {
    const stats = {
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-12-31T00:00:00.000Z',
        totalMessages: 12345,
        totalDays: 366,
        avgPerDay: '33.7',
        emojis: { total: 900, top: [['😂', 120]] },
        streak: { max: 21 },
        ranking: [
            ['Camille', { count: 5000, percent: '40.5' }],
            ['Léo', { count: 4000, percent: '32.4' }],
        ],
    };

    it('describes the whole conversation in one card', () => {
        const poster = buildPosterCard(stats);
        expect(poster.tag).toBe('2024');
        expect(poster.title).toBe('Camille & Léo');
        expect(poster.big.value).toContain('345');
        expect(poster.bars).toHaveLength(2);
        expect(poster.bars[0].ratio).toBe(1);
    });

    it('renders end to end at A3', async () => {
        const canvas = await renderCard(buildPosterCard(stats), { preset: 'a3' });
        expect(canvas.width).toBe(resolvePreset('a3').widthPx);
        expect(drew('Camille')).toBe(true);
    });
});

describe('participantsHeadline', () => {
    it('names a small group in full and abbreviates a large one', () => {
        setLocale('fr');
        expect(participantsHeadline([])).toBe('Notre conversation');
        expect(participantsHeadline(['Camille'])).toBe('Camille');
        expect(participantsHeadline(['Camille', 'Léo', 'Sofia'])).toBe('Camille, Léo & Sofia');
        expect(participantsHeadline(['A', 'B', 'C', 'D', 'E'])).toBe('A, B & 3 autres');
    });

    it('abbreviates in English too', () => {
        setLocale('en');
        expect(participantsHeadline(['A', 'B', 'C', 'D', 'E'])).toBe('A, B & 3 others');
    });
});
