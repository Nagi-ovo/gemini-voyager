/**
 * The "Move to folder" entry a site's own row menu gets: a clone of one of the
 * menu's native items, so it inherits the site's look and hover, with a folder
 * icon and Voyager's label. A menu library's roving focus only knows the items
 * its framework registered, so `wireMenuKeyboard` steps the arrow keys into and
 * out of the entry, and `MenuCloseWait` runs the move once the closed menu has
 * handed focus back to its trigger.
 */
import type { IconNode } from 'lucide-react';

import { createLucideIcon } from '@/core/icons/lucideIcon';

/**
 * Lucide `folder-input` (lucide-react v0.553.0): a folder with an arrow going
 * in, so the entry reads as a move and not as the pencil of the Rename item it
 * is cloned from.
 */
const MOVE_ICON_NODE = [
  [
    'path',
    {
      d: 'M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1',
      key: 'fm4g5t',
    },
  ],
  ['path', { d: 'M2 13h10', key: 'pgb2dq' }],
  ['path', { d: 'm9 16 3-3-3-3', key: '6m91ic' }],
] satisfies IconNode;

/** Attributes that tie a native item to the menu library's state; never copied. */
const LIBRARY_ATTRIBUTES = [
  'id',
  'data-highlighted',
  'data-disabled',
  'aria-disabled',
  'aria-haspopup',
  'aria-expanded',
  'aria-controls',
  'data-state',
];

/** Tailwind's `bg-current`: fills a mask-painted icon holder with the text colour. */
const MASK_FILL_CLASS = 'bg-current';
/** An icon holder that paints the native icon itself, through a CSS mask. */
const MASK_PAINTED_ICON = `[style*="mask"], .${MASK_FILL_CLASS}`;

function folderIcon(): SVGSVGElement {
  const svg = createLucideIcon('folder-input', MOVE_ICON_NODE, 20);
  // The menus' own icons are drawn at about 1.5px; Lucide's 2px reads heavier beside them.
  svg.setAttribute('stroke-width', '1.75');
  // The sizing class copied from a native icon may also fill it; a filled line icon is a blob.
  svg.style.setProperty('fill', 'none');
  return svg;
}

/**
 * A native item's look with this entry's icon and label, marked by `attribute`.
 * `strip` names the site's own wiring attributes (its collection or test ids)
 * to drop besides the library's state.
 */
export function buildMenuEntry(
  template: Element,
  label: string,
  attribute: string,
  strip: readonly string[] = [],
): HTMLElement {
  const entry = template.cloneNode(true) as HTMLElement;
  for (const name of [...LIBRARY_ATTRIBUTES, ...strip]) entry.removeAttribute(name);
  entry.setAttribute(attribute, '');
  entry.setAttribute('tabindex', '-1');
  const icon = folderIcon();
  const nativeIcon = entry.querySelector('svg');
  if (nativeIcon) {
    // A native sprite SVG may have no aria-hidden wrapper. Keep its sizing class.
    icon.setAttribute('class', nativeIcon.getAttribute('class') ?? '');
    nativeIcon.replaceWith(icon);
  } else {
    const holder = entry.querySelector(`[aria-hidden="true"], ${MASK_PAINTED_ICON}`);
    if (holder?.matches(MASK_PAINTED_ICON)) {
      // ChatGPT paints the Rename pencil as the holder's own mask; an icon placed inside it is
      // clipped to that pencil, so the holder is replaced and only its sizing classes are kept.
      holder.classList.remove(MASK_FILL_CLASS);
      icon.setAttribute(
        'class',
        `${holder.getAttribute('class') ?? ''} ${icon.getAttribute('class')}`.trim(),
      );
      holder.replaceWith(icon);
    } else if (holder) holder.replaceChildren(icon);
    else entry.prepend(icon);
  }
  const texts: Text[] = [];
  const walker = document.createTreeWalker(entry, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue?.trim() && !icon.contains(node)) texts.push(node as Text);
  }
  if (texts.length === 0) {
    entry.append(label);
  } else {
    // The first text is the label; the rest (a keyboard shortcut) belongs to the template.
    texts[0].nodeValue = label;
    for (const extra of texts.slice(1)) extra.remove();
  }
  return entry;
}

const ACTIVATE_KEYS = new Set(['Enter', ' ']);

function isEnabled(item: Element): boolean {
  return !item.hasAttribute('data-disabled') && item.getAttribute('aria-disabled') !== 'true';
}

function claim(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Arrow keys into and out of the entry. Menu libraries handle them in React
 * handlers delegated to an ancestor, so a listener on the menu itself runs
 * first and can keep the library from moving past the entry. Everything else
 * (Escape, Tab, typeahead) still reaches the library.
 *
 * Returns the removal of the menu's listener. The menu is the site's, and a
 * library may keep it mounted and reuse it for another row: whoever drops the
 * entry (or turns the folders off) calls it, so no listener outlives its entry.
 */
export function wireMenuKeyboard(
  menu: HTMLElement,
  entry: HTMLElement,
  items: () => HTMLElement[],
  activate: () => void,
): () => void {
  const neighbour = (step: 1 | -1): HTMLElement | null => {
    const enabled = items().filter((item) => item === entry || isEnabled(item));
    return enabled[enabled.indexOf(entry) + step] ?? null;
  };
  entry.addEventListener('focus', () => entry.setAttribute('data-highlighted', ''));
  entry.addEventListener('blur', () => entry.removeAttribute('data-highlighted'));
  entry.addEventListener('keydown', (event) => {
    if (ACTIVATE_KEYS.has(event.key)) {
      claim(event);
      activate();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      claim(event);
      neighbour(event.key === 'ArrowDown' ? 1 : -1)?.focus();
    }
  });
  const stepIn = (event: KeyboardEvent): void => {
    if (!entry.isConnected || !(event.target instanceof HTMLElement)) return;
    const from = event.key === 'ArrowDown' ? -1 : event.key === 'ArrowUp' ? 1 : 0;
    if (from === 0 || event.target !== neighbour(from)) return;
    claim(event);
    entry.focus();
  };
  menu.addEventListener('keydown', stepIn);
  return () => menu.removeEventListener('keydown', stepIn);
}

/** Frames to wait for a closed menu to hand focus back to its trigger. */
const CLOSE_WAIT_FRAMES = 30;

/**
 * Runs a move once a closed menu has returned focus to its trigger, which a
 * menu library does a task after unmounting the menu (later still while an
 * exit animation runs). A picker opened before that loses its search box's
 * focus to the trigger. The wait is bounded in case focus never comes back.
 */
export class MenuCloseWait {
  private pending: number | null = null;

  constructor(private readonly doc: Document = document) {}

  run(trigger: HTMLElement, move: () => void): void {
    this.cancel();
    let frames = 0;
    const tick = (): void => {
      this.pending = null;
      frames += 1;
      const settled = this.doc.activeElement === trigger || !trigger.isConnected;
      if (settled || frames >= CLOSE_WAIT_FRAMES) {
        move();
        return;
      }
      this.pending = requestAnimationFrame(tick);
    };
    this.pending = requestAnimationFrame(tick);
  }

  cancel(): void {
    if (this.pending !== null) cancelAnimationFrame(this.pending);
    this.pending = null;
  }
}
