/**
 * Weighted FR+EN sentiment lexicon with:
 *  - per-word polarity scores (not just +/-1)
 *  - negation handling (pas/ne/jamais/plus/aucun/rien/sans/not/no/never/none)
 *  - intensifiers (très, vraiment, trop, super → ×1.5) and diminishers (peu, barely → ×0.5)
 *  - emoji sentiment (❤️😂🥰 positive, 😡💔😭 negative)
 *
 * Still lexicon-based — good enough to catch "je suis pas content" and
 * "vraiment trop stylé" without shipping a 130 MB transformer.
 */

// ---------- Weighted lexicons ----------
// Values are polarity magnitudes: positive in POSITIVE, negative in NEGATIVE.
// Compliments and insults are *categorical* counters (used for sweetest/sharpest).

export const POSITIVE = {
    // FR — base
    merci: 2, super: 2, genial: 3, 'génial': 3, parfait: 3, top: 2,
    cool: 1.5, chouette: 2, sympa: 1.5, adorable: 2.5, magnifique: 3,
    incroyable: 3, excellent: 3, ouf: 2, 'stylé': 2, style: 1, joli: 1.5,
    beau: 1.5, belle: 1.5, content: 2, contente: 2, heureux: 2.5, heureuse: 2.5,
    ravi: 2, ravie: 2, bisous: 1.5, bisou: 1.5, coeur: 1.5, 'cœur': 1.5,
    adore: 2.5, 'adoré': 2.5, aime: 1.5, 'j\'aime': 2,
    bravo: 2.5, felicitations: 2.5, 'félicitations': 2.5, 'fier': 2, 'fière': 2,
    geniale: 3, 'géniale': 3, 'meilleur': 2, 'meilleure': 2, fantastique: 3,
    'énorme': 2, enorme: 2, magique: 2.5, extra: 2, 'délicieux': 2,
    agréable: 2, 'agreable': 2, satisfait: 1.5, satisfaite: 1.5,
    // FR — slang
    ptdr: 2, mdr: 1.5, lol: 1, 'wesh': 0.5, 'yes': 1.5, ouais: 0.5,
    // EN
    thanks: 2, thank: 2, awesome: 3, great: 2.5, amazing: 3, perfect: 3,
    nice: 1.5, happy: 2.5, glad: 2, wonderful: 3, lovely: 2.5,
    beautiful: 2.5, good: 1.5, best: 2, yay: 2, congrats: 2.5,
    congratulations: 2.5, love: 2.5, loved: 2.5, loves: 2, like: 1,
    liked: 1, brilliant: 3, fantastic: 3, cute: 2,
    sweet: 2, fun: 2, funny: 2, enjoy: 1.5, enjoyed: 1.5,
};

export const NEGATIVE = {
    // FR
    triste: 2, deprime: 2.5, 'déprime': 2.5, 'déprimé': 2.5, deprimee: 2.5,
    'fatigué': 1.5, fatigue: 1, 'fatiguée': 1.5, mal: 1.5, pire: 2,
    nul: 2, nulle: 2, 'dégoûté': 2.5, degoute: 2.5,
    'énervé': 2, enerve: 2, enervee: 2, fache: 2, 'fâche': 2, 'fâché': 2,
    facheuse: 1.5, 'colère': 2, colere: 2, degueulasse: 2.5, 'dégueulasse': 2.5,
    chiant: 2, chiante: 2, relou: 1.5, galère: 1.5, galere: 1.5,
    merde: 2, putain: 1, ptn: 1, 'déçu': 2.5, decu: 2.5, 'déçue': 2.5,
    deception: 2, 'déception': 2, peur: 1.5, angoisse: 2, stress: 1.5, 'stressé': 1.5,
    pleurer: 2, pleure: 1.5, moche: 2, catastrophe: 3,
    ennui: 1.5, ennuyeux: 2, ennuyeuse: 2, bof: 1,
    // EN
    sad: 2, tired: 1.5, angry: 2.5, mad: 2, bad: 1.5, worst: 3,
    terrible: 3, awful: 3, sick: 1.5, hate: 3, hated: 3, hates: 2,
    annoying: 2, annoyed: 2, disappointed: 2.5, upset: 2, cry: 1.5,
    crying: 2, ugly: 2, boring: 2, bored: 1.5, horrible: 3, gross: 2,
    suck: 2, sucks: 2, worse: 2, fail: 1.5, failed: 1.5,
};

// ---------- Compliments & insults (categorical counters) ----------
export const COMPLIMENT = new Set([
    'merci', 'bravo', 'felicitations', 'félicitations', 'respect', 'champion', 'championne',
    'genius', 'génie', 'talented', 'talentueux', 'talentueuse', 'fort', 'forte', 'puissant',
    'puissante', 'intelligent', 'intelligente', 'doué', 'douée', 'incroyable',
    'thanks', 'thank', 'proud', 'fier', 'fière', 'grateful', 'awesome',
    'magnifique', 'adorable', 'parfait', 'parfaite',
]);

export const INSULT = new Set([
    'con', 'conne', 'connard', 'connasse', 'debile', 'débile', 'idiot', 'idiote',
    'bête', 'bete', 'nul', 'nulle', 'moche', 'relou', 'chiant', 'chiante',
    'merde', 'putain', 'ptn', 'salope', 'batard', 'bâtard', 'enculé', 'enculee',
    'stupid', 'idiot', 'dumb', 'ugly', 'shit', 'fuck', 'fucking', 'asshole',
    'bitch', 'damn', 'crap',
]);

// ---------- Modifiers ----------
const NEGATIONS = new Set([
    'pas', 'ne', 'n', 'jamais', 'plus', 'aucun', 'aucune', 'rien', 'sans',
    'ni', 'nul', 'non',
    'not', 'no', 'never', 'nothing', 'none', 'neither', 'nor', 'without',
]);

const INTENSIFIERS = new Map([
    // FR
    ['très', 1.5], ['tres', 1.5], ['vraiment', 1.5], ['trop', 1.5],
    ['tellement', 1.6], ['super', 1.4], ['hyper', 1.6], ['grave', 1.4],
    ['extrêmement', 1.8], ['extremement', 1.8], ['tout', 1.2], ['complètement', 1.5],
    ['completement', 1.5], ['totalement', 1.5], ['absolument', 1.6], ['carrément', 1.4],
    ['carrement', 1.4],
    // EN
    ['so', 1.4], ['really', 1.5], ['very', 1.5], ['extremely', 1.8],
    ['totally', 1.5], ['absolutely', 1.6], ['completely', 1.5], ['super', 1.4],
    ['insanely', 1.8], ['damn', 1.3],
]);

const DIMINISHERS = new Map([
    ['peu', 0.5], ['légèrement', 0.5], ['legerement', 0.5], ['plutôt', 0.7],
    ['plutot', 0.7], ['assez', 0.8],
    ['slightly', 0.5], ['barely', 0.4], ['kinda', 0.6], ['somewhat', 0.7],
    ['a', 0.9], // weak, ignored if no "bit" context
]);

// ---------- Emoji sentiment ----------
// Grapheme-level match so ❤️ with FE0F works.
const EMOJI_POS = new Map([
    ['❤', 2.5], ['❤️', 2.5], ['💖', 2.5], ['💗', 2.5], ['💓', 2], ['💕', 2], ['💝', 2], ['💞', 2],
    ['😍', 2.5], ['🥰', 2.5], ['😘', 2], ['😻', 2], ['😁', 1.5], ['😀', 1.5], ['😊', 2],
    ['😂', 2], ['🤣', 2], ['😃', 1.5], ['😄', 1.5], ['😆', 1.5], ['🥳', 2], ['🎉', 2],
    ['👍', 1.5], ['👏', 1.5], ['🙌', 1.5], ['💪', 1.5], ['🔥', 1.5], ['✨', 1], ['⭐', 1],
    ['🌟', 1.5], ['💯', 2], ['😇', 1.5], ['🤗', 1.5], ['☺', 1.5], ['☺️', 1.5], ['🙂', 1],
]);

const EMOJI_NEG = new Map([
    ['💔', 2.5], ['😢', 2], ['😭', 2.5], ['😞', 2], ['😔', 2], ['😟', 1.5], ['😩', 2],
    ['😫', 2], ['😤', 2], ['😠', 2.5], ['😡', 3], ['🤬', 3], ['👿', 2.5], ['😒', 1.5],
    ['🙄', 1.5], ['😑', 1], ['😕', 1.5], ['☹', 1.5], ['☹️', 1.5], ['🙁', 1.5],
    ['😣', 1.5], ['😖', 2], ['😨', 2], ['😰', 2], ['😱', 2], ['💀', 1.5], ['☠', 1.5],
    ['👎', 2], ['🤢', 2], ['🤮', 2.5],
]);

const EMOJI_RE = /\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*/gu;
const WORD_RE = /[a-zàâäéèêëïîôùûüÿçœæ']+/gi;
const NEG_WINDOW = 3; // words within which a negation flips the polarity

/**
 * Tokenize a message into ordered {type, value} tokens — words and emojis only.
 * Punctuation is dropped.
 */
function tokenize(text) {
    const lower = text.toLowerCase();
    const tokens = [];
    const matches = [];
    let m;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(lower)) !== null) {
        matches.push({ i: m.index, type: 'word', value: m[0] });
    }
    EMOJI_RE.lastIndex = 0;
    while ((m = EMOJI_RE.exec(text)) !== null) {
        matches.push({ i: m.index, type: 'emoji', value: m[0] });
    }
    matches.sort((a, b) => a.i - b.i);
    for (const t of matches) tokens.push({ type: t.type, value: t.value });
    return tokens;
}

/**
 * Score a single message. Returns {pos, neg, compliment, insult, words}.
 */
function scoreMessage(text) {
    const tokens = tokenize(text);
    const out = { pos: 0, neg: 0, compliment: 0, insult: 0, words: 0 };

    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];

        if (tok.type === 'word') {
            out.words++;

            // Count compliments/insults regardless of negation (still meaningful signal)
            if (COMPLIMENT.has(tok.value)) out.compliment++;
            if (INSULT.has(tok.value)) out.insult++;

            const posW = POSITIVE[tok.value];
            const negW = NEGATIVE[tok.value];
            if (!posW && !negW) continue;

            // Look back a small window for negation/intensifier/diminisher
            let multiplier = 1;
            let negated = false;
            for (let j = Math.max(0, i - NEG_WINDOW); j < i; j++) {
                const prev = tokens[j];
                if (prev.type !== 'word') continue;
                if (NEGATIONS.has(prev.value)) negated = !negated;
                if (INTENSIFIERS.has(prev.value)) multiplier *= INTENSIFIERS.get(prev.value);
                if (DIMINISHERS.has(prev.value)) multiplier *= DIMINISHERS.get(prev.value);
            }

            if (posW) {
                const score = posW * multiplier;
                if (negated) out.neg += score;
                else out.pos += score;
            } else if (negW) {
                const score = negW * multiplier;
                if (negated) out.pos += score * 0.6; // "pas mal" = mildly positive
                else out.neg += score;
            }
        } else {
            // Emoji — no negation context (rare and noisy to mix)
            const p = EMOJI_POS.get(tok.value);
            const n = EMOJI_NEG.get(tok.value);
            if (p) out.pos += p;
            if (n) out.neg += n;
        }
    }
    return out;
}

/**
 * Aggregate sentiment across all messages per author.
 */
export function computeSentiment(messages) {
    const perPerson = {};
    for (const m of messages) {
        if (m.isMedia || m.isReaction) continue;
        if (!m.message) continue;
        const s = scoreMessage(m.message);
        if (s.words === 0 && s.pos === 0 && s.neg === 0) continue;
        const p = perPerson[m.author] ||= { pos: 0, neg: 0, compliment: 0, insult: 0, words: 0 };
        p.pos += s.pos;
        p.neg += s.neg;
        p.compliment += s.compliment;
        p.insult += s.insult;
        p.words += s.words;
    }

    const entries = Object.entries(perPerson).map(([author, d]) => {
        const rate = d.words > 0 ? (d.pos - d.neg) / d.words : 0;
        return {
            author,
            pos: Math.round(d.pos * 10) / 10,
            neg: Math.round(d.neg * 10) / 10,
            compliment: d.compliment,
            insult: d.insult,
            words: d.words,
            rate,
        };
    });

    return {
        perPerson: entries,
        sweetest: [...entries].sort((a, b) => b.compliment - a.compliment)[0] || null,
        sharpest: [...entries].sort((a, b) => b.insult - a.insult)[0] || null,
        mostPositive: [...entries].sort((a, b) => b.rate - a.rate)[0] || null,
        mostNegative: [...entries].sort((a, b) => a.rate - b.rate)[0] || null,
    };
}
