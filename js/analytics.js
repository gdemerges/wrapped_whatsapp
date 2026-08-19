/**
 * Usage counter — how many people finish an analysis, which formats they
 * export. Nothing else.
 *
 * The rules this file exists to enforce:
 *
 *  1. **Nothing derived from a conversation is ever sent.** Not the message
 *     count, not the participant count, not a bucketed version of either.
 *     Only which feature was used.
 *  2. **The URL is stripped to its path.** The share fragment carries the
 *     whole stats payload (`#share=…`); handing that to an analytics endpoint
 *     would leak exactly what the site promises to keep local.
 *  3. **It is off unless configured**, and it obeys Do Not Track, Global
 *     Privacy Control, and a local opt-out.
 *
 * Failures are swallowed: a counter must never be able to break the app.
 */

import { ANALYTICS } from './config.js';

const OPT_OUT_KEY = 'ww-no-analytics';

/** @returns {boolean} */
export function isConfigured() {
    return Boolean(ANALYTICS.host && ANALYTICS.site);
}

/** Honour every "don't track me" signal the platform offers. */
export function isOptedOut() {
    try {
        if (localStorage.getItem(OPT_OUT_KEY) === 'true') return true;
    } catch { /* storage disabled — carry on to the browser signals */ }
    if (navigator.globalPrivacyControl === true) return true;
    const dnt = navigator.doNotTrack ?? window.doNotTrack;
    return dnt === '1' || dnt === 'yes';
}

export function isEnabled() {
    return isConfigured() && !isOptedOut();
}

export function setOptOut(value) {
    try {
        if (value) localStorage.setItem(OPT_OUT_KEY, 'true');
        else localStorage.removeItem(OPT_OUT_KEY);
    } catch { /* nothing we can do */ }
}

/**
 * The page identity we are willing to report: origin + path, never the query
 * or the fragment.
 * @param {{ origin: string, pathname: string }} location
 */
export function safeUrl(location) {
    return `${location.origin}${location.pathname}`;
}

/**
 * Build the request for the configured provider. Pure — the network call is
 * separate so this can be asserted in tests.
 *
 * @param {string} event
 * @param {Record<string, string|number|boolean>} [props]
 * @param {{ origin: string, pathname: string }} [location]
 * @returns {{ url: string, body: any } | null}
 */
export function buildPayload(event, props = {}, location = window.location) {
    if (!isConfigured()) return null;
    const host = ANALYTICS.host.replace(/\/+$/, '');
    const url = safeUrl(location);

    if (ANALYTICS.provider === 'umami') {
        return {
            url: `${host}/api/send`,
            body: {
                type: 'event',
                payload: {
                    website: ANALYTICS.site,
                    url: location.pathname,
                    name: event,
                    data: props,
                },
            },
        };
    }

    // Plausible
    return {
        url: `${host}/api/event`,
        body: {
            name: event,
            domain: ANALYTICS.site,
            url,
            props,
        },
    };
}

/**
 * Fire and forget. `keepalive` so an event sent as the user navigates away
 * (the dashboard hand-off) still leaves.
 */
export function track(event, props = {}) {
    if (!isEnabled()) return;
    const payload = buildPayload(event, props);
    if (!payload) return;
    try {
        fetch(payload.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload.body),
            keepalive: true,
            mode: 'cors',
            credentials: 'omit',
        }).catch(() => {});
    } catch { /* blocked by CSP or an extension — not our problem */ }
}

export function trackPageview() {
    track('pageview');
}
