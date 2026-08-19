/** Shared toast + screen-reader announcements. */

const toastEl = () => document.querySelector('#share-toast');
const liveEl = () => document.querySelector('#a11y-live');

let hideTimer = null;

export function announce(message) {
    const el = liveEl();
    if (el) el.textContent = message;
}

export function showToast(message, { error = false, duration = error ? 4000 : 2200 } = {}) {
    const el = toastEl();
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', error);
    el.classList.add('visible');
    if (error) announce(message);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => el.classList.remove('visible'), duration);
}

export function showError(message) {
    showToast(`Erreur : ${message}`, { error: true });
}

/**
 * Clipboard with a fallback for the browsers (and insecure origins) where the
 * async API is unavailable.
 */
export async function copyToClipboard(text, message = 'Lien copié !') {
    try {
        await navigator.clipboard.writeText(text);
        showToast(message);
        return true;
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
        if (ok) showToast(message);
        else showError('Copie impossible, copie le lien manuellement');
        return ok;
    }
}
