/** Gemini's native Gems entry in the sidebar nav. */
export const GEMS_NAV_ENTRY_SELECTOR = '[data-test-id="gems-side-nav-entry-button"]';

/** Attributes Gemini uses to show or hide one of its mounted sidebar layouts. */
const VISIBILITY_ATTRIBUTES = ['class', 'style', 'hidden', 'aria-hidden'];

export interface GemsAnchor {
  /** The native Gems entry the list was last placed after. */
  entry: HTMLElement | null;
  /** Voyager's injected gems list. */
  list: HTMLElement | null;
  /** Voyager's chevron inside the entry. */
  toggle: HTMLElement | null;
}

function containsGemsEntry(node: Node, anchor: GemsAnchor): boolean {
  if (!(node instanceof Element)) return false;
  if (anchor.entry && node.contains(anchor.entry)) return true;
  return (
    node.matches(GEMS_NAV_ENTRY_SELECTOR) || node.querySelector(GEMS_NAV_ENTRY_SELECTOR) !== null
  );
}

/**
 * Decide whether a sidebar mutation batch could have displaced the injected
 * gems list or chevron, or changed which mounted Gems entry is visible. The
 * observer watches the whole sidebar overflow container, so most batches are
 * Gemini appending conversation rows; those leave the anchor intact and must
 * not trigger the visible-entry lookup, which forces layout with
 * `getBoundingClientRect()`.
 *
 * Uses identity and selector checks only — never geometry. Pure.
 */
export function gemsAnchorMayBeDisturbed(
  mutations: readonly MutationRecord[],
  anchor: GemsAnchor,
): boolean {
  const { entry, list, toggle } = anchor;
  if (!entry || !list || !toggle) return true;
  if (!entry.isConnected || !list.isConnected) return true;
  if (entry.nextElementSibling !== list || toggle.parentElement !== entry) return true;
  for (const mutation of mutations) {
    // Gemini keeps two Gems entries mounted and swaps their visibility
    // (sidebar mode, layout switch) through attributes on them or a container.
    if (mutation.type === 'attributes') {
      if (containsGemsEntry(mutation.target, anchor)) return true;
      continue;
    }
    // A new Gems entry (e.g. Gemini re-rendering its nav or mounting the
    // alternate layout) may now be the visible one.
    for (const node of Array.from(mutation.addedNodes)) {
      if (node instanceof Element && containsGemsEntry(node, { ...anchor, entry: null })) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Watch the sidebar for changes that can displace the gems list: child and
 * visibility-attribute changes under the overflow container, visibility
 * attributes on its ancestors (sidebar mode classes), and viewport resizes
 * (breakpoints that swap layouts through CSS alone). Returns the teardown.
 */
export function watchGemsAnchor(
  overflow: Element,
  getAnchor: () => GemsAnchor,
  onMaybeDisturbed: () => void,
): () => void {
  const observer = new MutationObserver((mutations) => {
    if (gemsAnchorMayBeDisturbed(mutations, getAnchor())) onMaybeDisturbed();
  });
  observer.observe(overflow, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: VISIBILITY_ATTRIBUTES,
  });
  for (let ancestor = overflow.parentElement; ancestor; ancestor = ancestor.parentElement) {
    observer.observe(ancestor, { attributes: true, attributeFilter: VISIBILITY_ATTRIBUTES });
  }
  window.addEventListener('resize', onMaybeDisturbed);
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', onMaybeDisturbed);
  };
}
