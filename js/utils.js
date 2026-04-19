/**
 * Shared helpers: escaping, date keys, formatters.
 */

export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function fmt(n) {
    return Number(n).toLocaleString('fr-FR');
}

export function fmtTime(minutes) {
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function fmtDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
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

export const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
