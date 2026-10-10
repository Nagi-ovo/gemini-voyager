/**
 * Whether a turn is part of the page the user sees. ChatGPT keeps the
 * conversations opened before in the DOM and hides each one with
 * `display: none`, so "connected" is not "on screen": the rail and the
 * ownership rules skip turns under a hidden ancestor.
 */

/**
 * A check for one pass over the DOM: ancestors already decided are cached, so
 * many turns of one thread cost one walk up the tree.
 */
export function renderedCheck(): (element: Element) => boolean {
  const known = new Map<Element, boolean>();
  return (element) => {
    if (!element.isConnected) return false;
    const path: Element[] = [];
    let rendered = true;
    for (let node: Element | null = element; node; node = node.parentElement) {
      const cached = known.get(node);
      if (cached !== undefined) {
        rendered = cached;
        break;
      }
      path.push(node);
      // Computed, not the `hidden` attribute: author CSS may display a [hidden] node.
      if (getComputedStyle(node).display === 'none') {
        rendered = false;
        break;
      }
    }
    // Every node on the path sits under the node that decided.
    for (const node of path) known.set(node, rendered);
    return rendered;
  };
}

const DISPLAY_NONE = /(?:^|;)\s*display\s*:\s*none\b/i;

/** Whether an attribute mutation shows or hides its target. */
export function togglesVisibility(record: MutationRecord): boolean {
  const target = record.target;
  if (record.type !== 'attributes' || !(target instanceof Element)) return false;
  if (record.attributeName === 'hidden') {
    return (record.oldValue !== null) !== target.hasAttribute('hidden');
  }
  if (record.attributeName === 'style') {
    const was = DISPLAY_NONE.test(record.oldValue ?? '');
    return was !== DISPLAY_NONE.test(target.getAttribute('style') ?? '');
  }
  return false;
}
