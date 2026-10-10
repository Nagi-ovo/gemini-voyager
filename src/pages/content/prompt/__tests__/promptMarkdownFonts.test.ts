import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startUserLatex } from '../../userLatex';
import { renderPromptMarkdown } from '../promptMarkdownLoader';

beforeEach(() => {
  document.head.replaceChildren();
});

describe('prompt math fonts', () => {
  it('opening a math preview loads its stylesheet from the extension instead of the page', async () => {
    expect(document.querySelector('link[rel="stylesheet"]')).toBeNull();
    const html = await renderPromptMarkdown('$\\sqrt{x}$');
    expect(html).toContain('class="katex"');
    const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
    expect(link).not.toBeNull();
    expect(link!.href).toMatch(/^chrome-extension:\/\/test-extension-id\//);
    expect(link!.crossOrigin).toBe('anonymous');

    await renderPromptMarkdown('$x^2$');
    expect(document.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(1);
  });

  it('user message math loads its own extension stylesheet without opening Prompt Manager', async () => {
    const line = document.createElement('p');
    line.className = 'query-text-line';
    line.textContent = '$\\sqrt{x}$';
    document.body.replaceChildren(line);
    startUserLatex();

    await vi.waitFor(() => expect(line.querySelector('.katex')).not.toBeNull());
    expect(document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')?.href).toMatch(
      /^chrome-extension:\/\/test-extension-id\//,
    );
  });

  it('the shared math stylesheet uses the Firefox runtime URL too', async () => {
    vi.mocked(chrome.runtime.getURL).mockImplementationOnce(
      (path) => `moz-extension://test-extension-id/${path}`,
    );
    await renderPromptMarkdown('$x$');
    expect(document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')?.href).toMatch(
      /^moz-extension:\/\/test-extension-id\//,
    );
  });
});
