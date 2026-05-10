/**
 * Shared type definitions for the WhatsApp Wrapped client.
 * Imported via JSDoc:  `\@import('./types.d.ts').Message`
 */

export interface Message {
    datetime: Date;
    author: string;
    message: string;
    msgLen: number;
    isMedia: boolean;
    isEdited: boolean;
    isReaction: boolean;
    reactionEmoji?: string;
}

export interface PerPerson {
    count: number;
    percent: string;
    media: number;
    edited: number;
    emojis: number;
    links: number;
    totalChars: number;
    avgLen: number;
    nightMsgs: number;
    morningMsgs: number;
    avgResponseMin: number | null;
}

export interface MediaTypes {
    images: number;
    gifs: number;
    stickers: number;
    videos: number;
    audio: number;
    documents: number;
    links: number;
}

export interface Ghost {
    silenced: string;
    revived: string;
    minutes: number;
    when: Date;
}

export interface Compatibility {
    score: number;
    components: {
        lengthSimilarity: number;
        volumeBalance: number;
        reciprocity: number;
        consistency: number;
    };
}

export interface SentimentResult {
    mlEnabled: boolean;
    device: string | null;
    ironyModel: boolean;
    perPerson: Array<{
        author: string;
        pos: number; neg: number;
        strongPos: number; strongNeg: number;
        sampled: number; sarcasmHits: number;
        intensity: number; stdDev: number;
        compliment: number; insult: number; words: number;
        rate: number;
        reactionsSent: number; reactionsSentMean: number;
        reactionsReceived: number; reactionsReceivedMean: number;
    }>;
    sweetest: any | null;
    sharpest: any | null;
    mostPositive: any | null;
    mostNegative: any | null;
    mostIntense: any | null;
    mostVolatile: any | null;
    mostStable: any | null;
    mostBeloved: any | null;
    mostExpressive: any | null;
    monthly: Record<string, number>;
    monthlyPerPerson: Record<string, Record<string, number>>;
    sentimentHourly: Array<number | null>;
    bestDays: Array<{ date: string; mean: number; count: number }>;
    worstDays: Array<{ date: string; mean: number; count: number }>;
    afterAuthor: Record<string, { mean: number; count: number }>;
}

export interface Stats {
    lang: string;
    startDate: Date;
    endDate: Date;
    totalDays: number;
    totalMessages: number;
    avgPerDay: string;
    totalChars: number;
    totalMedia: number;
    totalEdited: number;
    totalLinks: number;
    avgMsgLen: number;
    participants: number;
    perPerson: Record<string, PerPerson>;
    ranking: Array<[string, PerPerson]>;
    hourly: number[];
    weekday: number[];
    heatmap: number[][];
    daily: Record<string, number>;
    monthly: Record<string, number>;
    monthlyPerPerson: Record<string, Record<string, number>>;
    peakHour: number;
    peakDay: string;
    mostActiveDay: [string, number];
    topWords: Array<[string, number]>;
    topWordsPerPerson: Record<string, Array<[string, number]>>;
    uniqueWordsPerPerson: Record<string, Array<[string, number]>>;
    emojis: {
        total: number;
        unique: number;
        top: Array<[string, number]>;
        perPerson: Array<[string, number]>;
    };
    mediaTypes: MediaTypes;
    responseStats: {
        fastest: [string, number];
        slowest: [string, number];
        all: Array<[string, number]>;
    } | null;
    longestMessage: { author: string; datetime: Date | null; msgLen: number };
    streak: { max: number };
    firstMessage: { author: string; datetime: Date } | null;
    nightOwl: [string, number] | null;
    earlyBird: [string, number] | null;
    reactions: {
        total: number;
        topEmojis: Array<[string, number]>;
        perAuthor: Array<[string, number]>;
    };
    initiator: Array<[string, number]>;
    ghosting: {
        count: number;
        longest: Ghost[];
        revivers: Array<[string, number]>;
        silenced: Array<[string, number]>;
    };
    sentiment: SentimentResult | null;
    compatibility: Compatibility | null;
}

export interface YearComparison {
    messages: { current: number; previous: number; pct: number | null };
    days: { current: number; previous: number };
    avgPerDay: { current: number; previous: number; pct: number | null };
    emojis: { current: number; previous: number; pct: number | null };
    media: { current: number; previous: number; pct: number | null };
    avgMsgLen: { current: number; previous: number; pct: number | null };
    streak: { current: number; previous: number; pct: number | null };
    appeared: Array<[string, number]>;
    disappeared: Array<[string, number]>;
}

export type WorkerInbound = { text: string; year?: number | null };
export type WorkerOutbound =
    | { kind: 'years'; years: number[]; yearCounts: Record<string, number> }
    | { kind: 'progress'; text: string }
    | { kind: 'stats'; stats: Stats; comparison: YearComparison | null }
    | { kind: 'error'; message: string };

export interface Slide {
    gradient: string;
    html: string;
    chart?: (ctx: HTMLCanvasElement | CanvasRenderingContext2D, slide: HTMLElement) => void;
}

declare global {
    const LZString: {
        compressToEncodedURIComponent(input: string): string;
        decompressFromEncodedURIComponent(input: string): string | null;
    };
    const Chart: any;
    const JSZip: any;
    interface Window {
        JSZip: any;
        Chart: any;
        LZString: typeof LZString;
    }
}
