/**
 * Canvas Document Extractor
 *
 * Detects Canvas documents associated with conversation assistant responses,
 * and extracts their full content from the DOM.
 *
 * Supports two Canvas types:
 *   - Document Canvas: content in <immersive-editor> .ProseMirror (HTML → Markdown)
 *   - Code/App Canvas: content in <code-immersive-panel> xap-code-editor .view-lines (code lines)
 */

import { convertCanvasDomToMarkdown } from '../canvasExport/markdownConverter';
import type { CanvasDoc } from '../../../features/export/types/export';

/**
 * Check whether any Canvas panel is open in the document.
 */
export function isAnyCanvasOpen(): boolean {
  return !!(
    document.querySelector('immersive-editor') ||
    document.querySelector('code-immersive-panel')
  );
}

// ── Document Canvas (immersive-editor .ProseMirror) ────────────────

function findAllImmersiveEditors(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('immersive-editor'));
}

function extractProseMirrorContent(editor: HTMLElement): string | null {
  const proseMirror = editor.querySelector<HTMLElement>('.ProseMirror');
  if (!proseMirror) return null;
  const markdown = convertCanvasDomToMarkdown(proseMirror).trim();
  return markdown || null;
}

function findProseMirrorTitle(editor: HTMLElement): string {
  const titleSelectors: Array<{ selector: string; attr?: string }> = [
    { selector: '[data-test-id="canvas-title"]' },
    { selector: '.canvas-title' },
    { selector: '.immersive-editor-header h1' },
    { selector: '.immersive-editor-title' },
    { selector: 'h1' },
    { selector: 'h2' },
    { selector: 'input[aria-label*="title" i]', attr: 'value' },
    { selector: 'textarea[aria-label*="title" i]', attr: 'value' },
  ];
  for (const { selector, attr } of titleSelectors) {
    const el = editor.querySelector<HTMLElement>(selector);
    const text = (attr ? (el as HTMLInputElement)?.value : el?.textContent)?.trim();
    if (text) return text;
  }
  return '';
}

function extractDocumentCanvasDocs(): CanvasDoc[] {
  const editors = findAllImmersiveEditors();
  const docs: CanvasDoc[] = [];

  for (const editor of editors) {
    const content = extractProseMirrorContent(editor);
    if (!content) continue;

    const title = findProseMirrorTitle(editor) || 'Canvas Document';
    docs.push({ title, content });
  }

  return docs;
}

// ── Code / App Canvas (code-immersive-panel → xap-code-editor → Monaco .view-lines) ───

/**
 * Find the first code-immersive-panel in the document.
 * App Canvas wraps it inside <immersive-panel>, so query by tag directly.
 */
function findCodeImmersivePanel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('code-immersive-panel');
}

/**
 * Extract code content from Monaco editor's .view-lines.
 * Each .view-line holds one line of code; join them with \n to preserve line breaks.
 */
function extractCodeContent(): string | null {
  const linesContainer = document.querySelector<HTMLElement>(
    'code-immersive-panel .view-lines',
  );
  if (!linesContainer) return null;

  const lines = linesContainer.querySelectorAll<HTMLElement>('.view-line');
  if (lines.length === 0) return null;

  const code = Array.from(lines)
    .map((line) => line.textContent?.trimEnd() || '')
    .join('\n')
    .trim();

  return code || null;
}

/**
 * Find the Canvas title from code-immersive-panel toolbar.
 * The title is in an h2.title-text element.
 */
function findCodeCanvasTitle(panel: HTMLElement): string {
  const titleEl = panel.querySelector<HTMLElement>('h2.title-text');
  return titleEl?.textContent?.trim() || '';
}

/**
 * Detect language from Monaco editor's data-mode-id attribute.
 */
function detectCodeLanguage(): string {
  const editor = document.querySelector<HTMLElement>(
    'code-immersive-panel .xap-monaco-container',
  );
  const lang = editor?.getAttribute('data-mode-id') || '';
  return lang;
}

function extractCodeCanvasDocs(): CanvasDoc[] {
  const panel = findCodeImmersivePanel();
  if (!panel) return [];

  const content = extractCodeContent();
  if (!content) return [];

  const rawTitle = findCodeCanvasTitle(panel);
  const lang = detectCodeLanguage();
  const title = rawTitle || (lang ? `${lang} Code` : 'Code Canvas');

  // Prepend language annotation as first line so formatted output shows it
  const annotatedContent = lang
    ? `// ${lang.toUpperCase()}\n${content}`
    : content;

  return [{ title, content: annotatedContent }];
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Extract all Canvas documents currently open in the DOM.
 * Supports Document Canvas (ProseMirror) and Code/App Canvas (Monaco editor).
 */
export function extractAllCanvasDocs(): CanvasDoc[] {
  const docs: CanvasDoc[] = [];

  // 1. Document Canvas — content in ProseMirror
  docs.push(...extractDocumentCanvasDocs());

  // 2. Code / App Canvas — content in Monaco editor
  docs.push(...extractCodeCanvasDocs());

  return docs;
}

// ── Detection helpers ──────────────────────────────────────────────

const CANVAS_DOC_INDICATORS: string[] = [
  'immersive-entry-chip',
  'canvas-create-button',
  '[class*="canvas"]',
];

/**
 * Check if an assistant response element contains a reference to a Canvas document.
 */
export function assistantHasCanvasDoc(assistantElement: HTMLElement): boolean {
  for (const indicator of CANVAS_DOC_INDICATORS) {
    try {
      if (assistantElement.querySelector(indicator)) return true;
    } catch {
      continue;
    }
  }
  return false;
}
