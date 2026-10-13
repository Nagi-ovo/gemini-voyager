/**
 * One conversation page per bundled site for the plugin pair matrix: a user
 * turn with inline math, an answer with a long code block, a formula and a
 * table, and the composer with its send control. Every semantic key the
 * site's plugins read resolves here, so each plugin has something to act on.
 *
 * Shapes follow the live markup the primitives' own tests record (code
 * blocks from `codeCollapse.test.ts`, composers from `sendShortcut.test.ts`).
 * Code blocks are labelled `python` so the diagram primitives scan them
 * without loading a renderer.
 */
import { vi } from 'vitest';

import type { SiteAdapter } from '../../types';

export interface SitePage {
  readonly siteId: string;
  /** Where the page is loaded; each site's test file sets jsdom's URL to it. */
  readonly url: string;
  readonly markup: string;
}

const CODE = 'print(1)\n'.repeat(40);
const TABLE =
  '<table><thead><tr><th>Head</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>';
const FORMULA = '<p>Formula <span class="katex">x</span></p>';
const QUESTION = 'Why is $x^2$ positive?';

function deepseekCodeBlock(source: string): string {
  return (
    '<div class="md-code-block md-code-block-dark"><div class="md-code-block-banner-wrap">' +
    '<div class="md-code-block-banner md-code-block-banner-lite"><div class="_121d384">' +
    '<div class="d2a24f03"><span class="d813de27">python</span></div>' +
    '<div class="d2a24f03 _246a029"><div class="efa13877">' +
    '<div role="button" class="ds-button copy" tabindex="0">Copy</div>' +
    '<div role="button" class="ds-button" tabindex="0">Download</div>' +
    `</div></div></div></div></div><pre><span>${source}</span></pre></div>`
  );
}

const PAGES: Readonly<Record<string, SitePage>> = {
  aistudio: {
    siteId: 'aistudio',
    url: 'https://aistudio.google.com/prompts/abc123',
    markup:
      `<ms-chat-turn><div class="user-prompt-container" data-turn-role="User"><p>${QUESTION}</p></div></ms-chat-turn>` +
      '<ms-chat-turn><div class="model-prompt-container" data-turn-role="Model">' +
      `<p>Answer</p><pre><code>${CODE}</code></pre>${FORMULA}${TABLE}</div></ms-chat-turn>` +
      '<ms-prompt-box><textarea formcontrolname="promptText" aria-label="Prompt">draft</textarea>' +
      '<ms-run-button><button type="button">Run</button></ms-run-button></ms-prompt-box>',
  },
  chatgpt: {
    siteId: 'chatgpt',
    url: 'https://chatgpt.com/c/abc123',
    markup:
      '<div data-app-action-timeline-scroll>' +
      `<article data-message-author-role="user"><div data-user-message-bubble><p>${QUESTION}</p></div></article>` +
      '<div data-chatgpt-selection-message-id="m1"><div class="markdown"><p>Answer</p>' +
      '<div class="contain-inline-size" data-markdown-copy="code-block">' +
      '<div class="flex items-center"><span>python</span>' +
      '<button aria-label="Copy" class="copy">Copy</button></div>' +
      `<div class="overflow-y-auto p-4" dir="ltr"><code>${CODE}</code></div></div>` +
      `${FORMULA}${TABLE}</div></div></div>` +
      '<form><div data-composer-markdown class="ProseMirror" contenteditable="true"><p>draft</p></div>' +
      '<button type="submit">Send</button></form>',
  },
  claude: {
    siteId: 'claude',
    url: 'https://claude.ai/chat/abc123',
    markup:
      '<div data-autoscroll-container="true">' +
      `<div data-testid="user-message"><p>${QUESTION}</p></div>` +
      '<div class="font-claude-message"><p>Answer</p>' +
      `<pre><code>${CODE}</code></pre>${FORMULA}${TABLE}</div></div>` +
      '<div data-composer-card-holder><div>' +
      '<div data-testid="chat-input" class="ProseMirror" contenteditable="true"><p>draft</p></div>' +
      '<button data-testid="chat-input-send">Send</button></div></div>',
  },
  deepseek: {
    siteId: 'deepseek',
    url: 'https://chat.deepseek.com/a/chat/s/abc123',
    markup:
      '<div class="ds-virtual-list ds-scroll-area">' +
      `<div class="ds-message"><div class="ds-collapsible-text"><p>${QUESTION}</p></div></div>` +
      '<div class="ds-message"><div class="ds-think-content"><p>Thinking it through</p></div>' +
      '<div class="ds-markdown ds-assistant-message-main-content"><p>Answer</p>' +
      `${deepseekCodeBlock(CODE)}${FORMULA}${TABLE}</div></div></div>` +
      '<div><div><textarea class="ds-scroll-area">draft</textarea></div>' +
      '<div class="ds-button--primary ds-button--circle" role="button">Send</div></div>',
  },
  gemini: {
    siteId: 'gemini',
    url: 'https://gemini.google.com/app/abc123',
    markup:
      '<user-query><div class="user-query-container"><div class="user-query-bubble-with-background">' +
      `<p class="query-text-line">${QUESTION}</p></div></div></user-query>` +
      '<model-response><message-content><div class="markdown"><p>Answer</p>' +
      '<code-block><div class="formatted-code-block-internal-container">' +
      '<div class="code-block-decoration"><span>python</span>' +
      '<div class="buttons"><button class="copy-button">Copy</button></div></div>' +
      `<pre><code class="code-container" data-test-id="code-content">${CODE}</code></pre>` +
      `</div></code-block>${FORMULA}${TABLE}</div></message-content></model-response>` +
      '<input-area-v2><div class="text-input-field"><rich-textarea>' +
      '<div class="ql-editor" contenteditable="true" role="textbox"><p>draft</p></div></rich-textarea>' +
      '<div class="send-button submit"><button type="button" aria-label="Send">Send</button></div>' +
      '</div></input-area-v2>',
  },
};

export function sitePage(siteId: string): SitePage {
  const page = PAGES[siteId];
  if (!page) throw new Error(`no pair-matrix page for site ${siteId}`);
  return page;
}

/**
 * Loads the page into the jsdom document. jsdom has no layout, so every
 * element reports a visible box (composer lookups skip zero-height fields)
 * and a rendered offset parent (Gemini and AI Studio send-button lookups
 * skip unrendered buttons), and user turns measure taller than any collapse
 * threshold.
 */
export function loadSitePage(page: SitePage, adapter: SiteAdapter): void {
  document.head.replaceChildren();
  document.body.innerHTML = `<main>${page.markup}</main>`;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    bottom: 60,
    left: 0,
    right: 300,
    height: 60,
    width: 300,
    toJSON: () => ({}),
  });
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.isConnected ? document.body : null;
    },
  );
  const userTurn = adapter.selectors.userTurn;
  if (!userTurn) return;
  for (const turn of document.querySelectorAll<HTMLElement>(userTurn)) {
    Object.defineProperty(turn, 'scrollHeight', { configurable: true, get: () => 2000 });
  }
}
