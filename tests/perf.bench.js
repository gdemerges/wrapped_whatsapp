/**
 * Manual perf benchmark — run with: `node tests/perf.bench.js`
 * Not part of `npm test` (vitest) — pure timing harness.
 */

import { parse } from '../js/parser.js';
import { compute } from '../js/stats.js';

const NAMES = ['Alice', 'Bob', 'Charlie', 'Diane'];
const SAMPLE_MSGS = [
    'Salut ça va ?',
    'Trop bien merci 😊',
    'On se voit demain ?',
    'Oui à 14h chez moi',
    'Parfait je ramène le café ☕',
    'Tu as vu le match hier soir ?',
    'C\'était incroyable cette remontada',
    'image absente',
    'sticker omis',
    'https://example.com/un-article-tres-interessant',
    'lol',
    'mdrrrr',
    'Je suis en route, j\'arrive dans 20 min normalement',
    'Hâte de te voir ❤️',
];

function generate(n) {
    const lines = [];
    let dt = new Date(2024, 0, 1, 9, 0);
    for (let i = 0; i < n; i++) {
        dt = new Date(dt.getTime() + (1 + Math.random() * 30) * 60000);
        const dd = String(dt.getDate()).padStart(2, '0');
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const yyyy = dt.getFullYear();
        const hh = String(dt.getHours()).padStart(2, '0');
        const min = String(dt.getMinutes()).padStart(2, '0');
        const author = NAMES[i % NAMES.length];
        const msg = SAMPLE_MSGS[i % SAMPLE_MSGS.length];
        lines.push(`${dd}/${mm}/${yyyy} ${hh}:${min} - ${author}: ${msg}`);
    }
    return lines.join('\n');
}

function fmt(ms) { return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(2)}s`; }
function mb(bytes) { return `${(bytes / 1024 / 1024).toFixed(2)} MB`; }

const sizes = [10_000, 50_000, 250_000];
console.log('size      | text size | gen     | parse   | compute | parsed msgs');
console.log('----------|-----------|---------|---------|---------|------------');
for (const n of sizes) {
    let t = performance.now();
    const text = generate(n);
    const tGen = performance.now() - t;
    const bytes = new TextEncoder().encode(text).byteLength;

    t = performance.now();
    const messages = parse(text);
    const tParse = performance.now() - t;

    t = performance.now();
    compute(messages);
    const tCompute = performance.now() - t;

    console.log(
        `${String(n).padStart(8)}  | ${mb(bytes).padStart(9)} | ${fmt(tGen).padStart(7)} | ${fmt(tParse).padStart(7)} | ${fmt(tCompute).padStart(7)} | ${String(messages.length).padStart(10)}`,
    );
}
