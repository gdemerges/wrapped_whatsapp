/**
 * The slide deck: mounting, navigation, story mode and lazy chart init.
 *
 * Pulled out of app.js, which had grown to own file loading, worker plumbing,
 * dialogs, sharing *and* the deck. Nothing here knows where the stats came
 * from — it takes built slides and shows them.
 */
import { ensureChart } from './vendor.js';
import { destroyAllCharts, retintCharts } from './slides/_charts.js';
import { announce } from './ui/toast.js';
import { readHash, writeSlide } from './ui/hash.js';

const TRANSITION_MS = 500;
const STORY_BASE_MS = 4600;
const STORY_MAX_MS = 9000;

export class Deck {
    /**
     * @param {{ container: HTMLElement, counter: HTMLElement,
     *           progress: HTMLElement, onSlideChange?: (i: number) => void }} refs
     */
    constructor(refs) {
        this.refs = refs;
        this.slides = [];
        this.elements = [];
        this.index = 0;
        this.animating = false;
        this.chartsReady = new Set();
        this.storyTimer = null;
        this.storyPlaying = false;
        this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    }

    get current() { return this.slides[this.index] || null; }
    get length() { return this.slides.length; }

    /** @param {import('./types.d.ts').Slide[]} slides */
    mount(slides) {
        this.stopStory();
        destroyAllCharts();
        this.chartsReady.clear();
        this.slides = slides;
        this.elements = [];
        this.index = 0;

        const { container, progress } = this.refs;
        container.innerHTML = '';
        progress.innerHTML = '';

        const frag = document.createDocumentFragment();
        slides.forEach((slide, i) => {
            const el = document.createElement('div');
            el.className = `slide ${slide.gradient}${i === 0 ? ' active' : ''}`;
            el.innerHTML = slide.html;
            el.dataset.index = String(i);
            el.setAttribute('role', 'group');
            el.setAttribute('aria-roledescription', 'slide');
            el.setAttribute('aria-label', `Slide ${i + 1} sur ${slides.length}`);
            el.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
            if (slide.chart) el._chartInit = slide.chart;
            frag.appendChild(el);
            this.elements.push(el);

            // The progress bar doubles as the slide picker: a second row of
            // dots said the same thing and collided with the toolbar.
            const seg = document.createElement('button');
            seg.className = 'progress-seg';
            seg.type = 'button';
            seg.setAttribute('role', 'tab');
            seg.setAttribute('aria-label', `Aller à la slide ${i + 1}`);
            seg.setAttribute('aria-selected', String(i === 0));
            seg.innerHTML = '<span class="progress-fill"></span>';
            seg.addEventListener('click', () => { this.stopStory(); this.goTo(i); });
            progress.appendChild(seg);
        });
        container.appendChild(frag);

        const requested = readHash().slide;
        const start = requested != null && requested < slides.length ? requested : 0;

        this.updateChrome(0);
        this.initChart(0);
        if (start > 0) this.goTo(start, { immediate: true });
    }

    /** Restore the deck to an empty state (new analysis). */
    clear() {
        this.stopStory();
        destroyAllCharts();
        this.slides = [];
        this.elements = [];
        this.index = 0;
        this.chartsReady.clear();
        this.refs.container.innerHTML = '';
        this.refs.progress.innerHTML = '';
    }

    async initChart(index) {
        const el = this.elements[index];
        if (!el || !el._chartInit || this.chartsReady.has(index)) return;
        this.chartsReady.add(index); // claim the slot before awaiting, so a fast
                                     // swipe back and forth can't double-init
        try {
            await ensureChart();
        } catch (err) {
            this.chartsReady.delete(index);
            console.warn('[chart]', err);
            return;
        }
        const canvas = el.querySelector('canvas');
        if (!canvas) return;
        el._chartInit(canvas.getContext('2d'), el);
    }

    goTo(index, { immediate = false } = {}) {
        if (index < 0 || index >= this.length || index === this.index) return;
        if (this.animating && !immediate) return;

        const forward = index > this.index;
        const from = this.elements[this.index];
        const to = this.elements[index];

        if (immediate || this.reducedMotion) {
            from.classList.remove('active');
            from.setAttribute('aria-hidden', 'true');
            to.classList.add('active');
            to.setAttribute('aria-hidden', 'false');
            this.index = index;
        } else {
            this.animating = true;
            to.style.transition = 'none';
            to.style.transform = forward ? 'translateX(100%)' : 'translateX(-100%)';
            to.style.opacity = '1';
            to.classList.add('active');
            to.setAttribute('aria-hidden', 'false');
            void to.offsetHeight; // force the start position to stick

            to.style.transition = '';
            to.style.transform = 'translateX(0)';
            from.style.transform = forward ? 'translateX(-100%)' : 'translateX(100%)';
            from.style.opacity = '0';
            from.setAttribute('aria-hidden', 'true');

            setTimeout(() => {
                from.classList.remove('active');
                from.style.cssText = '';
                this.animating = false;
            }, TRANSITION_MS);
            this.index = index;
        }

        this.updateChrome(index);
        this.initChart(index);
        this.initChart(index + 1); // pre-warm the next chart so it never pops in
        announce(`Slide ${index + 1} sur ${this.length}`);
        writeSlide(index);
        this.refs.onSlideChange?.(index);
        if (this.storyPlaying) this.scheduleStory();
    }

    next() { this.index < this.length - 1 ? this.goTo(this.index + 1) : this.stopStory(); }
    prev() { this.goTo(this.index - 1); }

    updateChrome(index) {
        const { counter, progress } = this.refs;
        if (counter) counter.textContent = `${index + 1} / ${this.length}`;
        progress.querySelectorAll('.progress-seg').forEach((seg, i) => {
            seg.classList.toggle('seen', i < index);
            seg.classList.toggle('current', i === index);
            seg.setAttribute('aria-selected', String(i === index));
        });
    }

    // ------------------------------------------------------------ story mode

    /** Dwell time scaled by how much there is to read on the slide. */
    storyDuration(index) {
        const el = this.elements[index];
        const chars = el ? (el.textContent || '').trim().length : 0;
        return Math.min(STORY_MAX_MS, STORY_BASE_MS + chars * 12);
    }

    toggleStory() {
        this.storyPlaying ? this.stopStory() : this.startStory();
        return this.storyPlaying;
    }

    startStory() {
        if (this.length === 0) return;
        if (this.index === this.length - 1) this.goTo(0, { immediate: true });
        this.storyPlaying = true;
        document.body.classList.add('story-playing');
        this.scheduleStory();
    }

    stopStory() {
        this.storyPlaying = false;
        clearTimeout(this.storyTimer);
        this.storyTimer = null;
        document.body.classList.remove('story-playing');
        const seg = this.refs.progress?.querySelector('.progress-seg.current .progress-fill');
        if (seg) seg.style.animation = 'none';
    }

    scheduleStory() {
        clearTimeout(this.storyTimer);
        const duration = this.storyDuration(this.index);
        const fill = this.refs.progress.querySelector('.progress-seg.current .progress-fill');
        if (fill) {
            fill.style.animation = 'none';
            void fill.offsetWidth;
            fill.style.animation = `progress-fill ${duration}ms linear forwards`;
        }
        this.storyTimer = setTimeout(() => this.next(), duration);
    }

    retint() { retintCharts(); }
}

/**
 * Wire keyboard, touch and wheel navigation once, for the lifetime of the page.
 * @param {Deck} deck
 * @param {() => boolean} isActive
 */
export function bindNavigation(deck, isActive) {
    document.addEventListener('keydown', (e) => {
        if (!isActive()) return;
        if (e.target.closest('input, textarea, select, [contenteditable]')) return;
        switch (e.key) {
            case 'ArrowRight': e.preventDefault(); deck.stopStory(); deck.next(); break;
            case 'ArrowLeft':  e.preventDefault(); deck.stopStory(); deck.prev(); break;
            case 'Home':       e.preventDefault(); deck.stopStory(); deck.goTo(0); break;
            case 'End':        e.preventDefault(); deck.stopStory(); deck.goTo(deck.length - 1); break;
            case ' ':
                if (e.target.closest('button')) return; // let Space activate buttons
                e.preventDefault();
                deck.toggleStory();
                break;
            default: break;
        }
    });

    const container = deck.refs.container;
    let startX = 0, startY = 0;
    container.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });
    container.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
            deck.stopStory();
            dx < 0 ? deck.next() : deck.prev();
        }
    }, { passive: true });

    let wheelLock = null;
    container.addEventListener('wheel', (e) => {
        if (wheelLock) return;
        if (Math.abs(e.deltaY) < 30) return;
        // A scrollable slide (long rankings on a small screen) scrolls first;
        // only take over once it has hit the end.
        const scroller = e.target.closest('.slide-inner');
        if (scroller && scroller.scrollHeight > scroller.clientHeight + 4) {
            const atTop = scroller.scrollTop <= 0;
            const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
            if (!(e.deltaY > 0 ? atEnd : atTop)) return;
        }
        wheelLock = setTimeout(() => { wheelLock = null; }, 700);
        deck.stopStory();
        e.deltaY > 0 ? deck.next() : deck.prev();
    }, { passive: true });
}
