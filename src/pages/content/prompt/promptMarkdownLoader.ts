/**
 * Markdown + KaTeX rendering for Prompt Manager previews.
 *
 * marked-katex-extension pulls in the ~265 KB KaTeX chunk, so marked, KaTeX
 * and DOMPurify load on the first render rather than at startup: a page where
 * the panel is never opened never fetches them. The loaded renderer is shared
 * by every render after that.
 */
import type { marked as MarkedFn } from 'marked';

import { ensureKatexStyles } from '@/core/utils/katexStyles';
import { renderPromptHtmlAsText } from '@/features/prompt/model/promptMarkdown';

interface MarkdownRenderer {
  marked: typeof MarkedFn;
  sanitize: (html: string) => string;
}

let rendererReady: Promise<MarkdownRenderer> | null = null;

function loadRenderer(): Promise<MarkdownRenderer> {
  ensureKatexStyles();
  if (!rendererReady) {
    rendererReady = (async () => {
      const [markedModule, katexModule, domPurifyModule] = await Promise.all([
        import('marked'),
        import('marked-katex-extension'),
        import('dompurify'),
      ]);
      const marked = markedModule.marked;
      const { default: markedKatex } = katexModule;
      const DOMPurify = domPurifyModule.default;
      try {
        // markdown config: single newlines as <br> and KaTeX inline/display math
        marked.use(
          markedKatex({
            throwOnError: false,
            output: 'html',
            trust: true, // Trust the rendering environment (content script context)
            strict: false, // Disable strict mode checks including quirks mode detection
          }),
        );
        renderPromptHtmlAsText(marked);
        marked.setOptions({ breaks: true });
      } catch {}
      return { marked, sanitize: (html: string) => DOMPurify.sanitize(html) };
    })();
  }
  return rendererReady;
}

/**
 * Renders `text` as sanitized HTML, safe to assign to `innerHTML`.
 * Rejects when the renderer cannot be loaded or the text cannot be parsed;
 * callers keep their plain-text fallback then.
 */
export async function renderPromptMarkdown(text: string): Promise<string> {
  const { marked, sanitize } = await loadRenderer();
  return sanitize(await marked.parse(text));
}

/**
 * Silences the KaTeX warnings a content script triggers by running in the host
 * page's quirks-mode document. Every other console warning passes through.
 */
export function installKatexWarningFilter(): void {
  const originalWarn = console.warn;
  console.warn = function (...args) {
    const message = args[0];
    if (
      typeof message === 'string' &&
      (message.includes("KaTeX doesn't work in quirks mode") ||
        message.includes('unicodeTextInMathMode') ||
        message.includes('LaTeX-incompatible input and strict mode'))
    ) {
      return;
    }
    return originalWarn.apply(console, args);
  };
}
