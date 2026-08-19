/**
 * Deployment configuration.
 *
 * Everything here is optional and empty by default: the site works, and stays
 * completely network-silent, until these are filled in. That is deliberate —
 * a fork or a local checkout must never start phoning home because of a value
 * someone forgot to blank out.
 */

/**
 * Tip jar. Set to a full https URL (Ko-fi, Buy Me a Coffee, GitHub Sponsors…)
 * to show the support links. Empty = no links rendered anywhere.
 */
export const TIP_JAR_URL = '';

/**
 * Privacy-preserving usage counter.
 *
 * `host` must ALSO be added to `connect-src` in the Content-Security-Policy of
 * index.html and dashboard.html — otherwise every request is blocked and the
 * counter silently records nothing. See README, section « Mesure d'audience ».
 *
 * - provider: 'plausible' | 'umami'
 * - host:     origin of your instance, e.g. 'https://stats.exemple.fr'
 * - site:     the domain (Plausible) or website id (Umami)
 */
export const ANALYTICS = {
    provider: 'plausible',
    host: '',
    site: '',
};
