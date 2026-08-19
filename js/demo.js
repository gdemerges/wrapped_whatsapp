/**
 * A synthetic WhatsApp export, generated on demand.
 *
 * Without it the landing page shows nothing until the visitor digs an export
 * out of their phone — which is most of the reason people bounce. Generated
 * rather than shipped as a fixture so it stays a few hundred bytes of code
 * instead of a megabyte of text, and deterministic (seeded PRNG) so the demo
 * looks the same every time it is shown.
 */

const PEOPLE = ['Camille', 'Léo', 'Sofia', 'Mehdi'];

const PHRASES = [
    'ça marche pour moi', 'je suis en route', 'on se dit ça demain',
    'trop drôle 😂', "j'ai adoré le concert", 'quelqu\'un a des nouvelles ?',
    'je ramène le dessert', 'on part à quelle heure ?', 'bien noté merci',
    'jamais de la vie 😅', 'regardez ça https://www.youtube.com/watch?v=demo',
    'article intéressant https://www.lemonde.fr/article-demo',
    'photo du weekend https://www.instagram.com/p/demo',
    'je peux pas ce soir désolé', 'on fait comme la dernière fois',
    'félicitations 🎉🎉', 'sérieux ?? 😱', 'parfait, à tout à l\'heure',
    'je vous rappelle après la réunion', 'bonne nuit tout le monde 🌙',
    'quelqu\'un veut un café ?', 'ça me va complètement',
    'je crois que je suis en retard', 'trop hâte ! 🔥',
];

const MEDIA = ['image absente', 'sticker omis', 'vidéo absente', 'audio omis'];

/** Mulberry32 — tiny seeded PRNG, so the demo is byte-identical every run. */
function rng(seed) {
    return function next() {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * Build a 14-month, four-person conversation in the iOS FR export format.
 * Volume follows a seasonal curve with a clear peak, so the chapter detection
 * and the heatmap have something real to show.
 *
 * @returns {Blob} Same shape as a file the user would drop in.
 */
export function buildDemoBlob() {
    const random = rng(20240315);
    const lines = [];
    const start = new Date(2024, 0, 1);

    for (let day = 0; day < 425; day++) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day);
        const month = date.getMonth();
        // Quiet winter, busy late spring, a lull in August, steady autumn.
        const season = 1 + Math.sin(((month + 9) / 12) * Math.PI * 2) * 0.8;
        const weekend = date.getDay() === 0 || date.getDay() === 6 ? 1.3 : 1;
        const count = Math.max(0, Math.round((4 + random() * 14) * season * weekend));

        for (let i = 0; i < count; i++) {
            const hour = pickHour(random);
            const minute = Math.floor(random() * 60);
            const second = Math.floor(random() * 60);
            // Weighted so the ranking isn't flat: Camille talks most.
            const person = PEOPLE[Math.min(PEOPLE.length - 1, Math.floor(random() ** 1.7 * PEOPLE.length))];
            const body = random() < 0.08
                ? MEDIA[Math.floor(random() * MEDIA.length)]
                : PHRASES[Math.floor(random() * PHRASES.length)];
            lines.push(
                `[${pad(date.getDate())}/${pad(month + 1)}/${date.getFullYear()} ` +
                `${pad(hour)}:${pad(minute)}:${pad(second)}] ${person}: ${body}`,
            );
        }
        if (count > 0 && random() < 0.15) {
            const reactor = PEOPLE[Math.floor(random() * PEOPLE.length)];
            lines.push(
                `[${pad(date.getDate())}/${pad(month + 1)}/${date.getFullYear()} 21:00:00] ` +
                `${reactor}: a réagi ❤️ à « ${PHRASES[0]} »`,
            );
        }
    }

    return new Blob([lines.join('\n')], { type: 'text/plain' });
}

/** Evening-heavy hour distribution, with a small lunchtime bump. */
function pickHour(random) {
    const r = random();
    if (r < 0.08) return 7 + Math.floor(random() * 2);
    if (r < 0.3) return 12 + Math.floor(random() * 3);
    if (r < 0.85) return 18 + Math.floor(random() * 5);
    return 23;
}
