/**
 * The element picker: hovering outlines the element under the pointer, a
 * click picks it, Escape or Cancel leaves. While it runs, presses on the page
 * are swallowed in the capture phase so picking a link or a button does not
 * follow or press it. The outline and toolbar live in one Voyager layer whose
 * host lets the pointer through; `stop` removes every listener and the layer.
 */
import { isVoyagerLayerEvent, mountLayerHost } from '@/core/ui/layer';

import { clampPick, isVoyagerElement } from './skeleton';
import { PICKER_CSS, PICKING_CLASS, PICKING_PAGE_CSS } from './styles';

export interface PickerOptions {
  readonly doc: Document;
  readonly labels: { readonly hint: string; readonly cancel: string };
  onPick(element: Element): void;
  onCancel(): void;
}

export interface Picker {
  /** Idempotent; called by the picker itself after a pick or a cancel. */
  stop(): void;
}

/** Events a page could act on during a pick; each is stopped before page listeners see it. */
const SWALLOWED = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'auxclick', 'contextmenu'];

function pageElement(event: Event): Element | null {
  if (isVoyagerLayerEvent(event)) return null;
  const first = event.composedPath()[0];
  if (!(first instanceof Element) || isVoyagerElement(first)) return null;
  const tag = first.tagName.toLowerCase();
  // Outline what the report will describe: a drawing, not a node inside it.
  return tag === 'html' || tag === 'body' ? null : clampPick(first);
}

export function startPicker(options: PickerOptions): Picker {
  const { doc } = options;
  const view = doc.defaultView ?? window;
  const layer = mountLayerHost('popover', PICKER_CSS);
  layer.host.classList.add('gv-site-check-picker');
  const outline = doc.createElement('div');
  outline.className = 'gv-sc-outline';
  outline.hidden = true;
  const tag = doc.createElement('div');
  tag.className = 'gv-sc-tag';
  outline.append(tag);
  const bar = doc.createElement('div');
  bar.className = 'gv-sc-bar';
  bar.setAttribute('role', 'status');
  const hint = doc.createElement('span');
  hint.textContent = options.labels.hint;
  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.textContent = options.labels.cancel;
  bar.append(hint, cancel);
  layer.root.append(outline, bar);
  const pageStyle = doc.createElement('style');
  pageStyle.setAttribute('data-gv-plugin-scope', 'siteCheck');
  pageStyle.textContent = PICKING_PAGE_CSS;
  doc.head.append(pageStyle);
  doc.documentElement.classList.add(PICKING_CLASS);

  const listeners = new AbortController();
  const capture = { capture: true, signal: listeners.signal };
  let hovered: Element | null = null;
  let stopped = false;

  const place = (): void => {
    if (!hovered?.isConnected) {
      outline.hidden = true;
      return;
    }
    const rect = hovered.getBoundingClientRect();
    outline.hidden = false;
    outline.style.left = `${rect.left}px`;
    outline.style.top = `${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    // Only the tag name: class names can be long, and the panel shows the rest.
    tag.textContent = hovered.tagName.toLowerCase();
  };
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    listeners.abort();
    doc.documentElement.classList.remove(PICKING_CLASS);
    pageStyle.remove();
    layer.remove();
  };
  const swallow = (event: Event): void => {
    if (isVoyagerLayerEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  view.addEventListener(
    'pointermove',
    (event) => {
      const target = pageElement(event);
      if (target === hovered) return;
      hovered = target;
      place();
    },
    capture,
  );
  for (const type of SWALLOWED) view.addEventListener(type, swallow, capture);
  view.addEventListener(
    'click',
    (event) => {
      if (isVoyagerLayerEvent(event)) return;
      swallow(event);
      const target = pageElement(event) ?? hovered;
      if (!target) return;
      stop();
      options.onPick(target);
    },
    capture,
  );
  view.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      stop();
      options.onCancel();
    },
    capture,
  );
  view.addEventListener('scroll', place, {
    capture: true,
    passive: true,
    signal: listeners.signal,
  });
  view.addEventListener('resize', place, { signal: listeners.signal });
  cancel.addEventListener(
    'click',
    () => {
      stop();
      options.onCancel();
    },
    { signal: listeners.signal },
  );
  cancel.focus({ preventScroll: true });
  return { stop };
}
