/**
 * Adds a shared folder sheet to the page once, as `<style class="…">`. Gemini's
 * folder UI is page DOM, so it loads the same sheets a shadow-rooted site puts
 * in its own shadow root. Like the manifest's content sheet each is static and
 * matches nothing but Voyager's own classes. It follows that sheet in the
 * cascade, so its rules win ties with it. The folders plugin's teardown takes
 * them out again (`removePageSheets`), so turning the folders off leaves the
 * page as it found it.
 */
const added = new Set<string>();

export function ensurePageSheet(className: string, css: string, doc: Document = document): void {
  added.add(className);
  if (doc.head.querySelector(`style.${className}`)) return;
  const style = doc.createElement('style');
  style.className = className;
  style.textContent = css;
  doc.head.appendChild(style);
}

/** Removes every sheet `ensurePageSheet` added to `doc`; the next one shown adds its own again. */
export function removePageSheets(doc: Document = document): void {
  for (const className of added) {
    doc.head.querySelectorAll(`style.${className}`).forEach((style) => style.remove());
  }
}
