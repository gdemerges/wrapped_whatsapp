/**
 * WhatsApp Chat Parser
 *
 * WhatsApp exports vary by platform *and* by phone locale. Rather than one
 * regex per locale, two shapes cover every known export:
 *
 *   iOS      [<date>, <time>] Author: body
 *   Android  <date>, <time> - Author: body
 *
 * with a permissive <date>/<time> and the day/month order *inferred from the
 * file* instead of guessed from the separator — that guess used to mangle
 * European exports with a two-digit year (12/03/24 read as December 3rd).
 */

const DATE = String.raw`\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4}`;
// Optional seconds; AM/PM optionally dotted and preceded by a regular or
// narrow no-break space (iOS uses U+202F in recent versions).
const TIME = String.raw`\d{1,2}[:.]\d{2}(?::\d{2})?(?:[\s  ]*[APap]\.?[Mm]\.?)?`;

const PATTERNS = [
    // iOS: [12/03/2024, 14:30:00] Alice: hello   (comma optional)
    new RegExp(String.raw`^\[(${DATE}),?[\s  ]+(${TIME})\]\s*([^:]+):\s(.+)$`),
    // Android: 12/03/2024, 14:30 - Alice: hello  (comma optional, en dash tolerated)
    new RegExp(String.raw`^(${DATE}),?[\s  ]+(${TIME})\s*[-–]\s*([^:]+):\s(.+)$`),
];

/** A line that starts a message but has no author (system notice). */
const SYSTEM_LINE_PATTERNS = [
    new RegExp(String.raw`^\[(${DATE}),?[\s  ]+(${TIME})\]\s*(.+)$`),
    new RegExp(String.raw`^(${DATE}),?[\s  ]+(${TIME})\s*[-–]\s*(.+)$`),
];

const SYSTEM_AUTHORS = ['Meta AI', 'WhatsApp'];

const SYSTEM_KEYWORDS = [
    // FR
    'a créé le groupe', 'vous a ajouté', 'a ajouté', "a changé l'icône",
    'Les messages et les appels', 'a quitté', 'a été retiré', 'est passé',
    'a modifié le sujet', 'a rejoint en utilisant', 'Le code de sécurité',
    'a changé le sujet', 'a remplacé le nom du groupe',
    'Seuls les messages partagés avec @Meta AI', "Les messages sont générés par l'IA",
    // EN
    'Messages to this chat', 'messages and calls are end-to-end',
    'created group', 'created this group', 'added you', 'changed the subject',
    'changed this group', 'left', 'removed', 'joined using',
    'security code changed', 'changed their phone number',
    // ES
    'Los mensajes y las llamadas', 'creó el grupo', 'añadió a', 'salió',
    'cambió el asunto', 'se unió usando', 'El código de seguridad',
    // DE
    'Nachrichten und Anrufe', 'hat die Gruppe erstellt', 'hat dich hinzugefügt',
    'hat hinzugefügt', 'hat die Gruppe verlassen', 'Sicherheitsnummer',
];

const MEDIA_PATTERNS = [
    // FR
    'image absente', 'GIF retiré', 'sticker omis', 'vidéo absente',
    'audio omis', 'document omis', '<Médias omis>',
    // EN
    'Media omitted', 'image omitted', 'video omitted', 'audio omitted',
    'document omitted', 'sticker omitted', 'GIF omitted', 'Contact card omitted',
    // ES
    'imagen omitida', 'video omitido', 'audio omitido', 'sticker omitido',
    'documento omitido', 'GIF omitido', 'Multimedia omitido',
    // DE
    'Bild weggelassen', 'Video weggelassen', 'Audio weggelassen',
    'Dokument weggelassen', 'Sticker weggelassen', 'GIF weggelassen',
];

const EDITED_PATTERNS = [
    '<Ce message a été modifié>', '<This message was edited>',
    '<Se editó este mensaje>', '<Diese Nachricht wurde bearbeitet>',
];

const REACTION_RE =
    /^(?:a réagi|reacted|a aimé|liked|reaccionó|hat reagiert)\s+((?:\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)+)/u;

/**
 * Detect which regex pattern matches this file.
 * Requires ≥3 matches in the first 200 lines to avoid false positives.
 */
export function detectPattern(lines) {
    const sampleSize = Math.min(200, lines.length);
    const threshold = Math.max(1, Math.min(3, Math.floor(sampleSize / 3)));
    let best = null;
    let bestScore = 0;
    for (const pattern of PATTERNS) {
        let matches = 0;
        for (let i = 0; i < sampleSize; i++) {
            if (pattern.test(lines[i])) matches++;
        }
        if (matches >= threshold && matches > bestScore) {
            best = pattern;
            bestScore = matches;
        }
    }
    return best;
}

/**
 * Infer whether dates are day-first (rest of the world) or month-first (US).
 *
 * Decided by evidence, in order:
 *   1. a first component > 12  → day-first
 *   2. a second component > 12 → month-first
 *   3. AM/PM clock             → month-first (US convention)
 *   4. otherwise               → day-first (WhatsApp's default outside the US)
 *
 * @returns {'dmy' | 'mdy'}
 */
export function inferDateOrder(dateStrings, timeStrings = []) {
    for (const ds of dateStrings) {
        const parts = ds.split(/[/.\-]/);
        if (parts.length !== 3) continue;
        const a = parseInt(parts[0], 10);
        const b = parseInt(parts[1], 10);
        if (parts[0].length === 4) return 'dmy'; // YYYY-MM-DD, handled separately
        if (a > 12) return 'dmy';
        if (b > 12) return 'mdy';
    }
    if (timeStrings.some(t => /[APap]\.?[Mm]/.test(t))) return 'mdy';
    return 'dmy';
}

/**
 * @param {string} dateStr
 * @param {string} timeStr
 * @param {'dmy'|'mdy'} [order]
 */
export function parseDate(dateStr, timeStr, order = 'dmy') {
    const parts = dateStr.split(/[/.\-]/);
    if (parts.length !== 3) return new Date(NaN);

    let year, month, day;
    if (parts[0].length === 4) {
        [year, month, day] = parts;               // ISO-ish: YYYY-MM-DD
    } else if (order === 'mdy') {
        [month, day, year] = parts;
    } else {
        [day, month, year] = parts;
    }
    if (year.length === 2) year = '20' + year;

    const time = normalizeTime(timeStr);
    if (!time) return new Date(NaN);

    return new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        time.h, time.m, time.s,
    );
}

/** "2:30 PM" / "14.30" / "14:30:05" → { h, m, s } */
function normalizeTime(timeStr) {
    const t = String(timeStr).replace(/[  ]/g, ' ').trim();
    const ampm = t.match(/([APap])\.?[Mm]\.?\s*$/);
    const clock = t.replace(/[APap]\.?[Mm]\.?\s*$/, '').trim().split(/[:.]/);
    if (clock.length < 2) return null;

    let h = parseInt(clock[0], 10);
    const m = parseInt(clock[1], 10);
    const s = clock[2] ? parseInt(clock[2], 10) : 0;
    if ([h, m, s].some(Number.isNaN)) return null;

    if (ampm) {
        const isPM = ampm[1].toLowerCase() === 'p';
        if (isPM && h !== 12) h += 12;
        if (!isPM && h === 12) h = 0;
    }
    if (h > 23 || m > 59 || s > 59) return null;
    return { h, m, s };
}

export function cleanLine(line) {
    return line.replace(/^[‎‏​‌‍‪-‮⁦-⁩﻿\r]+/, '')
               .replace(/\r$/, '');
}

function isSystemText(text) {
    return SYSTEM_KEYWORDS.some(k => text.includes(k));
}

/**
 * Inspect a file that failed to parse, so the UI can explain *why*.
 * The returned sample lines are truncated and stripped of anything after the
 * first colon — enough to recognise a format, not enough to leak a message.
 * @returns {{ totalLines: number, matched: number, detected: boolean, samples: string[] }}
 */
export function diagnose(text) {
    const lines = text.split('\n').map(cleanLine).filter(l => l.trim() !== '');
    const pattern = detectPattern(lines);
    let matched = 0;
    const samples = [];
    for (const line of lines.slice(0, 200)) {
        if (pattern && pattern.test(line)) { matched++; continue; }
        if (samples.length < 3) samples.push(redact(line));
    }
    return { totalLines: lines.length, matched, detected: !!pattern, samples };
}

/** Keep the date/time scaffolding, drop the human content. */
function redact(line) {
    const head = line.slice(0, 40);
    return head.replace(/[\p{L}\p{M}]{2,}/gu, 'xxx') + (line.length > 40 ? '…' : '');
}

/**
 * Parse chat text into structured messages.
 * @param {string} text
 * @param {{ year?: number }} [options]
 * @returns {import('./types.d.ts').Message[]}
 */
export function parse(text, options = {}) {
    const lines = text.split('\n').map(cleanLine);
    const pattern = detectPattern(lines);

    if (!pattern) {
        throw new Error("Format de fichier non reconnu. Assurez-vous d'exporter la conversation depuis WhatsApp.");
    }

    // First pass: collect date/time tokens to settle the day/month order once
    // for the whole file, rather than per line.
    const dateSamples = [];
    const timeSamples = [];
    for (const line of lines) {
        const m = line.match(pattern);
        if (!m) continue;
        dateSamples.push(m[1]);
        timeSamples.push(m[2]);
        if (dateSamples.length >= 2000) break;
    }
    const order = inferDateOrder(dateSamples, timeSamples);

    const systemPattern = SYSTEM_LINE_PATTERNS[PATTERNS.indexOf(pattern)];

    /** @type {any[]} */
    const records = [];
    /** @type {any} */
    let current = null;

    for (const line of lines) {
        const m = line.match(pattern);
        if (m) {
            if (current) records.push(current);
            const [, dateStr, timeStr, author, body] = m;
            current = {
                datetime: parseDate(dateStr, timeStr, order),
                author: normalizeAuthor(author),
                message: body.replace(/[‎‏]/g, ''),
            };
            continue;
        }
        // An author-less dated line is a system notice — it must break the
        // current message rather than be appended to it as a continuation.
        const sys = systemPattern && line.match(systemPattern);
        if (sys && isSystemText(sys[3])) {
            if (current) { records.push(current); current = null; }
            continue;
        }
        if (current) current.message += '\n' + cleanLine(line);
    }
    if (current) records.push(current);

    let validRecords = records.filter(r => !isNaN(r.datetime.getTime()));

    // Guard against a locale/format mismatch: if lines matched the layout but
    // none yielded a valid date, fail loudly instead of returning nothing.
    if (records.length > 0 && validRecords.length === 0) {
        throw new Error("Les dates du fichier n'ont pas pu être interprétées (format de date non reconnu).");
    }

    if (options.year) {
        validRecords = validRecords.filter(r => r.datetime.getFullYear() === options.year);
    }

    for (const r of validRecords) {
        r.isSystem = isSystemText(r.message) || SYSTEM_AUTHORS.some(a => r.author === a);
        r.isMedia = MEDIA_PATTERNS.some(k => r.message.includes(k));
        r.isEdited = EDITED_PATTERNS.some(k => r.message.includes(k));
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

function normalizeAuthor(raw) {
    return raw.trim()
        .replace(/[‎‏]/g, '')
        .replace(/^~\s*/, '')   // group members show as "~Nickname"
        .replace(/\s+/g, ' ')
        .trim();
}
