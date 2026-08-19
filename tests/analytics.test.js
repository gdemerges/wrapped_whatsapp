import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The module reads config at call time, so the mock can be reshaped per test.
const config = { provider: 'plausible', host: '', site: '' };
vi.mock('../js/config.js', () => ({
    TIP_JAR_URL: '',
    get ANALYTICS() { return config; },
}));

const { isConfigured, isOptedOut, isEnabled, safeUrl, buildPayload } = await import('../js/analytics.js');

const LOCATION = {
    origin: 'https://exemple.fr',
    pathname: '/index.html',
    search: '?utm=x',
    hash: '#share=N4IgSECRET',
};

beforeEach(() => {
    config.provider = 'plausible';
    config.host = 'https://stats.exemple.fr';
    config.site = 'exemple.fr';
    // `navigator` is read-only on globalThis in Node, hence stubGlobal.
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { doNotTrack: null });
    vi.stubGlobal('localStorage', {
        store: {},
        getItem(k) { return this.store[k] ?? null; },
        setItem(k, v) { this.store[k] = v; },
        removeItem(k) { delete this.store[k]; },
    });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('analytics gating', () => {
    it('is off until both host and site are set', () => {
        config.host = '';
        expect(isConfigured()).toBe(false);
        expect(buildPayload('pageview', {}, LOCATION)).toBeNull();
        config.host = 'https://stats.exemple.fr';
        expect(isConfigured()).toBe(true);
    });

    it('obeys Global Privacy Control', () => {
        vi.stubGlobal('navigator', { globalPrivacyControl: true });
        expect(isOptedOut()).toBe(true);
        expect(isEnabled()).toBe(false);
    });

    it('obeys Do Not Track', () => {
        vi.stubGlobal('navigator', { doNotTrack: '1' });
        expect(isOptedOut()).toBe(true);
    });

    it('obeys the local opt-out', () => {
        localStorage.setItem('ww-no-analytics', 'true');
        expect(isOptedOut()).toBe(true);
    });

    it('is enabled when configured and no signal objects', () => {
        expect(isEnabled()).toBe(true);
    });
});

describe('payload', () => {
    it('never reports the query string or the share fragment', () => {
        // The fragment holds the whole stats payload — this is the one thing
        // that must never reach an analytics endpoint.
        expect(safeUrl(LOCATION)).toBe('https://exemple.fr/index.html');
        const { body } = buildPayload('poster', { format: 'a3' }, LOCATION);
        const dump = JSON.stringify(body);
        expect(dump).not.toContain('SECRET');
        expect(dump).not.toContain('utm');
    });

    it('builds a Plausible event', () => {
        const { url, body } = buildPayload('poster', { format: 'a3' }, LOCATION);
        expect(url).toBe('https://stats.exemple.fr/api/event');
        expect(body).toEqual({
            name: 'poster',
            domain: 'exemple.fr',
            url: 'https://exemple.fr/index.html',
            props: { format: 'a3' },
        });
    });

    it('builds an Umami event', () => {
        config.provider = 'umami';
        config.site = 'abc-123';
        const { url, body } = buildPayload('poster', { format: 'a4' }, LOCATION);
        expect(url).toBe('https://stats.exemple.fr/api/send');
        expect(body.type).toBe('event');
        expect(body.payload).toEqual({
            website: 'abc-123',
            url: '/index.html',
            name: 'poster',
            data: { format: 'a4' },
        });
    });

    it('tolerates a trailing slash on the host', () => {
        config.host = 'https://stats.exemple.fr/';
        expect(buildPayload('pageview', {}, LOCATION).url).toBe('https://stats.exemple.fr/api/event');
    });
});
