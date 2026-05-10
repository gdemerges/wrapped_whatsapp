import { GRADIENTS } from './_constants.js';
import { overviewSlide, comparisonSlide, wordsTrendSlide, recapSlide } from './overview.js';
import { topMessagersSlide, pieSlide, evolutionPerPersonSlide, messageLengthSlide, initiatorSlide } from './ranking.js';
import { monthlySlide, heatmapSlide, hourlyWeekdaySlide } from './time.js';
import { topWordsSlide, uniqueWordsSlide } from './words.js';
import { emojiSlide, reactionsSlide, emojisPerPersonSlide } from './emojis.js';
import { mediaSlide } from './media.js';
import { ghostingSlide, compatibilitySlide, funFactsSlide } from './relationships.js';
import { ambianceSlide, sentimentTimelineSlide, moodHourlySlide, momentsSlide, influenceSlide } from './sentiment.js';
import { duoBoardSlide, duoWordsSlide } from './duo.js';

/**
 * @param {import('../types.d.ts').Stats} stats
 * @param {import('../types.d.ts').YearComparison | null} [comparison]
 * @returns {import('../types.d.ts').Slide[]}
 */
export function generateSlides(stats, comparison = null) {
    let gi = 0;
    const g = () => GRADIENTS[gi++ % GRADIENTS.length];

    const builders = [
        () => overviewSlide(stats, g()),
        () => comparisonSlide(comparison, g()),
        () => topMessagersSlide(stats, g()),
        () => duoBoardSlide(stats, g()),
        () => pieSlide(stats, g()),
        () => monthlySlide(stats, g()),
        () => evolutionPerPersonSlide(stats, g()),
        () => heatmapSlide(stats, g()),
        () => hourlyWeekdaySlide(stats, g()),
        () => topWordsSlide(stats, g()),
        () => wordsTrendSlide(comparison, g()),
        () => uniqueWordsSlide(stats, g()),
        () => duoWordsSlide(stats, g()),
        () => emojiSlide(stats, g()),
        () => reactionsSlide(stats, g()),
        () => mediaSlide(stats, g()),
        () => messageLengthSlide(stats, g()),
        () => initiatorSlide(stats, g()),
        () => ghostingSlide(stats, g()),
        () => ambianceSlide(stats, g()),
        () => sentimentTimelineSlide(stats, g()),
        () => moodHourlySlide(stats, g()),
        () => momentsSlide(stats, g()),
        () => influenceSlide(stats, g()),
        () => compatibilitySlide(stats, g()),
        () => funFactsSlide(stats, g()),
        () => emojisPerPersonSlide(stats, g()),
        () => recapSlide(stats),
    ];

    const slides = [];
    for (const build of builders) {
        const s = build();
        if (s) slides.push(s);
    }
    return slides;
}
