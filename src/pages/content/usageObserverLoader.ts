/**
 * Usage observer loader — a tiny isolated-world content script that runs at
 * `document_start` and injects MAIN-world observer scripts as early as
 * possible, before Gemini's Angular bundle bootstraps and fires its eager
 * bootstrap RPCs (the `/usage` metrics RPC, the conversation-load RPC).
 *
 * Gemini saves its own references to `fetch`/`XMLHttpRequest` during
 * bootstrap, so hooks installed any later never see those requests. This is
 * its own content-script entry (not part of the main bundle) precisely so it
 * can run at document_start; the main content script runs at the default
 * document_idle, which is far too late. Mirrors the runtime
 * `<script>`-injection pattern used by response-complete-observer, just
 * earlier in the page lifecycle. Cross-browser (no manifest `world: MAIN`
 * needed, so it works on the Firefox floor too).
 *
 * Degrades silently: if injection throws (extension context invalidated,
 * CSP), usage falls back to its DOM-scrape path and message timestamps fall
 * back to first-seen recording.
 */
for (const src of ['usage-observer.js', 'conversation-history-observer.js']) {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(src);
    script.async = false;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  } catch {
    // No-op: each feature has its own degraded path.
  }
}
