/**
 * WhatsApp Chat Parser
 * Supports multiple WhatsApp export formats (iOS/Android, FR/EN)
 */

const WhatsAppParser = {
    // Common patterns for WhatsApp exports
    PATTERNS: [
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
        // [DD/MM/YYYY HH:MM:SS] Author: message (without brackets, alternative)
        /^(\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}:\d{2}) - ([^:]+): (.+)$/,
    ],

    SYSTEM_KEYWORDS: [
        'a créé le groupe', 'vous a ajouté', 'a ajouté', 'a changé l\'icône',
        'Les messages et les appels', 'a quitté', 'a été retiré', 'est passé',
        'Messages to this chat', 'messages and calls are end-to-end',
        'created group', 'added you', 'changed the subject',
        'changed this group', 'left', 'removed', 'joined using',
        'a modifié le sujet', 'a rejoint en utilisant', 'security code changed',
        'Le code de sécurité', 'a changé le sujet',
    ],

    MEDIA_PATTERNS: [
        'image absente', 'GIF retiré', 'sticker omis', 'vidéo absente',
        'audio omis', 'document omis', '<Médias omis>', 'Media omitted',
        'image omitted', 'video omitted', 'audio omitted', 'document omitted',
        'sticker omitted', 'GIF omitted', 'Contact card omitted',
    ],

    /**
     * Detect which regex pattern matches this file
     */
    detectPattern(lines) {
        for (const pattern of this.PATTERNS) {
            let matches = 0;
            const testLines = lines.slice(0, Math.min(100, lines.length));
            for (const line of testLines) {
                if (pattern.test(line)) matches++;
            }
            if (matches >= 3) return pattern;
        }
        return null;
    },

    /**
     * Parse date string to Date object
     */
    parseDate(dateStr, timeStr) {
        // Try DD/MM/YYYY format first
        let match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (match) {
            const [, day, month, year] = match;
            return new Date(`${year}-${month}-${day}T${timeStr.replace(/\s*(AM|PM)/i, ' $1').trim()}`);
        }

        // Try DD/MM/YYYY without leading zeros
        match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (match) {
            let [, part1, part2, year] = match;
            if (year.length === 2) year = '20' + year;
            const month = part1.padStart(2, '0');
            const day = part2.padStart(2, '0');
            // Handle AM/PM
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
    },

    /**
     * Strip invisible Unicode characters from the start of a line
     */
    cleanLine(line) {
        return line.replace(/^[\u200e\u200f\u200b\u200c\u200d\u202a-\u202e\u2066-\u2069\ufeff\r]+/, '')
                   .replace(/\r$/, '');
    },

    /**
     * Parse the chat text content into structured messages
     * @param {string} text - Raw chat text
     * @param {object} options - { year: number } to filter by year
     */
    parse(text, options = {}) {
        // Clean all lines first: strip invisible chars and \r
        const lines = text.split('\n').map(l => this.cleanLine(l));
        const pattern = this.detectPattern(lines);

        if (!pattern) {
            throw new Error('Format de fichier non reconnu. Assurez-vous d\'exporter la conversation depuis WhatsApp.');
        }

        const records = [];
        let current = null;

        for (const line of lines) {
            const m = line.match(pattern);
            if (m) {
                if (current) records.push(current);
                const [, dateStr, timeStr, author, body] = m;
                const datetime = this.parseDate(dateStr, timeStr);
                current = {
                    datetime,
                    author: author.trim().replace(/[\u200e\u200f]/g, '').replace(/^~\s*/, '').replace(/\s+/g, ' ').trim(),
                    message: body.replace(/[\u200e\u200f]/g, ''),
                };
            } else if (current) {
                current.message += '\n' + this.cleanLine(line);
            }
        }
        if (current) records.push(current);

        // Filter out invalid dates
        let validRecords = records.filter(r => !isNaN(r.datetime.getTime()));

        // Filter by year if specified
        if (options.year) {
            validRecords = validRecords.filter(r => r.datetime.getFullYear() === options.year);
        }

        // Mark system & media messages
        for (const r of validRecords) {
            r.isSystem = this.SYSTEM_KEYWORDS.some(k => r.message.includes(k));
            r.isMedia = this.MEDIA_PATTERNS.some(k => r.message.includes(k));
            r.isEdited = r.message.includes('<Ce message a été modifié>') ||
                         r.message.includes('<This message was edited>');
            r.msgLen = r.message.length;
        }

        // Filter out system messages
        const messages = validRecords.filter(r => !r.isSystem);

        return messages;
    }
};
