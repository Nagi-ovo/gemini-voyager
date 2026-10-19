/**
 * The "Move to folder" entry a site's own row menu gets: a clone of one of the
 * menu's native items, so it inherits the site's look and hover, with a folder
 * icon and Voyager's label. A menu library's roving focus only knows the items
 * its framework registered, so `wireMenuKeyboard` steps the arrow keys into and
 * out of the entry, and `MenuCloseWait` runs the move once the closed menu has
 * handed focus back to its trigger.
 */

const FOLDER_ICON_PATH =
  'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z';

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

function folderIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 -960 960 960');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', FOLDER_ICON_PATH);
  svg.append(path);
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
    const holder = entry.querySelector('[aria-hidden="true"]');
    if (holder) holder.replaceChildren(icon);
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
 */
export function wireMenuKeyboard(
  menu: HTMLElement,
  entry: HTMLElement,
  items: () => HTMLElement[],
  activate: () => void,
): void {
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
  menu.addEventListener('keydown', (event) => {
    if (!entry.isConnected || !(event.target instanceof HTMLElement)) return;
    const from = event.key === 'ArrowDown' ? -1 : event.key === 'ArrowUp' ? 1 : 0;
    if (from === 0 || event.target !== neighbour(from)) return;
    claim(event);
    entry.focus();
  });
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
