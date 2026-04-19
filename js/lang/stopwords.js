/**
 * Stopwords by language, plus WhatsApp-specific noise tokens always excluded.
 */

export const STOPWORDS_FR = new Set([
    'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'on',
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'en',
    'au', 'aux', 'ce', 'se', 'sa', 'son', 'ses', 'mon', 'ma', 'mes',
    'ton', 'ta', 'tes', 'que', 'qui', 'quoi', 'dont', 'ou', 'mais',
    'si', 'ne', 'pas', 'plus', 'par', 'pour', 'dans', 'sur', 'avec',
    'tout', 'tous', 'toute', 'toutes', 'bien', 'aussi', 'comme',
    'quand', 'alors', 'donc', 'car', 'encore', 'trop', 'fait',
    'avoir', 'etre', 'être', 'faire', 'dire', 'aller', 'voir', 'venir',
    'est', 'sont', 'suis', 'avons', 'avez', 'ont', 'ai', 'as',
    'ete', 'été', 'cette', 'ces', 'ici', 'moi', 'toi', 'lui',
    'leur', 'leurs', 'notre', 'votre', 'meme', 'même', 'autre',
    'autres', 'peu', 'rien', 'tres', 'très', 'peut', 'faut', 'chez',
    'sans', 'sous', 'vers', 'apres', 'après', 'avant', 'entre', 'contre',
    'oui', 'non', 'bon', 'bah', 'ben', 'ouais', 'ouai', 'mdr', 'lol',
    'haha', 'hehe', 'hihi', 'hmm', 'mmm', 'ah', 'eh', 'oh',
]);

export const STOPWORDS_EN = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'you', 'was',
    'are', 'not', 'but', 'have', 'has', 'had', 'from', 'they',
    'were', 'been', 'being', 'their', 'them', 'there', 'then',
    'than', 'when', 'what', 'which', 'who', 'whom', 'would', 'could',
    'should', 'will', 'into', 'about', 'over', 'under', 'your',
    'its', 'our', 'out', 'some', 'any', 'all', 'just', 'only',
    'yes', 'yeah', 'ok', 'okay', 'lol', 'haha',
]);

/** Noise tokens emitted by WhatsApp media/system lines, always excluded. */
export const STOPWORDS_WHATSAPP = new Set([
    'image', 'absente', 'gif', 'retire', 'retiré', 'sticker', 'omis',
    'message', 'modifie', 'modifié', 'nan', 'https', 'http', 'www',
    'medias', 'médias', 'omitted', 'omise', 'video', 'vidéo', 'audio',
    'document', 'omitted',
]);

/**
 * Cheap language detection by counting FR-specific stopword hits.
 * Returns 'fr' or 'en'.
 */
export function detectLanguage(sampleText) {
    const sample = sampleText.slice(0, 20000).toLowerCase();
    const words = sample.match(/[a-zàâäéèêëïîôùûüÿçœæ]+/gi) || [];
    let fr = 0;
    let en = 0;
    for (const w of words) {
        if (STOPWORDS_FR.has(w)) fr++;
        if (STOPWORDS_EN.has(w)) en++;
    }
    return fr >= en ? 'fr' : 'en';
}

export function stopwordsFor(lang) {
    const set = new Set(STOPWORDS_WHATSAPP);
    const base = lang === 'en' ? STOPWORDS_EN : STOPWORDS_FR;
    for (const w of base) set.add(w);
    // Always mix the other language's stopwords too — many chats are bilingual.
    const other = lang === 'en' ? STOPWORDS_FR : STOPWORDS_EN;
    for (const w of other) set.add(w);
    return set;
}
