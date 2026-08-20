/**
 * The worker's reading pipeline, reproduced.
 *
 * `worker.js` reads the blob as bytes and decodes them itself, so it can
 * report progress against the file size the user sees. That means chunk
 * boundaries land in the middle of multi-byte characters — an emoji is four
 * bytes, and half of one silently becomes U+FFFD if the decoder is not told
 * the stream is still going. Nothing else in the test suite would notice: the
 * stats would simply come out slightly wrong.
 */
import { describe, it, expect } from 'vitest';
import { createStreamParser } from '../js/parser.js';
import { createHasher, hashText } from '../js/cache.js';
import { compute } from '../js/stats.js';

/** The decoding loop of `worker.js`, over a fixed byte-chunk size. */
async function readAsWorkerDoes(blob, chunkBytes) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const decoder = new TextDecoder('utf-8');
    const parser = createStreamParser();
    const hasher = createHasher();
    let read = 0;
    const progress = [];

    for (let i = 0; i < bytes.length; i += chunkBytes) {
        const slice = bytes.subarray(i, i + chunkBytes);
        read += slice.byteLength;
        const chunk = decoder.decode(slice, { stream: true });
        if (chunk) { hasher.push(chunk); parser.push(chunk); }
        progress.push(Math.min(99, Math.round((read / bytes.length) * 100)));
    }
    const rest = decoder.decode();
    if (rest) { hasher.push(rest); parser.push(rest); }

    return { messages: parser.end(), hash: await hasher.digest(), progress };
}

const text = [
    '[15/03/2024 10:00:00] Alice: bonjour 😂😂 ça va ?',
    '[15/03/2024 10:01:00] Bob: très bien 👨‍👩‍👧 et toi ?',
    '[15/03/2024 10:02:00] Alice: nickel — à tout à l’heure',
    '[15/03/2024 10:03:00] Bob: image omitted',
    '[15/03/2024 10:04:00] Alice: a réagi ❤️ à ce message',
    '[16/03/2024 09:00:00] Bob: on se voit demain',
].join('\n');

const blob = new Blob([text], { type: 'text/plain' });

describe('the worker reading pipeline', () => {
    // 1 byte is the pathological case: every multi-byte character is split.
    it.each([1, 2, 3, 7, 64, 4096])('decodes correctly at %i-byte chunks', async (size) => {
        const { messages } = await readAsWorkerDoes(blob, size);
        expect(messages).toHaveLength(6);
        expect(messages[0].message).toBe('bonjour 😂😂 ça va ?');
        expect(messages[1].message).toBe('très bien 👨‍👩‍👧 et toi ?');
        expect(messages[2].message).toContain('à tout à l’heure');
        expect(messages.join('')).not.toContain('�');   // no mangled character
    });

    it('keeps a family emoji whole rather than splitting it into three people', async () => {
        const { messages } = await readAsWorkerDoes(blob, 3);
        expect(messages[1].message).toContain('👨‍👩‍👧');
    });

    it('classifies media and reactions the same however it was chunked', async () => {
        for (const size of [1, 5, 4096]) {
            const { messages } = await readAsWorkerDoes(blob, size);
            expect(messages.filter(m => m.isMedia)).toHaveLength(1);
            expect(messages.filter(m => m.isReaction)).toHaveLength(1);
            expect(messages.find(m => m.isReaction).reactionEmoji).toBe('❤️');
        }
    });

    it('fingerprints the file identically however it was chunked', async () => {
        const expected = await hashText(text);
        for (const size of [1, 9, 4096]) {
            expect((await readAsWorkerDoes(blob, size)).hash).toBe(expected);
        }
    });

    it('reports progress that only ever climbs, and stops short of 100', async () => {
        const { progress } = await readAsWorkerDoes(blob, 16);
        expect(progress.length).toBeGreaterThan(1);
        expect(progress).toEqual([...progress].sort((a, b) => a - b));
        expect(Math.max(...progress)).toBeLessThanOrEqual(99);
        expect(Math.min(...progress)).toBeGreaterThanOrEqual(0);
    });

    it('feeds stats that match a whole-file parse', async () => {
        const streamed = compute((await readAsWorkerDoes(blob, 3)).messages);
        const wholeFile = compute((await readAsWorkerDoes(blob, 1e9)).messages);
        expect(streamed.totalMessages).toBe(wholeFile.totalMessages);
        expect(streamed.totalChars).toBe(wholeFile.totalChars);
        expect(streamed.emojis.total).toBe(wholeFile.emojis.total);
        expect(streamed.ranking).toEqual(wholeFile.ranking);
    });
});
