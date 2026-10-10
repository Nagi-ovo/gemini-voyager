import { isRendered } from '@/pages/content/export/adapter/chatgptThread';

/**
 * Whether a composer candidate can take input: rendered (ChatGPT keeps the
 * page it leaves, composer and draft included, under a `display: none`
 * ancestor), not hidden from assistive tech and not disabled.
 */
function isUsableComposer(candidate: HTMLElement): boolean {
  return (
    isRendered(candidate) &&
    !candidate.matches('[hidden], [aria-hidden="true"], [aria-disabled="true"]') &&
    !candidate.closest('[hidden], [inert], [aria-hidden="true"]')
  );
}

/**
 * The last usable candidate with a size, else the last usable one: a
 * zero-size rect then only means no layout yet, never a hidden page's composer.
 */
export function pickComposer(candidates: readonly HTMLElement[]): HTMLElement | null {
  const usable = candidates.filter(isUsableComposer);
  for (let index = usable.length - 1; index >= 0; index -= 1) {
    const rect = usable[index].getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return usable[index];
  }
  return usable[usable.length - 1] || null;
}
