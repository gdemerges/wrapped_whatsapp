/**
 * The static HTML is translated by attribute, and an attribute is a string the
 * compiler never sees: a typo in `data-i18n="upload.subtitel"` shows up as the
 * key itself printed on the landing page. These tests read the real HTML files
 * and resolve every key they name.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { LOCALES, t, setLocale, applyStaticI18n } from '../js/i18n.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const page = (name) => new JSDOM(readFileSync(resolve(__dirname, '..', name), 'utf-8')).window.document;

const PAGES = ['index.html', 'dashboard.html'];

/** Every translation key an HTML file refers to, with where it came from. */
function keysOf(doc) {
    const out = [];
    for (const el of doc.querySelectorAll('[data-i18n]')) {
        out.push({ key: el.getAttribute('data-i18n'), where: 'data-i18n' });
    }
    for (const el of doc.querySelectorAll('[data-i18n-html]')) {
        out.push({ key: el.getAttribute('data-i18n-html'), where: 'data-i18n-html' });
    }
    for (const el of doc.querySelectorAll('[data-i18n-attr]')) {
        for (const pair of el.getAttribute('data-i18n-attr').split(';')) {
            const [attr, key] = pair.split(':').map(s => s.trim());
            if (attr && key) out.push({ key, where: `data-i18n-attr(${attr})` });
        }
    }
    return out;
}

describe.each(PAGES)('%s', (name) => {
    const doc = page(name);
    const keys = keysOf(doc);

    it('marks a meaningful amount of text for translation', () => {
        expect(keys.length).toBeGreaterThan(5);
    });

    it.each(Object.keys(LOCALES))('resolves every key in %s', (locale) => {
        setLocale(locale);
        const missing = keys.filter(({ key }) => t(key) === key);
        expect(missing).toEqual([]);
    });

    it('declares a language on <html>', () => {
        expect(doc.documentElement.getAttribute('lang')).toBeTruthy();
    });

    it('offers the language picker', () => {
        expect(doc.querySelector('#lang-select')).toBeTruthy();
    });
});

describe('applyStaticI18n', () => {
    it('rewrites text, markup and attributes in place', () => {
        document.body.innerHTML = `
            <p data-i18n="common.close">x</p>
            <p data-i18n-html="upload.demo">x</p>
            <button data-i18n-attr="aria-label:theme.toggle; title:theme.toDark">x</button>`;

        setLocale('en');
        applyStaticI18n(document);

        expect(document.querySelector('[data-i18n]').textContent).toBe('Close');
        expect(document.querySelector('[data-i18n-html]').innerHTML).toContain('<strong>');
        const btn = document.querySelector('button');
        expect(btn.getAttribute('aria-label')).toBe(t('theme.toggle'));
        expect(btn.getAttribute('title')).toBe(t('theme.toDark'));
    });

    it('sets the document language so screen readers switch voice', () => {
        setLocale('en');
        expect(document.documentElement.lang).toBe('en');
        setLocale('fr');
        expect(document.documentElement.lang).toBe('fr');
    });

    it('escapes nothing it should not: a text key never injects markup', () => {
        document.body.innerHTML = '<p data-i18n="upload.demo">x</p>';
        setLocale('fr');
        applyStaticI18n(document);
        // data-i18n is textContent, so the <strong> in that string stays literal.
        expect(document.querySelector('p').querySelector('strong')).toBeNull();
    });
});
