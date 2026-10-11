/**
 * The composer badge: one badge above the composer root's inline-end corner,
 * counting the draft as `readComposer` reads it.
 *
 * It sits outside the root's box (`bottom: 100%`), so it can never cover the
 * send button or the text being typed. The root becomes its containing block
 * only when the root is statically positioned; a root that already positions
 * itself keeps its own value, so the host's absolutely placed children stay
 * where they were.
 */
import { findComposer, readComposer } from '@/core/services/composer';
import { onCachedLanguageChange } from '@/utils/i18n';

import {
  COUNTER_ANCHOR_CLASS,
  counterLabel,
  createBadge,
  isCounterBadge,
  setBadgeLabel,
} from './badge';
import { type CounterMetric, countText } from './count';

export interface ComposerBadgeOptions {
  readonly doc: Document;
  readonly composer: string;
  readonly composerRoot: string | undefined;
  readonly metric: CounterMetric;
}

/** SPA navigation replaces the composer; the badge follows once the page settles. */
const REBIND_DELAY_MS = 250;
/** A root with one of these positions already contains the badge without Voyager's class. */
const POSITIONED = /^(relative|absolute|fixed|sticky)$/;
/** Room the badge takes above its anchor: `bottom: calc(100% + 4px)` and an 18px line. */
const BADGE_CLEARANCE_PX = 24;

function clips(style: CSSStyleDeclaration): boolean {
  return [style.overflow, style.overflowX, style.overflowY].some(
    (value) => value !== '' && value !== 'visible',
  );
}

/**
 * The root, or the parent of the outermost ancestor that would clip a badge drawn just above the
 * root: DeepSeek's composer root sits inside a rounded card with `overflow: hidden`.
 */
function unclippedAnchor(root: HTMLElement, view: Window): HTMLElement {
  const badgeTop = root.getBoundingClientRect().top - BADGE_CLEARANCE_PX;
  let anchor = root;
  for (
    let node: HTMLElement | null = root;
    node && node !== root.ownerDocument.body;
    node = node.parentElement
  ) {
    if (
      node.parentElement &&
      clips(view.getComputedStyle(node)) &&
      node.getBoundingClientRect().top > badgeTop
    )
      anchor = node.parentElement;
  }
  return anchor;
}

export function startComposerBadge(options: ComposerBadgeOptions): () => void {
  const { doc, composer, composerRoot, metric } = options;
  const view = doc.defaultView ?? window;
  const badge = createBadge(doc, 'composer');
  let field: HTMLElement | null = null;
  let anchor: HTMLElement | null = null;
  /** Whether Voyager positioned the anchor, and whether it had a `class` attribute before. */
  let anchorPositioned: { readonly hadClass: boolean } | undefined;
  let count = 0;
  let frame = 0;
  let rebindTimer: ReturnType<typeof setTimeout> | undefined;

  const render = (): void => setBadgeLabel(badge, counterLabel(metric, count));

  const update = (): void => {
    count = field ? countText(readComposer(field), metric) : 0;
    // An empty draft has nothing to measure; a standing "0" above every new chat is noise.
    badge.hidden = count === 0;
    render();
    // React rewrites a root's className on its own updates; put the anchor class back.
    if (anchor && anchorPositioned) anchor.classList.add(COUNTER_ANCHOR_CLASS);
  };

  const scheduleUpdate = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  };

  const releaseAnchor = (): void => {
    badge.remove();
    if (anchor && anchorPositioned) {
      // Only Voyager's class goes: the host may have changed its own classes since.
      anchor.classList.remove(COUNTER_ANCHOR_CLASS);
      if (!anchorPositioned.hadClass && anchor.classList.length === 0) {
        anchor.removeAttribute('class');
      }
    }
    anchor = null;
    anchorPositioned = undefined;
  };

  const fieldObserver = new MutationObserver(scheduleUpdate);

  const bind = (): void => {
    const next = findComposer(composer, { doc, requireVisible: false });
    if (next !== field) {
      fieldObserver.disconnect();
      field = next;
      // A host that clears or rewrites a contenteditable draft fires no input event.
      if (field)
        fieldObserver.observe(field, { childList: true, subtree: true, characterData: true });
    }
    const root =
      (field && composerRoot ? field.closest<HTMLElement>(composerRoot) : null) ??
      field?.parentElement ??
      null;
    const nextAnchor = root && unclippedAnchor(root, view);
    if (nextAnchor !== anchor) {
      releaseAnchor();
      anchor = nextAnchor;
      if (anchor && !POSITIONED.test(view.getComputedStyle(anchor).position)) {
        anchorPositioned = { hadClass: anchor.hasAttribute('class') };
        anchor.classList.add(COUNTER_ANCHOR_CLASS);
      }
    }
    if (anchor && badge.parentElement !== anchor) anchor.append(badge);
  };

  const onInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const typed = target.closest<HTMLElement>(composer);
    if (!typed) return;
    if (typed !== field) bind();
    scheduleUpdate();
  };

  const isOwnRecord = (record: MutationRecord): boolean =>
    Array.from(record.addedNodes).every(isCounterBadge) &&
    Array.from(record.removedNodes).every(isCounterBadge);

  const pageObserver = new MutationObserver((records) => {
    if (records.every(isOwnRecord)) return;
    clearTimeout(rebindTimer);
    rebindTimer = setTimeout(() => {
      bind();
      scheduleUpdate();
    }, REBIND_DELAY_MS);
  });

  doc.addEventListener('input', onInput, true);
  pageObserver.observe(doc.body, { childList: true, subtree: true });
  const stopFollowingLanguage = onCachedLanguageChange(render);
  bind();
  update();

  return () => {
    doc.removeEventListener('input', onInput, true);
    pageObserver.disconnect();
    fieldObserver.disconnect();
    clearTimeout(rebindTimer);
    if (frame) cancelAnimationFrame(frame);
    stopFollowingLanguage();
    releaseAnchor();
  };
}
