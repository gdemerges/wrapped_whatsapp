/**
 * Shared helpers with no locale and no DOM: escaping and date keys.
 *
 * The formatters used to live here too, but `stats.js` imports this module and
 * runs inside the worker — pulling the UI dictionaries in with it. Anything
 * that reads the current language is in `js/format.js` instead.
 */

export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Local YYYY-MM-DD key — avoids toISOString UTC shift that made late-evening
 * messages count against the wrong day in non-UTC timezones.
 */
export function localDayKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function localMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
