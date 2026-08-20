/**
 * The streaming hasher has to agree with the one-shot one, byte for byte:
 * they produce the cache key, and a mismatch would silently recompute every
 * export instead of serving it from IndexedDB.
 */
import { describe, it, expect } from 'vitest';
import { hashText, createHasher } from '../js/cache.js';

/** Feed `text` to a fresh hasher in `size`-character slices. */
async function streamed(text, size) {
    const h = createHasher();
    for (let i = 0; i < text.length; i += size) h.push(text.slice(i, i + size));
    return h.digest();
}

const small = 'bonjour tout le monde';
// Comfortably over the 1 MB threshold where the hasher switches to head/tail.
const large = 'x'.repeat(600_000) + 'MIDDLE' + 'y'.repeat(600_000);

describe('createHasher', () => {
    it('matches hashText on a small input, whatever the chunking', async () => {
        const expected = await hashText(small);
        for (const size of [1, 5, 1000]) {
            expect(await streamed(small, size)).toBe(expected);
        }
    });

    it('matches hashText once the input is sampled rather than hashed whole', async () => {
        const expected = await hashText(large);
        for (const size of [64 * 1024, 999, 1_500_000]) {
            expect(await streamed(large, size)).toBe(expected);
        }
    });

    it('separates two large files that differ only at the very end', async () => {
        const a = await streamed(large + 'A', 64 * 1024);
        const b = await streamed(large + 'B', 64 * 1024);
        expect(a).not.toBe(b);
    });

    it('separates two large files of the same length that differ at the start', async () => {
        const a = await streamed('A' + large, 64 * 1024);
        const b = await streamed('B' + large, 64 * 1024);
        expect(a).not.toBe(b);
    });

    it('hashes the empty input without complaint', async () => {
        expect(await streamed('', 10)).toBe(await hashText(''));
    });

    it('produces a 40-character SHA-1 hex digest', async () => {
        expect(await streamed(small, 3)).toMatch(/^[0-9a-f]{40}$/);
    });
});
