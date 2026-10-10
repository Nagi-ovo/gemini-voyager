/**
 * The Navigation API's `window.navigation`, or null where the browser lacks it
 * (Chrome and Edge before 102, Firefox before 147, Safari before 26.2).
 *
 * "Continue in ChatGPT / Claude" fills a composer only while the tab has never
 * left the new chat, and only the Navigation API reports every same-document
 * navigation as it happens, including the page's own `pushState` from the main
 * world. A polling route watcher can miss a quick `/` → `/c/A` → `/` round
 * trip, so without this API the handoff does not run: the Gemini tab takes the
 * clipboard path, and the receiver refuses. Support is a property of the
 * browser, so both tabs reach the same answer.
 */
export function navigationApi(win: Window = window): EventTarget | null {
  const navigation = (win as { navigation?: unknown }).navigation;
  return navigation && typeof (navigation as EventTarget).addEventListener === 'function'
    ? (navigation as EventTarget)
    : null;
}
