import { afterEach, describe, expect, it } from 'vitest';

import { DeclarativeEngine } from '../runtime/declarativeEngine';
import { chatgptAdapter } from '../sites/adapters/chatgpt';
import { claudeAdapter } from '../sites/adapters/claude';
import type { PluginManifest, SiteAdapter } from '../types';
import { BundledCatalogPluginSource } from './BundledCatalogPluginSource';

const OFF = {
  fontSizeEnabled: false,
  fontSize: 100,
  spacingEnabled: false,
  lineHeight: 160,
  paragraphSpacing: 16,
};

/** Answer prose shared by both hosts; `codeBlock` is the host's own block markup. */
const prose = (codeBlock: string) =>
  '<p id="first">First</p>' +
  '<p id="inline">Run <code id="inline-code">bun test</code> for <span class="katex">x</span></p>' +
  '<ul><li id="item">Item<ul><li id="nested">Nested</li></ul></li>' +
  '<li id="loose"><p id="loose-p">Loose</p></li></ul>' +
  '<p id="block-math"><span class="katex-display"><span class="katex">y</span></span></p>' +
  codeBlock +
  '<table><thead><tr><th id="head">Head</th></tr></thead><tbody><tr><td id="cell">' +
  '<p id="cell-p">Cell</p><table><tbody><tr><td id="inner-cell">Inner</td></tr></tbody></table>' +
  '</td></tr></tbody></table>' +
  '<p id="last">Last</p>';

interface Host {
  name: string;
  id: string;
  className: string;
  adapter: SiteAdapter;
  /** The answer element's own class, restored after unmount. */
  answerClass: string;
  page: string;
}

const hosts: Host[] = [
  {
    name: 'ChatGPT',
    id: 'voyager.chatgpt-reading-typography',
    className: 'gv-plugin-chatgpt-reading-typography',
    adapter: chatgptAdapter,
    answerClass: '',
    page:
      '<div contenteditable="true" id="prompt-textarea"><p id="composer">Draft</p></div>' +
      '<div data-turn-key="t1">' +
      '<div data-user-message-bubble="true"><p id="user">User</p></div>' +
      '<div id="answer" data-chatgpt-selection-message-id="m1" data-gv-spacing="host">' +
      '<div class="markdown">' +
      prose(
        '<div data-markdown-copy="code-block"><div data-markdown-copy="exclude">python</div>' +
          '<div><code id="code"><span>print(1)</span></code><p id="code-p">x</p></div></div>' +
          '<pre><code id="pre-code">legacy</code></pre>',
      ) +
      '</div></div></div>',
  },
  {
    name: 'Claude',
    id: 'voyager.claude-reading-typography',
    className: 'gv-plugin-claude-reading-typography',
    adapter: claudeAdapter,
    answerClass: 'font-claude-message',
    page:
      '<div contenteditable="true" class="ProseMirror"><p id="composer">Draft</p></div>' +
      '<div data-testid="user-message"><p id="user">User</p></div>' +
      '<div id="answer" class="font-claude-message" data-gv-spacing="host">' +
      '<div class="standard-markdown">' +
      prose(
        '<div class="relative group/copy"><div class="text-text-500">python</div>' +
          '<div class="overflow-x-auto"><pre class="code-block__code">' +
          '<code id="code">print(1)</code></pre></div></div>',
      ) +
      '</div></div>',
  },
];

// jsdom leaves var() unresolved; the plugin sets its variables on <body>, and
// the line ratio on the scoped answer.
const applied = (id: string, property: string) =>
  getComputedStyle(document.getElementById(id)!)
    .getPropertyValue(property)
    .replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_, name: string, fallback = '') => {
      const answer = document.getElementById('answer');
      return (
        document.body.style.getPropertyValue(name) ||
        (answer ? getComputedStyle(answer).getPropertyValue(name).trim() : '') ||
        fallback
      );
    });

async function loadManifest(id: string): Promise<PluginManifest> {
  const manifest = (await new BundledCatalogPluginSource().list()).find((m) => m.id === id);
  if (!manifest) throw new Error(`Missing ${id}`);
  return manifest;
}

async function mountPage(host: Host, settings: typeof OFF, page = host.page) {
  document.body.innerHTML = page;
  const engine = new DeclarativeEngine({ doc: document, adapter: host.adapter });
  engine.mount(await loadManifest(host.id), settings);
  return engine;
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
});

describe.each(hosts)('$name reading typography', (host) => {
  it('leaves answers native while both switches are off', async () => {
    const engine = await mountPage(host, OFF);
    try {
      for (const id of ['first', 'inline', 'item', 'head', 'last']) {
        expect(applied(id, 'font-size'), id).toBe('');
        expect(applied(id, 'line-height'), id).toBe('');
        expect(applied(id, 'margin-block-end'), id).toBe('');
      }
    } finally {
      engine.unmountAll();
    }
  });

  it('sizes answer paragraphs and list items, with inline code following the text', async () => {
    const engine = await mountPage(host, { ...OFF, fontSizeEnabled: true, fontSize: 125 });
    try {
      for (const id of ['first', 'inline', 'item', 'last']) {
        expect(applied(id, 'font-size'), id).toBe('125%');
        // A unitless ratio, so a fixed native line box grows with the text.
        expect(Number(applied(id, 'line-height')), id).toBeGreaterThan(1);
      }
      expect(applied('inline-code', 'font-size')).toBe('');
    } finally {
      engine.unmountAll();
    }
  });

  it('does not compound the size on nested list items or loose-list paragraphs', async () => {
    const engine = await mountPage(host, { ...OFF, fontSizeEnabled: true, fontSize: 150 });
    try {
      expect(applied('item', 'font-size')).toBe('150%');
      expect(applied('nested', 'font-size')).toBe('');
      expect(applied('loose-p', 'font-size')).toBe('');
    } finally {
      engine.unmountAll();
    }
  });

  it('sizes table text with the answer without compounding nested tables', async () => {
    const engine = await mountPage(host, { ...OFF, fontSizeEnabled: true, fontSize: 125 });
    try {
      expect(applied('head', 'font-size')).toBe('125%');
      expect(applied('cell', 'font-size')).toBe('125%');
      expect(applied('cell-p', 'font-size')).toBe('');
      expect(applied('inner-cell', 'font-size')).toBe('');
    } finally {
      engine.unmountAll();
    }
  });

  it('keeps code blocks, block formulas, user messages and the composer native', async () => {
    const engine = await mountPage(host, {
      ...OFF,
      fontSizeEnabled: true,
      fontSize: 150,
      spacingEnabled: true,
      lineHeight: 200,
    });
    try {
      const native = ['block-math', 'code', 'user', 'composer'];
      if (document.getElementById('code-p')) native.push('code-p', 'pre-code');
      for (const id of native) {
        expect(applied(id, 'font-size'), id).toBe('');
        expect(applied(id, 'line-height'), id).toBe('');
      }
    } finally {
      engine.unmountAll();
    }
  });

  it('still applies when the host wraps the thread in a list', async () => {
    const engine = await mountPage(
      host,
      { ...OFF, fontSizeEnabled: true, fontSize: 125, spacingEnabled: true, paragraphSpacing: 8 },
      `<ol><li>${host.page}</li></ol>`,
    );
    try {
      expect(applied('first', 'font-size')).toBe('125%');
      expect(applied('head', 'font-size')).toBe('125%');
      expect(applied('inline', 'margin-block-end')).toBe('8px');
      expect(applied('nested', 'font-size')).toBe('');
    } finally {
      engine.unmountAll();
    }
  });

  it('spaces paragraphs evenly without adding space at the answer edges', async () => {
    const engine = await mountPage(host, {
      ...OFF,
      spacingEnabled: true,
      lineHeight: 180,
      paragraphSpacing: 8,
    });
    try {
      expect(applied('inline', 'line-height')).toBe('calc(180 / 100)');
      expect(applied('inline', 'font-size')).toBe('');
      expect(applied('inline', 'margin-block-start')).toBe('8px');
      expect(applied('inline', 'margin-block-end')).toBe('8px');
      expect(applied('first', 'margin-block-start')).toBe('');
      expect(applied('last', 'margin-block-end')).toBe('');
      expect(applied('loose-p', 'margin-block-end')).toBe('');
    } finally {
      engine.unmountAll();
    }
  });

  it('restores host attributes, body style and markup after each unmount', async () => {
    const manifest = await loadManifest(host.id);
    document.body.innerHTML = host.page;
    document.body.setAttribute('style', 'color: red;');
    const engine = new DeclarativeEngine({ doc: document, adapter: host.adapter });
    const answer = document.getElementById('answer')!;
    const markup = answer.innerHTML;
    try {
      for (let cycle = 0; cycle < 2; cycle++) {
        engine.mount(manifest, OFF);
        expect(answer.classList.contains(host.className)).toBe(true);
        expect(answer.getAttribute('data-gv-spacing')).toBe('false');
        engine.updateSettings(host.id, { ...OFF, fontSizeEnabled: true, fontSize: 90 });
        expect(applied('first', 'font-size')).toBe('90%');
        engine.unmount(host.id);
        expect(answer.className).toBe(host.answerClass);
        expect(answer.getAttribute('data-gv-spacing')).toBe('host');
        expect(answer.hasAttribute('data-gv-font-size')).toBe(false);
        expect(answer.innerHTML).toBe(markup);
        expect(document.body.getAttribute('style')).toBe('color: red;');
        expect(document.getElementById('gv-plugin-style-' + host.id)).toBeNull();
        expect(applied('first', 'font-size')).toBe('');
      }
    } finally {
      engine.unmountAll();
    }
  });
});
