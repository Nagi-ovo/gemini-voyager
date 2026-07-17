import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LONG_CODE_BLOCK_MIN_HEIGHT,
  LONG_CODE_BLOCK_MIN_LINES,
  enhanceCodeBlock,
  startCodeBlockCollapse,
  stopCodeBlockCollapse,
} from '../index';

const translationState = vi.hoisted(() => ({ language: 'en' }));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => {
    if (translationState.language === 'zh') return key === 'pm_expand' ? '展开' : '收起';
    return key === 'pm_expand' ? 'Expand' : 'Collapse';
  },
}));

let resizeCallback: ResizeObserverCallback | null = null;

function createCodeBlock({
  lines = 1,
  height = 0,
  language = 'Python',
}: {
  lines?: number;
  height?: number;
  language?: string;
} = {}): { host: HTMLElement; code: HTMLElement } {
  const host = document.createElement('code-block');
  host.innerHTML = `
    <div class="formatted-code-block-internal-container">
      <div class="code-block-decoration">
        <span>${language}</span>
        <div class="buttons"></div>
      </div>
      <pre><code class="code-container" data-test-id="code-content"></code></pre>
    </div>
  `;
  const code = host.querySelector<HTMLElement>('code')!;
  code.textContent = Array.from({ length: lines }, (_, index) => `line ${index + 1}`).join('\n');
  Object.defineProperty(code, 'scrollHeight', { configurable: true, value: height });
  document.body.appendChild(host);
  return { host, code };
}

describe('codeBlockCollapse', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    translationState.language = 'en';
    resizeCallback = null;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    document.body.innerHTML = '';
  });

  afterEach(() => {
    stopCodeBlockCollapse();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('leaves short code blocks unchanged', () => {
    const { host } = createCodeBlock({ lines: LONG_CODE_BLOCK_MIN_LINES - 1 });

    enhanceCodeBlock(host);

    expect(host.classList.contains('gv-code-block-collapsible')).toBe(false);
    expect(host.querySelector('.gv-code-block-toggle')).toBeNull();
  });

  it('adds a toggle to long blocks and keeps them expanded by default', () => {
    const { host } = createCodeBlock({ lines: LONG_CODE_BLOCK_MIN_LINES });

    enhanceCodeBlock(host);

    const button = host.querySelector<HTMLButtonElement>('.gv-code-block-toggle')!;
    expect(button).not.toBeNull();
    expect(button.parentElement?.classList.contains('buttons')).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Collapse');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.textContent?.trim()).toBe('');
    expect(host.classList.contains('gv-code-block-collapsed')).toBe(false);
  });

  it('collapses and expands from the injected action', () => {
    const { host } = createCodeBlock({ lines: LONG_CODE_BLOCK_MIN_LINES });
    enhanceCodeBlock(host);
    const button = host.querySelector<HTMLButtonElement>('.gv-code-block-toggle')!;

    button.click();
    expect(host.classList.contains('gv-code-block-collapsed')).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Expand');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    button.click();
    expect(host.classList.contains('gv-code-block-collapsed')).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Collapse');
  });

  it('handles wrapped single-line code using rendered height', () => {
    const { host } = createCodeBlock({ lines: 1, height: LONG_CODE_BLOCK_MIN_HEIGHT });

    enhanceCodeBlock(host);

    expect(host.querySelector('.gv-code-block-toggle')).not.toBeNull();
  });

  it('does not read layout when the line threshold already qualifies the block', () => {
    const { host, code } = createCodeBlock({ lines: LONG_CODE_BLOCK_MIN_LINES });
    const heightRead = vi.fn(() => 0);
    Object.defineProperty(code, 'scrollHeight', { configurable: true, get: heightRead });

    enhanceCodeBlock(host);

    expect(heightRead).not.toHaveBeenCalled();
  });

  it('detects a code block that grows while Gemini is streaming', async () => {
    const { host, code } = createCodeBlock({ lines: 2 });
    const cleanup = startCodeBlockCollapse();
    expect(host.querySelector('.gv-code-block-toggle')).toBeNull();

    code.textContent = Array.from(
      { length: LONG_CODE_BLOCK_MIN_LINES },
      (_, index) => `streamed line ${index + 1}`,
    ).join('\n');
    await vi.runAllTimersAsync();

    expect(host.querySelector('.gv-code-block-toggle')).not.toBeNull();
    cleanup();
  });

  it('does not rescan code blocks for unrelated page mutations', async () => {
    const { code } = createCodeBlock({ lines: 2 });
    let heightReads = 0;
    Object.defineProperty(code, 'scrollHeight', {
      configurable: true,
      get: () => {
        heightReads += 1;
        return 0;
      },
    });
    const cleanup = startCodeBlockCollapse();
    const readsAfterInitialScan = heightReads;

    const unrelated = document.createElement('div');
    unrelated.textContent = 'Streaming text outside a code block';
    document.body.appendChild(unrelated);
    await vi.runAllTimersAsync();

    expect(heightReads).toBe(readsAfterInitialScan);
    cleanup();
  });

  it('re-evaluates a block when layout changes without a DOM mutation', async () => {
    const { host, code } = createCodeBlock({ lines: 1, height: 0 });
    const cleanup = startCodeBlockCollapse();
    expect(host.querySelector('.gv-code-block-toggle')).toBeNull();

    Object.defineProperty(code, 'scrollHeight', {
      configurable: true,
      value: LONG_CODE_BLOCK_MIN_HEIGHT,
    });
    resizeCallback?.([{ target: host } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    await vi.runAllTimersAsync();

    expect(host.querySelector('.gv-code-block-toggle')).not.toBeNull();
    cleanup();
  });

  it('refreshes existing toggle labels after the Voyager language changes', async () => {
    const { host } = createCodeBlock({ lines: LONG_CODE_BLOCK_MIN_LINES });
    const cleanup = startCodeBlockCollapse();
    const button = host.querySelector<HTMLButtonElement>('.gv-code-block-toggle')!;
    expect(button.getAttribute('aria-label')).toBe('Collapse');

    translationState.language = 'zh';
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)?.[0];
    listener?.({ language: { newValue: 'zh' } }, 'sync');
    await Promise.resolve();

    expect(button.getAttribute('aria-label')).toBe('收起');
    cleanup();
  });

  it('does not interfere with Mermaid code blocks', () => {
    const { host } = createCodeBlock({
      lines: LONG_CODE_BLOCK_MIN_LINES,
      language: 'Mermaid',
    });

    enhanceCodeBlock(host);

    expect(host.querySelector('.gv-code-block-toggle')).toBeNull();
  });

  it('removes injected state during cleanup', () => {
    const { host } = createCodeBlock({ lines: LONG_CODE_BLOCK_MIN_LINES });
    startCodeBlockCollapse();
    host.querySelector<HTMLButtonElement>('.gv-code-block-toggle')!.click();

    stopCodeBlockCollapse();

    expect(host.querySelector('.gv-code-block-toggle')).toBeNull();
    expect(host.classList.contains('gv-code-block-collapsible')).toBe(false);
    expect(host.classList.contains('gv-code-block-collapsed')).toBe(false);
  });

  it('keeps the header out of the sticky layer for collapsible blocks', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');
    const rule =
      css.match(
        /code-block\.gv-code-block-collapsible \.code-block-decoration\s*{([\s\S]*?)}/,
      )?.[1] ?? '';

    expect(rule).toContain('position: static !important');
    expect(rule).toContain('top: auto !important');
  });
});
