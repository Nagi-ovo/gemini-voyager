/**
 * The badge element and its page styles.
 *
 * The label is CSS generated content (`::before { content: attr(…) }`), not
 * a text node: `textContent`, `innerText`, a selection's copied text, export
 * and the reply's own count never contain it. It is `aria-hidden` because the
 * composer badge changes on every keystroke (a live region would talk over
 * typing) and a reply's count is decoration a screen reader user would hear
 * mid-reply; it never takes focus or pointer input.
 */
import { getCachedLocale, getTranslationSync } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

import type { CounterMetric } from './count';
import type messages from './messages/en.json';

declare module '@/utils/translations' {
  interface PrimitiveMessages {
    counterBadge: typeof messages;
  }
}

export const COUNTER_BADGE_CLASS = 'gv-counter-badge';
export const COUNTER_BADGE_ATTR = 'data-gv-counter-badge';
const TEXT_ATTR = 'data-gv-counter-text';
/** Added to a composer root only while it is statically positioned and holds the badge. */
export const COUNTER_ANCHOR_CLASS = 'gv-counter-badge-anchor';

const METRIC_LABELS = {
  chars: 'counterBadgeChars',
  words: 'counterBadgeWords',
  cjkChars: 'counterBadgeCjkChars',
  lines: 'counterBadgeLines',
} as const satisfies Record<CounterMetric, TranslationKey>;

export const COUNTER_BADGE_CSS = `
.${COUNTER_BADGE_CLASS} {
  box-sizing: border-box;
  padding: 0 6px;
  border-radius: 8px;
  font: 500 11px/18px system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-variant-numeric: tabular-nums;
  letter-spacing: normal;
  white-space: nowrap;
  color: var(--gv-counter-fg, color-mix(in srgb, currentColor 62%, transparent));
  background: var(--gv-counter-bg, color-mix(in srgb, currentColor 7%, transparent));
  pointer-events: none !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}
.${COUNTER_BADGE_CLASS}::before { content: attr(${TEXT_ATTR}); }
html[data-gv-scheme='light'] .${COUNTER_BADGE_CLASS} {
  --gv-counter-fg: rgb(0 0 0 / 58%);
  --gv-counter-bg: rgb(0 0 0 / 5%);
}
html[data-gv-scheme='dark'] .${COUNTER_BADGE_CLASS} {
  --gv-counter-fg: rgb(255 255 255 / 64%);
  --gv-counter-bg: rgb(255 255 255 / 8%);
}
body.gv-rtl .${COUNTER_BADGE_CLASS} { direction: rtl; }
.${COUNTER_ANCHOR_CLASS} { position: relative !important; }
.gv-counter-badge-composer {
  position: absolute;
  bottom: calc(100% + 4px);
  inset-inline-end: 12px;
  z-index: 1;
}
.gv-counter-badge-turn {
  display: block;
  width: fit-content;
  margin-block: 6px 0;
  margin-inline-start: auto;
}
`;

export type BadgeKind = 'composer' | 'turn';

export function createBadge(doc: Document, kind: BadgeKind): HTMLElement {
  const badge = doc.createElement(kind === 'composer' ? 'span' : 'div');
  badge.className = `${COUNTER_BADGE_CLASS} gv-counter-badge-${kind}`;
  badge.setAttribute(COUNTER_BADGE_ATTR, kind);
  badge.setAttribute('aria-hidden', 'true');
  return badge;
}

export function isCounterBadge(node: Node): boolean {
  return node instanceof Element && node.hasAttribute(COUNTER_BADGE_ATTR);
}

/** The label shown in the badge: the metric's message with the count in the Voyager language. */
export function counterLabel(metric: CounterMetric, count: number): string {
  const locale = getCachedLocale();
  if (numberFormat?.locale !== locale) {
    numberFormat = { locale, format: new Intl.NumberFormat(locale) };
  }
  return getTranslationSync(METRIC_LABELS[metric]).replace(
    '{count}',
    numberFormat.format.format(count),
  );
}

let numberFormat: { readonly locale: string; readonly format: Intl.NumberFormat } | undefined;

export function setBadgeLabel(badge: HTMLElement, label: string): void {
  if (badge.getAttribute(TEXT_ATTR) !== label) badge.setAttribute(TEXT_ATTR, label);
}

export function badgeLabel(badge: HTMLElement): string | null {
  return badge.getAttribute(TEXT_ATTR);
}
