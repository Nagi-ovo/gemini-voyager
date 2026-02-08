import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeepResearchPDFPrintService } from '../DeepResearchPDFPrintService';

function setUserAgentVendor(userAgent: string, vendor: string): void {
  Object.defineProperty(global.navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(global.navigator, 'vendor', {
    value: vendor,
    configurable: true,
  });
}

describe('DeepResearchPDFPrintService', () => {
  afterEach(() => {
    try {
      window.dispatchEvent(new Event('afterprint'));
    } catch {
      /* ignore */
    }
    document.body.classList.remove('gv-deep-research-pdf-printing');
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.title = 'Gemini';
    vi.useRealTimers();
  });

  it('uses isolated report print container and restores page state after print', async () => {
    document.title = 'Gemini';
    window.print = vi.fn();

    await DeepResearchPDFPrintService.export({
      title: 'Deep Research Report',
      url: 'https://gemini.google.com/app/abc12345',
      exportedAt: new Date().toISOString(),
      markdown: '# Markdown title\n\nMarkdown body',
      html: '<div class="markdown-main-panel"><h2>HTML title</h2><p>HTML body</p></div>',
    });

    const container = document.getElementById('gv-deep-research-pdf-print-container');
    const report = container?.querySelector('.gv-dr-print-report');
    expect(window.print).toHaveBeenCalledOnce();
    expect(container).toBeTruthy();
    expect(report?.textContent).toContain('HTML title');
    expect(document.title).toBe('Deep Research Report');
    expect(document.body.classList.contains('gv-deep-research-pdf-printing')).toBe(true);

    window.dispatchEvent(new Event('afterprint'));

    expect(document.getElementById('gv-deep-research-pdf-print-container')).toBeNull();
    expect(document.getElementById('gv-deep-research-pdf-print-styles')).toBeNull();
    expect(document.body.classList.contains('gv-deep-research-pdf-printing')).toBe(false);
    expect(document.title).toBe('Gemini');
  });

  it('injects print rules scoped by deep research body class', async () => {
    window.print = vi.fn();

    await DeepResearchPDFPrintService.export({
      title: 'Report',
      url: 'https://gemini.google.com/app/abc12345',
      exportedAt: new Date().toISOString(),
      markdown: 'Body',
      html: '<p>Body</p>',
    });

    const style = document.getElementById('gv-deep-research-pdf-print-styles');
    const styleText = style?.textContent || '';

    expect(styleText).toContain(
      'body.gv-deep-research-pdf-printing > *:not(#gv-deep-research-pdf-print-container)',
    );
    expect(styleText).toContain('display: none !important;');
    expect(styleText).toContain(
      'body.gv-deep-research-pdf-printing #gv-deep-research-pdf-print-container *',
    );
    expect(styleText).toContain('display: revert !important;');
    expect(styleText).toContain('body.gv-deep-research-pdf-printing .gv-dr-print-cover-page');
    expect(styleText).toContain('display: flex !important;');
    expect(styleText).toContain('align-items: center !important;');
    expect(styleText).toContain('justify-content: center !important;');
    expect(styleText).toContain('min-height: calc(297mm - 4cm);');
    expect(styleText).toContain('position: relative;');
    expect(styleText).toContain('position: absolute;');
    expect(styleText).toContain('transform: translate(-50%, -50%);');
    expect(styleText).toContain('html,');
    expect(styleText).toContain('body {');
    expect(styleText).toContain('background: #fff !important;');
  });

  it('applies Safari-only print override class and style rules', async () => {
    setUserAgentVendor(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'Apple Computer, Inc.',
    );
    window.print = vi.fn();

    await DeepResearchPDFPrintService.export({
      title: 'Report',
      url: 'https://gemini.google.com/app/abc12345',
      exportedAt: new Date().toISOString(),
      markdown: 'Body',
      html: '<p>Body</p>',
    });

    expect(document.body.classList.contains('gv-deep-research-pdf-safari-printing')).toBe(true);

    const style = document.getElementById('gv-deep-research-pdf-print-styles');
    const styleText = style?.textContent || '';
    expect(styleText).toContain(
      'body.gv-deep-research-pdf-printing.gv-deep-research-pdf-safari-printing .gv-dr-print-cover-page',
    );
    expect(styleText).toContain('position: static !important;');
    expect(styleText).toContain('transform: none !important;');

    window.dispatchEvent(new Event('afterprint'));
    expect(document.body.classList.contains('gv-deep-research-pdf-safari-printing')).toBe(false);
  });
});
