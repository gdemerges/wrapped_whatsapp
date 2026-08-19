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
import { shareCard, buildPosterCard } from '../export-image.js';
import { resolvePreset } from '../export-presets.js';
import { ensureLZString } from '../vendor.js';
import { showToast, showError } from './toast.js';
import { track } from '../analytics.js';

const ANON_KEY = 'ww-anonymize-share';
const POSTER_KEY = 'ww-poster-format';

/**
 * @param {{ stats: any, comparison: any, card: any|null, recapCard: any|null }} ctx
 */
export function openShareSheet({ stats, comparison, card, recapCard }) {
    const anonDefault = localStorage.getItem(ANON_KEY) !== 'false';
    const posterFormat = localStorage.getItem(POSTER_KEY) || 'a3';
    const posterMeta = resolvePreset(posterFormat);

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
                ${stats ? `<div class="share-action share-action-compound">
                    <span class="share-action-icon" aria-hidden="true">🖨️</span>
                    <span class="share-action-body">
                        <strong>Poster à imprimer</strong>
                        <small id="poster-meta">${posterMeta.dpi} dpi · ${posterMeta.widthPx}×${posterMeta.heightPx} px</small>
                    </span>
                    <span class="share-action-controls">
                        <label class="share-action-select">
                            <span class="sr-only">Format du poster</span>
                            <select id="poster-format">
                                <option value="a3" ${posterFormat === 'a3' ? 'selected' : ''}>A3</option>
                                <option value="a4" ${posterFormat === 'a4' ? 'selected' : ''}>A4</option>
                            </select>
                        </label>
                        <button class="share-action-go" data-action="poster" aria-label="Générer le poster">Générer</button>
                    </span>
                </div>` : ''}
                <button class="share-action" data-action="link">
                    <span class="share-action-icon" aria-hidden="true">🔗</span>
                    <span><strong>Copier un lien</strong><small>Les stats sont encodées dans le lien</small></span>
                </button>
            </div>

            <label class="switch-row">
                <input type="checkbox" id="share-anon" ${anonDefault ? 'checked' : ''}>
                <span>
                    <strong>Anonymiser les prénoms dans le lien</strong>
                    <small>Camille devient « A. ». Ne concerne que le lien : une image
                    montre exactement ce qu'elle montre.</small>
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

            const formatSelect = root.querySelector('#poster-format');
            formatSelect?.addEventListener('change', () => {
                localStorage.setItem(POSTER_KEY, formatSelect.value);
                const meta = resolvePreset(formatSelect.value);
                root.querySelector('#poster-meta').textContent =
                    `${meta.dpi} dpi · ${meta.widthPx}×${meta.heightPx} px`;
            });

            root.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const action = btn.dataset.action;
                    btn.disabled = true;
                    try {
                        if (action === 'link') {
                            await copyLink(stats, comparison, anonBox.checked);
                        } else if (action === 'poster') {
                            const format = formatSelect?.value || 'a3';
                            showToast('Génération du poster…');
                            const result = await shareCard(
                                buildPosterCard(stats),
                                `whatsapp-wrapped-poster-${format}.png`,
                                { preset: format },
                            );
                            track('poster', { format });
                            showToast(result === 'shared' ? 'Poster partagé' : 'Poster enregistré');
                        } else {
                            const chosen = action === 'recap' ? recapCard : card;
                            const result = await shareCard(chosen, filenameFor(chosen));
                            track('share_image', { kind: action });
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
    track('share_link', { anonymized: anonymize });
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
