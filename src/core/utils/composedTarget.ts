/**
 * Shadow-root aware event targets.
 *
 * A listener outside a shadow tree sees `event.target` and `document.activeElement`
 * retargeted to the shadow host, so an input inside an extension panel looks like a
 * plain `<div>`. Guards that skip "the user is typing" must read through the host.
 */

/** The element the event was dispatched on, even inside an open shadow root. */
export function composedEventTarget(event: Event): EventTarget | null {
  const [origin] = event.composedPath();
  return origin ?? event.target;
}

/** The focused element, descending through open shadow roots. */
export function deepActiveElement(root: Document | ShadowRoot = document): Element | null {
  let active = root.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

/** The composed target if it is an element, else the deep focused element. */
export function composedTargetElement(event: Event): HTMLElement | null {
  const origin = composedEventTarget(event);
  if (origin instanceof HTMLElement) return origin;
  const active = deepActiveElement();
  return active instanceof HTMLElement ? active : null;
}
