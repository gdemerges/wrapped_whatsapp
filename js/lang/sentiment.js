/**
 * Small hand-rolled FR+EN lexicon for tone detection.
 * Not research-grade — just enough to surface "who's the sweet one / who roasts".
 */

export const POSITIVE = new Set([
    // FR
    'merci', 'bravo', 'super', 'genial', 'génial', 'parfait', 'top',
    'cool', 'chouette', 'sympa', 'adorable', 'magnifique', 'incroyable',
    'excellent', 'trop', 'ouf', 'stylé', 'style', 'joli', 'beau', 'belle',
    'content', 'contente', 'heureux', 'heureuse', 'ravi', 'ravie',
    'bisous', 'bisou', 'coeur', 'cœur', 'love',
    // EN
    'thanks', 'thank', 'awesome', 'great', 'amazing', 'perfect', 'nice',
    'cool', 'happy', 'glad', 'wonderful', 'lovely', 'beautiful', 'good',
    'best', 'yay', 'congrats', 'congratulations',
]);

export const COMPLIMENT = new Set([
    'merci', 'bravo', 'felicitations', 'félicitations', 'respect', 'champion', 'championne',
    'genius', 'génie', 'talented', 'talentueux', 'talentueuse', 'fort', 'forte', 'puissant',
    'puissante', 'beau', 'belle', 'intelligent', 'intelligente', 'doué', 'douée',
    'thanks', 'thank', 'proud', 'fier', 'fière', 'grateful',
]);

export const INSULT = new Set([
    // Mild to strong FR (kept short — this is a public repo)
    'con', 'conne', 'connard', 'connasse', 'debile', 'débile', 'idiot', 'idiote',
    'bête', 'bete', 'nul', 'nulle', 'moche', 'relou', 'chiant', 'chiante',
    'merde', 'putain', 'ptn', 'salope', 'batard', 'bâtard', 'enculé', 'enculee',
    // EN
    'stupid', 'idiot', 'dumb', 'ugly', 'shit', 'fuck', 'fucking', 'asshole',
    'bitch', 'damn',
]);

export const NEGATIVE = new Set([
    'triste', 'deprime', 'déprime', 'fatigué', 'fatigue', 'fatiguée',
    'mal', 'pire', 'horrible', 'nul', 'dégoûté', 'degoute', 'énervé', 'enerve', 'enervee',
    'fache', 'fâche', 'fâché', 'facheuse', 'colère', 'colere',
    'sad', 'tired', 'angry', 'mad', 'bad', 'worst', 'terrible', 'awful', 'sick',
]);

/**
 * Count lexicon hits per author.
 * Returns { perPerson: { author: {pos, neg, compliment, insult, total} } }
 */
export function computeSentiment(messages) {
    const perPerson = {};
    for (const m of messages) {
        if (m.isMedia) continue;
        const words = (m.message.toLowerCase().match(/[a-zàâäéèêëïîôùûüÿçœæ']+/gi) || []);
        if (words.length === 0) continue;
        const p = perPerson[m.author] ||= { pos: 0, neg: 0, compliment: 0, insult: 0, words: 0 };
        p.words += words.length;
        for (const w of words) {
            if (POSITIVE.has(w)) p.pos++;
            if (NEGATIVE.has(w)) p.neg++;
            if (COMPLIMENT.has(w)) p.compliment++;
            if (INSULT.has(w)) p.insult++;
        }
    }
    // Ratios + ranking
    const entries = Object.entries(perPerson).map(([author, d]) => {
        const rate = d.words > 0 ? (d.pos - d.neg) / d.words : 0;
        return { author, ...d, rate };
    });
    return {
        perPerson: entries,
        sweetest: [...entries].sort((a, b) => b.compliment - a.compliment)[0] || null,
        sharpest: [...entries].sort((a, b) => b.insult - a.insult)[0] || null,
        mostPositive: [...entries].sort((a, b) => b.rate - a.rate)[0] || null,
        mostNegative: [...entries].sort((a, b) => a.rate - b.rate)[0] || null,
    };
}
