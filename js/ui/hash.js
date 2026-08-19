/**
 * Location-hash helpers.
 *
 * The share payload is LZ-String's URI-safe alphabet, which includes `+` — so
 * it can't go through URLSearchParams (which would decode `+` as a space and
 * corrupt the payload). The hash is therefore parsed by hand, with `share=`
 * always kept last and taken verbatim to the end of the string.
 *
 *   #slide=7            #share=N4Ig...            #slide=7&share=N4Ig...
 */

export function readHash() {
    const raw = window.location.hash.slice(1);
    const shareAt = raw.indexOf('share=');
    const share = shareAt >= 0 ? raw.slice(shareAt + 'share='.length) : null;
    const head = shareAt >= 0 ? raw.slice(0, shareAt) : raw;
    const slideMatch = head.match(/slide=(\d+)/);
    return {
        share,
        slide: slideMatch ? parseInt(slideMatch[1], 10) : null,
    };
}

/** Record the current slide without adding a history entry per swipe. */
export function writeSlide(index) {
    const { share } = readHash();
    const parts = [];
    if (index > 0) parts.push(`slide=${index}`);
    if (share) parts.push(`share=${share}`);
    const hash = parts.length ? `#${parts.join('&')}` : '';
    window.history.replaceState(null, '', window.location.pathname + window.location.search + hash);
}

export function clearHash() {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
}
