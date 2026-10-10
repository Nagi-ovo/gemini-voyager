import katexCssUrl from 'katex/dist/katex.min.css?url';

const KATEX_STYLES_ID = 'gv-katex-styles';

/** Shared by lazy math renderers; retained for the lifetime of their document. */
export function ensureKatexStyles(): void {
  if (document.getElementById(KATEX_STYLES_ID)) return;
  const link = document.createElement('link');
  link.id = KATEX_STYLES_ID;
  link.rel = 'stylesheet';
  // Image export reads these font-face rules to embed the fonts in its output.
  link.crossOrigin = 'anonymous';
  // Content-script CSS resolves font URLs against the page; a linked extension stylesheet does not.
  link.href = chrome.runtime.getURL(katexCssUrl.replace(/^\//, ''));
  document.head.appendChild(link);
}
