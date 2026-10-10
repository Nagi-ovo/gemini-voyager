/**
 * Adds a shared folder sheet to the page once, as `<style class="…">`. Gemini's
 * folder UI is page DOM, so it loads the same sheets a shadow-rooted site puts
 * in its own shadow root. Like the manifest's content sheet each is static,
 * stays for the page's life, and matches nothing but Voyager's own classes. It
 * follows that sheet in the cascade, so its rules win ties with it.
 */
export function ensurePageSheet(className: string, css: string, doc: Document = document): void {
  if (doc.head.querySelector(`style.${className}`)) return;
  const style = doc.createElement('style');
  style.className = className;
  style.textContent = css;
  doc.head.appendChild(style);
}
