/**
 * The URL fragment carries two very different things — a slide index and a
 * compressed stats payload — and the payload uses an alphabet that includes
 * `+`, so it cannot survive URLSearchParams. That is why the fragment is
 * parsed by hand, and why the hand-rolled parser is worth pinning down.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readHash, writeSlide, clearHash } from '../js/ui/hash.js';

beforeEach(() => { window.location.hash = ''; });

describe('readHash', () => {
    it('reads an empty fragment as nothing at all', () => {
        expect(readHash()).toEqual({ share: null, slide: null });
    });

    it('reads a slide index', () => {
        window.location.hash = '#slide=7';
        expect(readHash()).toEqual({ share: null, slide: 7 });
    });

    it('takes the share payload verbatim to the end of the fragment', () => {
        // `+`, `$` and `=` are all in LZ-String's URI-safe alphabet.
        const payload = 'N4Ig+xyz$abc=';
        window.location.hash = `#share=${payload}`;
        expect(readHash().share).toBe(payload);
    });

    it('reads both, with the payload kept last and intact', () => {
        const payload = 'N4Ig+slide=9';   // a payload that looks like another key
        window.location.hash = `#slide=3&share=${payload}`;
        expect(readHash()).toEqual({ share: payload, slide: 3 });
    });

    it('ignores a slide index that is not a number', () => {
        window.location.hash = '#slide=abc';
        expect(readHash().slide).toBeNull();
    });

    it('reads the demo shortcut as neither', () => {
        window.location.hash = '#demo';
        expect(readHash()).toEqual({ share: null, slide: null });
    });
});

describe('writeSlide', () => {
    it('records a slide, and drops the key again at the first one', () => {
        writeSlide(4);
        expect(window.location.hash).toBe('#slide=4');
        writeSlide(0);
        expect(window.location.hash).toBe('');
    });

    it('preserves the share payload while the slide moves', () => {
        const payload = 'N4Ig+xyz';
        window.location.hash = `#share=${payload}`;
        writeSlide(2);
        expect(window.location.hash).toBe(`#slide=2&share=${payload}`);
        expect(readHash()).toEqual({ share: payload, slide: 2 });
        writeSlide(0);
        expect(readHash()).toEqual({ share: payload, slide: null });
    });

    it('replaces rather than pushes, so a swipe is not a history entry', () => {
        const before = window.history.length;
        writeSlide(1);
        writeSlide(2);
        writeSlide(3);
        expect(window.history.length).toBe(before);
    });
});

describe('clearHash', () => {
    it('removes everything, payload included', () => {
        window.location.hash = '#slide=2&share=N4Ig+xyz';
        clearHash();
        expect(window.location.hash).toBe('');
        expect(readHash()).toEqual({ share: null, slide: null });
    });
});
