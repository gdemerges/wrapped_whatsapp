/**
 * Share sheet.
 *
 * Two very different things live behind one button, and they have different
 * privacy profiles:
 *   • an image — self-contained, shows only what is drawn on it;
 *   • a link — carries the whole stats payload in the URL fragment, so it
 *     lands in browser history and in the logs of whatever app it is pasted
 *     into. Anonymisation is therefore on by default for links.
 */
import { openDialog } from './dialog.js';
import { buildShareURL } from '../payload.js';
import { anonymizeStats } from '../anonymize.js';
import { shareCard } from '../export-image.js';
import { ensureLZString } from '../vendor.js';
import { showToast, showError } from './toast.js';

const ANON_KEY = 'ww-anonymize-share';

/**
 * @param {{ stats: any, comparison: any, card: any|null, recapCard: any|null }} ctx
 */
export function openShareSheet({ stats, comparison, card, recapCard }) {
    const anonDefault = localStorage.getItem(ANON_KEY) !== 'false';

    const html = `
        <div class="dialog-panel share-panel">
            <h2 class="dialog-title">Partager</h2>

            <div class="share-actions">
                ${card ? `<button class="share-action" data-action="slide" data-autofocus>
                    <span class="share-action-icon" aria-hidden="true">🖼️</span>
                    <span><strong>Image de cette slide</strong><small>PNG 1080×1920, prêt pour une story</small></span>
                </button>` : ''}
                ${recapCard ? `<button class="share-action" data-action="recap">
                    <span class="share-action-icon" aria-hidden="true">🧾</span>
                    <span><strong>Image du récapitulatif</strong><small>Les chiffres clés en une image</small></span>
                </button>` : ''}
                <button class="share-action" data-action="link">
                    <span class="share-action-icon" aria-hidden="true">🔗</span>
                    <span><strong>Copier un lien</strong><small>Les stats sont encodées dans le lien</small></span>
                </button>
            </div>

            <label class="switch-row">
                <input type="checkbox" id="share-anon" ${anonDefault ? 'checked' : ''}>
                <span>
                    <strong>Anonymiser les prénoms</strong>
                    <small>Camille devient « A. » — recommandé pour un lien public</small>
                </span>
            </label>

            <button class="dialog-dismiss" data-dismiss aria-label="Fermer">Fermer</button>
        </div>`;

    return openDialog({
        label: 'Partager',
        className: 'share-dialog',
        html,
        onMount(root, close) {
            const anonBox = root.querySelector('#share-anon');
            anonBox.addEventListener('change', () => {
                localStorage.setItem(ANON_KEY, String(anonBox.checked));
            });

            root.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const action = btn.dataset.action;
                    btn.disabled = true;
                    try {
                        if (action === 'link') {
                            await copyLink(stats, comparison, anonBox.checked);
                        } else {
                            const chosen = action === 'recap' ? recapCard : card;
                            const result = await shareCard(chosen, filenameFor(chosen));
                            showToast(result === 'shared' ? 'Image partagée' : 'Image enregistrée');
                        }
                        close(action);
                    } catch (err) {
                        console.error(err);
                        showError(err.message);
                        btn.disabled = false;
                    }
                });
            });

            root.querySelector('[data-dismiss]').addEventListener('click', () => close(undefined));
        },
    });
}

async function copyLink(stats, comparison, anonymize) {
    await ensureLZString();
    const payload = anonymize ? anonymizeStats(stats) : stats;
    const { url, truncated } = buildShareURL(payload, comparison, { dropDaily: true });
    const { copyToClipboard } = await import('./toast.js');
    await copyToClipboard(
        url,
        truncated ? 'Lien copié (allégé, conversation volumineuse)' : 'Lien copié !',
    );
}

function filenameFor(card) {
    const slug = (card?.title || card?.tag || 'wrapped')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    return `whatsapp-wrapped-${slug || 'slide'}.png`;
}
