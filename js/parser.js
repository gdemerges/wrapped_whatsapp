/**
 * WhatsApp Chat Parser
 * Supports multiple WhatsApp export formats (iOS/Android, FR/EN).
 */

const PATTERNS = [
    // [DD/MM/YYYY HH:MM:SS] Author: message (FR iOS)
    /^\[(\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}:\d{2})\] ([^:]+): (.+)$/,
    // [DD/MM/YYYY, HH:MM:SS] Author: message
    /^\[(\d{2}\/\d{2}\/\d{4}), (\d{2}:\d{2}:\d{2})\] ([^:]+): (.+)$/,
    // DD/MM/YYYY HH:MM - Author: message (Android FR)
    /^(\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}) - ([^:]+): (.+)$/,
    // DD/MM/YYYY, HH:MM - Author: message
    /^(\d{2}\/\d{2}\/\d{4}), (\d{2}:\d{2}) - ([^:]+): (.+)$/,
    // MM/DD/YY, HH:MM AM/PM - Author: message (US Android)
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),? (\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?) - ([^:]+): (.+)$/i,
    /^(\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}:\d{2}) - ([^:]+): (.+)$/,
];

const SYSTEM_AUTHORS = ['Meta AI'];

const SYSTEM_KEYWORDS = [
    'a créé le groupe', 'vous a ajouté', 'a ajouté', "a changé l'icône",
    'Les messages et les appels', 'a quitté', 'a été retiré', 'est passé',
    'Messages to this chat', 'messages and calls are end-to-end',
    'created group', 'added you', 'changed the subject',
    'changed this group', 'left', 'removed', 'joined using',
    'a modifié le sujet', 'a rejoint en utilisant', 'security code changed',
    'Le code de sécurité', 'a changé le sujet',
    'a remplacé le nom du groupe', 'Seuls les messages partagés avec @Meta AI',
    'Les messages sont générés par l\'IA',
];

const MEDIA_PATTERNS = [
    'image absente', 'GIF retiré', 'sticker omis', 'vidéo absente',
    'audio omis', 'document omis', '<Médias omis>', 'Media omitted',
    'image omitted', 'video omitted', 'audio omitted', 'document omitted',
    'sticker omitted', 'GIF omitted', 'Contact card omitted',
];

const REACTION_RE = /^(?:a réagi|reacted|a aimé|liked)\s+((?:\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)+)/u;

/**
 * Detect which regex pattern matches this file.
 * Requires ≥3 matches in the first 100 lines to avoid false positives.
 */
export function detectPattern(lines) {
    const sampleSize = Math.min(100, lines.length);
    const threshold = Math.max(1, Math.min(3, Math.floor(sampleSize / 3)));
    for (const pattern of PATTERNS) {
        let matches = 0;
        for (let i = 0; i < sampleSize; i++) {
            if (pattern.test(lines[i])) matches++;
        }
        if (matches >= threshold) return pattern;
    }
    return null;
}

export function parseDate(dateStr, timeStr) {
    let match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) {
        const [, day, month, year] = match;
        return new Date(`${year}-${month}-${day}T${timeStr.replace(/\s*(AM|PM)/i, ' $1').trim()}`);
    }

    match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
        // eslint-disable-next-line prefer-const
        let [, part1, part2, year] = match;
        if (year.length === 2) year = '20' + year;
        const month = part1.padStart(2, '0');
        const day = part2.padStart(2, '0');
        let t = timeStr.trim();
        const ampm = t.match(/(AM|PM)/i);
        if (ampm) {
            t = t.replace(/\s*(AM|PM)/i, '').trim();
            const parts = t.split(':');
            let hours = parseInt(parts[0]);
            if (ampm[1].toUpperCase() === 'PM' && hours !== 12) hours += 12;
            if (ampm[1].toUpperCase() === 'AM' && hours === 12) hours = 0;
            t = `${String(hours).padStart(2, '0')}:${parts[1]}${parts[2] ? ':' + parts[2] : ':00'}`;
        } else if (t.split(':').length === 2) {
            t += ':00';
        }
        return new Date(`${year}-${month}-${day}T${t}`);
    }

    return new Date(dateStr + ' ' + timeStr);
}

export function cleanLine(line) {
    return line.replace(/^[\u200e\u200f\u200b\u200c\u200d\u202a-\u202e\u2066-\u2069\ufeff\r]+/, '')
               .replace(/\r$/, '');
}

/**
 * Parse chat text into structured messages.
 * @param {string} text
 * @param {{ year?: number }} options
 */
export function parse(text, options = {}) {
    const lines = text.split('\n').map(cleanLine);
    const pattern = detectPattern(lines);

    if (!pattern) {
        throw new Error("Format de fichier non reconnu. Assurez-vous d'exporter la conversation depuis WhatsApp.");
    }

    const records = [];
    let current = null;

    for (const line of lines) {
        const m = line.match(pattern);
        if (m) {
            if (current) records.push(current);
            const [, dateStr, timeStr, author, body] = m;
            const datetime = parseDate(dateStr, timeStr);
            current = {
                datetime,
                author: author.trim().replace(/[\u200e\u200f]/g, '').replace(/^~\s*/, '').replace(/\s+/g, ' ').trim(),
                message: body.replace(/[\u200e\u200f]/g, ''),
            };
        } else if (current) {
            current.message += '\n' + cleanLine(line);
        }
    }
    if (current) records.push(current);

    let validRecords = records.filter(r => !isNaN(r.datetime.getTime()));

    if (options.year) {
        validRecords = validRecords.filter(r => r.datetime.getFullYear() === options.year);
    }

    for (const r of validRecords) {
        r.isSystem = SYSTEM_KEYWORDS.some(k => r.message.includes(k)) ||
                     SYSTEM_AUTHORS.some(a => r.author === a);
        r.isMedia = MEDIA_PATTERNS.some(k => r.message.includes(k));
        r.isEdited = r.message.includes('<Ce message a été modifié>') ||
                     r.message.includes('<This message was edited>');
        r.msgLen = r.message.length;

        const rx = r.message.match(REACTION_RE);
        if (rx) {
            r.isReaction = true;
            r.reactionEmoji = rx[1];
        } else {
            r.isReaction = false;
        }
    }

    return validRecords.filter(r => !r.isSystem);
}
