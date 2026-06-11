/**
 * Usage observer loader — a tiny isolated-world content script that runs at
 * `document_start` and injects the MAIN-world `usage-observer.js` as early as
 * possible, before Gemini's Angular bundle bootstraps and fires the eager
 * `/usage` metrics RPC.
 *
 * This is its own content-script entry (not part of the main bundle) precisely
 * so it can run at document_start; the main content script runs at the default
 * document_idle, which is far too late to hook that bootstrap request. Mirrors
 * the runtime `<script>`-injection pattern used by response-complete-observer,
 * just earlier in the page lifecycle. Cross-browser (no manifest `world: MAIN`
 * needed, so it works on the Firefox floor too).
 *
 * Degrades silently: if injection throws (extension context invalidated, CSP),
 * the feature simply falls back to its DOM-scrape path with no silent refresh.
 */
try {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('usage-observer.js');
  script.async = false;
  (document.documentElement || document.head || document.body).appendChild(script);
  script.remove();
} catch {
  // No-op: the usage status pill still works via DOM scraping on /usage.
}
