import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LONG_CODE_BLOCK_MIN_LINES } from '@/pages/content/codeBlockCollapse/engine';
import { setCachedLanguage } from '@/utils/i18n';

import { requireBundledSiteAdapter } from '../../catalog/sites';
import manifest from '../../catalog/sites/deepseek/plugins/code-collapse/plugin.json';
import { PluginScope } from '../../runtime/pluginScope';
import type { SiteAdapter } from '../../types';
import type { PrimitiveContext } from '../types';
import { type CodeCollapseParams, codeCollapsePrimitive } from './index';

const lines = (count: number, prefix = 'line') =>
  Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`).join('\n');
const LONG = lines(LONG_CODE_BLOCK_MIN_LINES);

/**
 * DeepSeek's answer code block as measured live in October 2026: a sticky
 * banner with the language and its copy / download buttons (`div[role=button]`
 * in a hashed-class row), then a `pre` with highlighted spans and no `code`.
 */
function deepseekBlock(source: string): string {
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

function deepseekReply(...sources: string[]): HTMLElement {
  const reply = document.createElement('div');
  reply.className = 'ds-message';
  reply.innerHTML =
    '<div class="ds-think-content">' +
    deepseekBlock(LONG) +
    '</div><div class="ds-markdown ds-assistant-message-main-content"><p>Here:</p>' +
    sources.map(deepseekBlock).join('') +
    '</div>';
  document.querySelector('main')!.append(reply);
  return reply;
}

/** ChatGPT's reply code block as of October 2026: no `pre`, the code sits in a scroller. */
function chatgptReply(...sources: string[]): HTMLElement {
  const reply = document.createElement('div');
  reply.setAttribute('data-chatgpt-selection-message-id', `m${document.body.children.length}`);
  reply.innerHTML =
    '<div class="markdown">' +
    sources
      .map(
        (source) =>
          '<div class="contain-inline-size" data-markdown-copy="code-block">' +
          '<div class="flex items-center"><span>python</span>' +
          '<button aria-label="Copy" class="copy">Copy</button></div>' +
          `<div class="overflow-y-auto p-4" dir="ltr"><code>${source}</code></div></div>`,
      )
      .join('') +
    '</div>';
  document.querySelector('main')!.append(reply);
  return reply;
}

const deepseekParams = manifest.contributes.domOps[0].params as CodeCollapseParams;
const sites = [
  {
    name: 'DeepSeek',
    adapter: requireBundledSiteAdapter('deepseek'),
    params: deepseekParams,
    reply: deepseekReply,
    code: 'pre',
  },
  {
    name: 'ChatGPT',
    adapter: requireBundledSiteAdapter('chatgpt'),
    params: { code: '.overflow-y-auto', action: 'button' },
    reply: chatgptReply,
    code: '.overflow-y-auto',
  },
];
const [deepseek] = sites;

let scope: PluginScope;

function activate(adapter: SiteAdapter, params: CodeCollapseParams) {
  let counter: () => number = () => -1;
  const context: PrimitiveContext = {
    doc: document,
    adapter,
    pluginId: 'test.code-collapse',
    settings: {},
    setTargetCounter: (count) => (counter = count),
  };
  void codeCollapsePrimitive.activate(scope, params, context);
  return { count: () => counter() };
}

const blocksOf = (reply: Element, adapter: SiteAdapter) =>
  Array.from(reply.querySelectorAll<HTMLElement>(adapter.selectors.codeBlock!)).filter(
    (block) => !block.closest('.ds-think-content'),
  );
const toggleOf = (block: Element) =>
  block.querySelector<HTMLButtonElement>('.gv-code-block-toggle');
const collapsed = (block: Element) => block.classList.contains('gv-code-block-collapsed');
const bar = () => document.querySelector<HTMLElement>('.gv-code-collapse-all');
const barButton = (label: string) =>
  bar()?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? null;

beforeEach(() => {
  vi.useFakeTimers();
  document.head.replaceChildren();
  document.body.innerHTML = '<main></main>';
  scope = new PluginScope();
});

afterEach(async () => {
  await scope.dispose();
  setCachedLanguage('en');
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('codeCollapse primitive', () => {
  it('accepts only optional selectors', () => {
    expect(codeCollapsePrimitive.validateParams(undefined)).toEqual({ success: true, data: {} });
    const params = { codeBlock: '.md-code-block', code: 'pre', action: '[role="button"]' };
    expect(codeCollapsePrimitive.validateParams(params)).toEqual({ success: true, data: params });
    for (const raw of [null, [], { code: ' ' }, { action: 1 }, { thresholdLines: 20 }]) {
      expect(codeCollapsePrimitive.validateParams(raw).success).toBe(false);
    }
  });

  it.each(sites)('a long $name code block collapses and expands', (site) => {
    const reply = site.reply(LONG);
    const [block] = blocksOf(reply, site.adapter);
    const code = block.querySelector(site.code)!;
    const copy = block.querySelector('.copy')!;
    const { count } = activate(site.adapter, site.params);

    const toggle = toggleOf(block)!;
    expect(collapsed(block)).toBe(true);
    expect(code.classList.contains('gv-code-block-clip')).toBe(true);
    // The toggle joins the host's own button row, next to the copy button.
    expect(toggle.parentElement).toBe(copy.parentElement);
    expect(toggle.getAttribute('aria-label')).toBe('Expand');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.querySelector('svg')).not.toBeNull();

    toggle.click();
    expect(collapsed(block)).toBe(false);
    expect(toggle.getAttribute('aria-label')).toBe('Collapse');
    toggle.click();
    expect(collapsed(block)).toBe(true);
    expect(code.textContent).toBe(LONG);
    expect(count()).toBe(1);
  });

  it('leaves short answers, thinking and other page code alone', () => {
    const reply = deepseekReply(lines(3));
    document.body.insertAdjacentHTML('beforeend', `<aside>${deepseekBlock(LONG)}</aside>`);
    activate(deepseek.adapter, deepseek.params);

    expect(document.querySelectorAll('.gv-code-block-toggle')).toHaveLength(0);
    expect(reply.querySelector('.ds-think-content .gv-code-block-collapsible')).toBeNull();
    expect(document.head.querySelector('style')).not.toBeNull();
  });

  it.each(sites)(
    'a streaming $name block collapses once it crosses the threshold',
    async (site) => {
      const reply = site.reply(lines(3));
      const [block] = blocksOf(reply, site.adapter);
      activate(site.adapter, site.params);
      expect(toggleOf(block)).toBeNull();

      const code = block.querySelector(site.code)!;
      code.append(document.createTextNode('\n' + lines(LONG_CODE_BLOCK_MIN_LINES, 'more')));
      await vi.runAllTimersAsync();

      expect(collapsed(block)).toBe(true);
      expect(toggleOf(block)).not.toBeNull();
    },
  );

  it('an expanded block stays expanded while the reply streams and the host swaps its pre', async () => {
    const reply = deepseekReply(LONG);
    const [block] = blocksOf(reply, deepseek.adapter);
    activate(deepseek.adapter, deepseek.params);
    toggleOf(block)!.click();

    block.querySelector('pre')!.append('\nstill streaming');
    await vi.runAllTimersAsync();
    // Highlighting replaces the pre: the state lives on the block, so it holds.
    const pre = document.createElement('pre');
    pre.textContent = LONG + '\nhighlighted';
    block.querySelector('pre')!.replaceWith(pre);
    await vi.runAllTimersAsync();

    expect(collapsed(block)).toBe(false);
    expect(block.querySelectorAll('.gv-code-block-toggle')).toHaveLength(1);
    expect(pre.classList.contains('gv-code-block-clip')).toBe(true);
  });

  it('expand all and collapse all act on every block from a bar before the first one', async () => {
    const later = deepseekReply(LONG);
    activate(deepseek.adapter, deepseek.params);
    expect(bar()).toBeNull();

    // A block that arrives later but sits earlier in the page takes the bar.
    const earlier = deepseekReply(LONG);
    document.querySelector('main')!.prepend(earlier);
    await vi.runAllTimersAsync();
    const blocks = [...blocksOf(earlier, deepseek.adapter), ...blocksOf(later, deepseek.adapter)];
    expect(bar()!.nextElementSibling).toBe(blocks[0]);
    expect(barButton('Collapse all code blocks')!.disabled).toBe(true);

    barButton('Expand all code blocks')!.click();
    expect(blocks.map(collapsed)).toEqual([false, false]);
    expect(barButton('Expand all code blocks')!.disabled).toBe(true);

    // A long block that turns up after "expand all" follows it.
    const next = deepseekReply(LONG);
    await vi.runAllTimersAsync();
    expect(collapsed(blocksOf(next, deepseek.adapter)[0])).toBe(false);

    barButton('Collapse all code blocks')!.click();
    expect(document.querySelectorAll('.gv-code-block-collapsed')).toHaveLength(3);
  });

  it('turning the plugin off restores every block exactly', async () => {
    deepseekReply(LONG, lines(2));
    deepseekReply(LONG);
    const before = { head: document.head.innerHTML, body: document.body.innerHTML };
    activate(deepseek.adapter, deepseek.params);
    expect(bar()).not.toBeNull();

    // Unmount pays everything back in one synchronous step.
    void scope.dispose();

    expect(document.body.innerHTML).toBe(before.body);
    expect(document.head.innerHTML).toBe(before.head);
    // Nothing comes back for later page changes.
    deepseekReply(LONG);
    await vi.runAllTimersAsync();
    expect(document.querySelector('.gv-code-block-toggle')).toBeNull();
  });

  it('relabels the toggles and the bar when the Voyager language changes', () => {
    deepseekReply(LONG, LONG);
    activate(deepseek.adapter, deepseek.params);

    setCachedLanguage('zh');

    expect(document.querySelector('.gv-code-block-toggle')!.getAttribute('aria-label')).toBe(
      '展开',
    );
    expect(barButton('收起全部代码块')).not.toBeNull();
  });
});
