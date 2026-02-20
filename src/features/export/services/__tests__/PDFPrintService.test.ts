import { afterEach, describe, expect, it, vi } from 'vitest';

import { PDFPrintService } from '../PDFPrintService';

describe('PDFPrintService', () => {
  afterEach(() => {
    try {
      window.dispatchEvent(new Event('afterprint'));
    } catch {
      /* ignore */
    }
    vi.useRealTimers();
    document.body.innerHTML = '';
    document.title = 'Gemini';
    try {
      window.history.pushState({}, '', '/');
    } catch {
      /* ignore */
    }
  });

  it('triggers print and cleans up container on afterprint', async () => {
    vi.useFakeTimers();
    window.print = vi.fn();

    const exportPromise = PDFPrintService.export([{ user: 'u', assistant: 'a', starred: false }], {
      url: 'https://gemini.google.com/app/x',
      exportedAt: new Date().toISOString(),
      count: 1,
      title: 'My Chat',
    });

    await vi.advanceTimersByTimeAsync(100);
    await exportPromise;

    expect(window.print).toHaveBeenCalledOnce();
    expect(document.getElementById('gv-pdf-print-container')).toBeTruthy();

    window.dispatchEvent(new Event('afterprint'));
    expect(document.getElementById('gv-pdf-print-container')).toBeNull();
  });

  it('injects print rules scoped by pdf printing class with white page reset', async () => {
    window.print = vi.fn();

    await PDFPrintService.export([{ user: 'u', assistant: 'a', starred: false }], {
      url: 'https://gemini.google.com/app/x',
      exportedAt: new Date().toISOString(),
      count: 1,
      title: 'Scoped Print Styles',
    });

    const style = document.getElementById('gv-pdf-print-styles');
    const styleText = style?.textContent || '';

    expect(styleText).toContain('body.gv-pdf-printing > *:not(#gv-pdf-print-container)');
    expect(styleText).toContain('html,');
    expect(styleText).toContain('body {');
    expect(styleText).toContain('background: #fff !important;');
  });

  it('injects descendant display override to survive immersive-mode print rules', async () => {
    window.print = vi.fn();

    await PDFPrintService.export([{ user: 'u', assistant: 'a', starred: false }], {
      url: 'https://gemini.google.com/app/x',
      exportedAt: new Date().toISOString(),
      count: 1,
      title: 'Immersive Print Override',
    });

    const style = document.getElementById('gv-pdf-print-styles');
    const styleText = style?.textContent || '';

    expect(styleText).toMatch(
      /body\.gv-pdf-printing #gv-pdf-print-container \*\s*\{\s*display:\s*revert !important;/,
    );
  });

  it('keeps cover page centered under immersive-mode display override', async () => {
    window.print = vi.fn();

    await PDFPrintService.export([{ user: 'u', assistant: 'a', starred: false }], {
      url: 'https://gemini.google.com/app/x',
      exportedAt: new Date().toISOString(),
      count: 1,
      title: 'Centered Cover',
    });

    const style = document.getElementById('gv-pdf-print-styles');
    const styleText = style?.textContent || '';

    expect(styleText).toMatch(
      /body\.gv-pdf-printing #gv-pdf-print-container \.gv-print-cover-page\s*\{[\s\S]*display:\s*flex !important;/,
    );
  });

  it('reuses conversation print markup for document PDF content', async () => {
    document.title = 'Original Title';
    window.print = vi.fn();

    await PDFPrintService.exportDocument({
      title: 'Deep Research Report',
      url: 'https://gemini.google.com/app/x',
      exportedAt: new Date().toISOString(),
      markdown: '# Markdown heading',
      html: '<div class="markdown-main-panel"><h2>HTML heading</h2><p>HTML body</p></div>',
    });

    const turn = document.querySelector('.gv-print-turn');
    const reportContainer = document.querySelector('.gv-print-report-content');
    const coverTitle = document.querySelector('.gv-print-cover-title');
    const turnText = document.querySelector('.gv-print-turn-text');
    expect(turn).toBeTruthy();
    expect(reportContainer).toBeNull();
    expect(coverTitle?.textContent).toContain('Deep Research Report');
    expect(turnText?.textContent).toContain('HTML heading');
    expect(turnText?.textContent).not.toContain('Markdown heading');
  });

  it('uses classed div containers instead of semantic print tags', async () => {
    window.print = vi.fn();

    await PDFPrintService.export([{ user: 'u', assistant: 'a', starred: false }], {
      url: 'https://gemini.google.com/app/x',
      exportedAt: new Date().toISOString(),
      count: 1,
      title: 'No Semantic Tags',
    });

    const container = document.getElementById('gv-pdf-print-container');
    expect(container).toBeTruthy();
    expect(container?.querySelector('header, main, article, footer')).toBeNull();
  });

  it('normalizes metadata title suffix when page title is generic', async () => {
    document.title = 'Gemini';
    window.print = vi.fn();

    await PDFPrintService.export([{ user: 'u', assistant: 'a', starred: false }], {
      url: 'https://gemini.google.com/app/x',
      exportedAt: new Date().toISOString(),
      count: 1,
      title: '房贷还款方式对比分析 - Gemini',
    });

    const coverTitle = document.querySelector('.gv-print-cover-title');
    expect(coverTitle?.textContent).toBe('房贷还款方式对比分析');
  });

  it('extracts title from native sidebar by conversation id and restores page title after print', async () => {
    vi.useFakeTimers();
    document.title = 'Google Gemini';
    window.print = vi.fn();

    window.history.pushState({}, '', '/app/abc12345');
    const nativeConversation = document.createElement('div');
    nativeConversation.setAttribute('data-test-id', 'conversation');
    nativeConversation.setAttribute('jslog', 'x c_abc12345 y');
    const link = document.createElement('a');
    link.setAttribute('href', '/app/abc12345');
    const text = document.createElement('span');
    text.className = 'conversation-title-text';
    text.textContent = '房贷还款方式对比分析';
    link.appendChild(text);
    nativeConversation.appendChild(link);
    document.body.appendChild(nativeConversation);

    const exportPromise = PDFPrintService.export([{ user: 'u', assistant: 'a', starred: false }], {
      url: 'https://gemini.google.com/app/abc12345',
      exportedAt: new Date().toISOString(),
      count: 1,
      title: 'Untitled Conversation',
    });

    await vi.advanceTimersByTimeAsync(100);
    await exportPromise;

    const coverTitle = document.querySelector('.gv-print-cover-title');
    expect(coverTitle?.textContent).toBe('房贷还款方式对比分析');
    expect(document.title).toBe('房贷还款方式对比分析 - Gemini');

    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Google Gemini');
  });

  it('keeps omitEmptySections behavior for selected exports', async () => {
    document.title = 'Original Title';
    window.print = vi.fn();

    await PDFPrintService.export(
      [
        {
          user: '',
          assistant: 'Assistant only message',
          starred: false,
          omitEmptySections: true,
        },
      ],
      {
        url: 'https://gemini.google.com/app/x',
        exportedAt: new Date().toISOString(),
        count: 1,
        title: 'Selection Export',
      },
    );

    const userSection = document.querySelector('.gv-print-turn-user');
    const assistantSection = document.querySelector('.gv-print-turn-assistant');
    expect(userSection).toBeNull();
    expect(assistantSection?.textContent).toContain('Assistant only message');
  });

  it('still calls window.print when bridge element exists but has no listener', async () => {
    window.print = vi.fn();
    const bridge = document.createElement('div');
    bridge.id = 'gv-print-bridge';
    document.body.appendChild(bridge);

    await PDFPrintService.export([{ user: 'u', assistant: 'a', starred: false }], {
      url: 'https://gemini.google.com/app/x',
      exportedAt: new Date().toISOString(),
      count: 1,
      title: 'Bridge Fallback',
    });

    expect(window.print).toHaveBeenCalledOnce();
  });

  it('escapes quotes in header link href attribute', async () => {
    window.print = vi.fn();

    await PDFPrintService.export([{ user: 'u', assistant: 'a', starred: false }], {
      url: 'https://gemini.google.com/app/x" onclick="alert(1)',
      exportedAt: new Date().toISOString(),
      count: 1,
      title: 'Attribute Escape',
    });

    const link = document.querySelector('.gv-print-meta a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('onclick')).toBeNull();
    expect(link?.getAttribute('href')).toContain('" onclick="');
  });

  it('handles special CSS characters in conversation id selectors', () => {
    const conversationId = 'ab"]\\cd';
    const nativeConversation = document.createElement('div');
    nativeConversation.setAttribute('data-test-id', 'conversation');
    nativeConversation.setAttribute('jslog', `x c_${conversationId} y`);

    const link = document.createElement('a');
    link.setAttribute('href', `/app/${conversationId}`);
    const text = document.createElement('span');
    text.className = 'conversation-title-text';
    text.textContent = 'Escaped Selector Title';
    link.appendChild(text);
    nativeConversation.appendChild(link);
    document.body.appendChild(nativeConversation);

    let title: string | null = null;
    expect(() => {
      title = (
        PDFPrintService as unknown as {
          extractTitleFromNativeSidebarByConversationId: (id: unknown) => string | null;
        }
      ).extractTitleFromNativeSidebarByConversationId(conversationId);
    }).not.toThrow();
    expect(title).toBe('Escaped Selector Title');
  });
});
