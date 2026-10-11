/**
 * The text a copy button copies: what the user sees in the element, line
 * breaks included, without Voyager's own controls inside it.
 *
 * Voyager's controls are the `gv-` shadow hosts and buttons it builds (table
 * toolbars, diagram panels, code collapse toggles, other copy buttons). Not
 * every `gv-` element: primitives and plugins also stamp `gv-` classes on the
 * host's own content (a collapsed code block's `pre`), and that text belongs
 * in the copy.
 */
const GV_CLASS = '[class^="gv-"], [class*=" gv-"]';
const CONTROL = 'button, [role="button"]';

function isVoyagerControl(element: Element): boolean {
  return element.matches(GV_CLASS) && (element.shadowRoot !== null || element.matches(CONTROL));
}

function voyagerControls(element: HTMLElement): HTMLElement[] {
  return Array.from(element.querySelectorAll<HTMLElement>('*')).filter(isVoyagerControl);
}

/** Text content outside `skip`, for a DOM that does not lay out (no `innerText`). */
function textOutside(node: Node, skip: ReadonlySet<Element>): string {
  let text = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) text += (child as Text).data;
    else if (child instanceof Element && !skip.has(child)) text += textOutside(child, skip);
  }
  return text;
}

export function copyableText(element: HTMLElement): string {
  const controls = voyagerControls(element);
  if (typeof element.innerText !== 'string') {
    return textOutside(element, new Set(controls)).trim();
  }
  // Hidden only for this synchronous read: nothing paints before the styles go back.
  const styles = controls.map((control) => control.getAttribute('style'));
  controls.forEach((control) => control.style.setProperty('display', 'none', 'important'));
  try {
    return element.innerText.trim();
  } finally {
    controls.forEach((control, index) => {
      const style = styles[index];
      if (style === null) control.removeAttribute('style');
      else control.setAttribute('style', style);
    });
  }
}
