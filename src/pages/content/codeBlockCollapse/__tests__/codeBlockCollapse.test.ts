import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LONG_CODE_BLOCK_MIN_HEIGHT,
  LONG_CODE_BLOCK_MIN_LINES,
  enhanceCodeBlock,
  startCodeBlockCollapse,
  stopCodeBlockCollapse,
} from '../index';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => (key === 'pm_expand' ? 'Expand' : 'Collapse'),
}));

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
    document.body.innerHTML = '';
  });

  afterEach(() => {
    stopCodeBlockCollapse();
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
});
