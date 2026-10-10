import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveExportAdapter } from '@/pages/content/export/adapter/platformAdapters';

import type { ChatTurn } from '../../types/export';
import { createContentExtractor, extractTurnContent } from '../DOMContentExtractor';
import { renderElementToImageBlob } from '../ImageRenderService';
import { PDFPrintService } from '../PDFPrintService';
import { resolveNativeSidebarTitle } from '../pdfPrintTitles';

vi.mock('../ImageRenderService', () => ({
  renderElementToImageBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}));

const extractor = createContentExtractor(resolveExportAdapter());
const extracted = (turns: ChatTurn[]): ChatTurn[] =>
  turns.map((turn) => extractTurnContent(turn, extractor));

describe('PDFPrintService', () => {
  afterEach(() => {
    try {
      window.dispatchEvent(new Event('afterprint'));
    } catch {
      /* ignore */
    }
    vi.useRealTimers();
    vi.clearAllMocks();
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

  it('renders custom speaker labels as escaped text', async () => {
    window.print = vi.fn();

    await PDFPrintService.export(
      [{ user: 'u', assistant: 'a', starred: false }],
      {
        url: 'https://gemini.google.com/app/x',
        exportedAt: new Date().toISOString(),
        count: 1,
        title: 'Safe labels',
      },
      {
        speakerLabels: {
          user: '<img src=x onerror=alert(1)>',
          assistant: 'Nova & Co.',
        },
      },
    );

    const labels = Array.from(document.querySelectorAll('.gv-print-turn-label'));
    expect(labels.map((label) => label.textContent)).toEqual([
      '👤 <img src=x onerror=alert(1)>',
      '🤖 Nova & Co.',
    ]);
    expect(document.querySelector('.gv-print-turn-label img')).toBeNull();
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

  it('restores ordered-list markers hidden by host page resets', async () => {
    window.print = vi.fn();
    const assistantElement = document.createElement('div');
    assistantElement.innerHTML = `
      <message-content>
        <div class="markdown">
          <ol start="22"><li>今天的空气有些凉。</li><li>一封邮件刚刚到达。</li></ol>
        </div>
      </message-content>
    `;

    await PDFPrintService.export(
      extracted([
        { user: '', assistant: '', assistantElement, starred: false, omitEmptySections: true },
      ]),
      {
        url: 'https://chatgpt.com/c/x',
        exportedAt: new Date().toISOString(),
        count: 1,
        title: 'Numbered list',
        platform: 'ChatGPT',
      },
    );

    const list = document.querySelector<HTMLOListElement>('.gv-print-turn-text ol');
    const styleText = document.getElementById('gv-pdf-print-styles')?.textContent || '';
    expect(list?.start).toBe(22);
    expect(styleText).toMatch(
      /\.gv-print-turn-text ol\s*\{[^}]*list-style-type:\s*decimal !important;/s,
    );
    expect(styleText).toMatch(
      /\.gv-print-turn-text ul\s*\{[^}]*list-style-type:\s*disc !important;/s,
    );
  });

  it('restores KaTeX layout primitives after immersive-mode display override', async () => {
    window.print = vi.fn();

    await PDFPrintService.export([{ user: 'u', assistant: 'a', starred: false }], {
      url: 'https://gemini.google.com/app/x',
      exportedAt: new Date().toISOString(),
      count: 1,
      title: 'KaTeX Print Layout',
    });

    const style = document.getElementById('gv-pdf-print-styles');
    const styleText = style?.textContent || '';

    expect(styleText).toContain('.katex .vlist-t');
    expect(styleText).toContain('display: inline-table !important;');
    expect(styleText).toContain('.katex .vlist-r');
    expect(styleText).toContain('display: table-row !important;');
    expect(styleText).toContain('.katex .vlist,');
    expect(styleText).toContain('.katex .vlist-s');
    expect(styleText).toContain('display: table-cell !important;');
    expect(styleText).toContain('.katex .base');
    expect(styleText).toContain('white-space: nowrap !important;');
    expect(styleText).toContain('width: min-content !important;');
    expect(styleText).toContain('.katex .vlist > span');
    expect(styleText).toContain('height: 0 !important;');
    expect(styleText).toContain('.katex .mfrac .frac-line');
    expect(styleText).toContain('.katex .sqrt > .root');
    expect(styleText).toContain('.katex svg');
    expect(styleText).toContain('fill: currentColor !important;');
    expect(styleText).toContain('position: absolute !important;');
    expect(styleText).toContain('.katex img.katex-svg');
    expect(styleText).toContain('max-width: none !important;');
    expect(styleText).toContain('object-fit: fill !important;');
    expect(styleText).toContain('.katex .hide-tail');
    expect(styleText).toContain('.gv-print-turn-text .katex');
    expect(styleText).toContain('line-height: 1.2 !important;');
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

  it('renders uploaded file placeholders in conversation PDFs', async () => {
    window.print = vi.fn();
    const userElement = document.createElement('div');
    userElement.innerHTML = `
      <user-query-file-preview>
        <div data-test-id="uploaded-file">
          <button class="new-file-preview-file" aria-label="proposal.pdf">PDF</button>
        </div>
      </user-query-file-preview>
    `;

    await PDFPrintService.export(
      extracted([{ user: '', assistant: 'Reviewed', starred: false, userElement }]),
      {
        url: 'https://gemini.google.com/app/x',
        exportedAt: new Date().toISOString(),
        count: 1,
        title: 'Attachment',
      },
    );

    const attachment = document.querySelector('.gv-export-attachment');
    const styleText = document.getElementById('gv-pdf-print-styles')?.textContent ?? '';
    expect(attachment?.textContent).toContain('proposal.pdf');
    expect(styleText).toContain('.gv-print-turn-text .gv-export-attachment');
  });

  it('renders Mermaid SVG with print-safe scoped styles', async () => {
    window.print = vi.fn();
    const assistantElement = document.createElement('div');
    assistantElement.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="gv-mermaid-wrapper" data-gv-mermaid-theme="dark">
            <code-block style="display: none;">
              <div class="code-block-decoration">mermaid</div>
              <pre><code role="text">flowchart TD\nA --&gt; B</code></pre>
            </code-block>
            <div class="gv-mermaid-toggle"><button>Diagram</button></div>
            <div class="gv-mermaid-diagram">
              <svg data-render-theme="dark" viewBox="0 0 640 1190"><g><text>A</text><text>B</text></g></svg>
            </div>
            <template class="gv-mermaid-light-export">
              <svg data-export-theme="light" viewBox="0 0 640 1190">
                <foreignObject width="160" height="24">
                  <div xmlns="http://www.w3.org/1999/xhtml" style="display: table-cell">
                    <span class="nodeLabel"><p>核心能力构建</p></span>
                  </div>
                </foreignObject>
              </svg>
            </template>
          </div>
        </div>
      </message-content>
    `;

    await PDFPrintService.export(
      extracted([{ user: 'Diagram', assistant: '', starred: false, assistantElement }]),
      {
        url: 'https://gemini.google.com/app/x',
        exportedAt: new Date().toISOString(),
        count: 1,
        title: 'Mermaid Export',
      },
    );

    const turnText = document.querySelector('.gv-print-turn-assistant .gv-print-turn-text');
    const styleText = document.getElementById('gv-pdf-print-styles')?.textContent ?? '';
    const mermaidImage = turnText?.querySelector<HTMLImageElement>(
      '.gv-export-mermaid img.gv-export-mermaid-image',
    );
    const dataUrl = mermaidImage?.getAttribute('src') || '';
    expect(mermaidImage).toBeTruthy();
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(turnText?.querySelector('.gv-export-mermaid svg')).toBeNull();
    expect(turnText?.querySelector('pre, code-block, .gv-mermaid-toggle')).toBeNull();
    expect(styleText).toContain('.gv-print-turn-text .gv-export-mermaid');
    expect(styleText).toContain('.gv-print-turn-text .gv-export-mermaid > img {');
    expect(styleText).toContain('display: block !important;');
    expect(styleText).toContain('break-inside: avoid;');
    expect(styleText).toContain('page-break-inside: avoid;');
    expect(styleText).toContain('max-width: 100%;');
    expect(styleText).toContain('height: auto;');
    expect(styleText).toContain('max-height: 160mm;');
    expect(styleText).toContain('object-fit: contain;');
    expect(vi.mocked(renderElementToImageBlob)).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ pixelRatio: 2 }),
    );
    expect(turnText?.textContent).not.toContain('核心能力构建');
    expect(
      turnText?.querySelector('.gv-export-mermaid')?.getAttribute('data-gv-mermaid-theme'),
    ).toBe('light');
    expect(styleText).not.toContain('.gv-export-mermaid[data-gv-mermaid-theme="dark"]');
    expect(styleText).not.toContain('background: #1f2020;');
    expect(styleText).toContain('print-color-adjust: exact;');
    expect(styleText).toContain('-webkit-print-color-adjust: exact;');
  });

  it('falls back to an isolated Mermaid SVG image when rasterization fails', async () => {
    window.print = vi.fn();
    vi.mocked(renderElementToImageBlob).mockRejectedValueOnce(
      new Error('Mermaid rasterization failed'),
    );
    const assistantElement = document.createElement('div');
    assistantElement.innerHTML = `
      <message-content>
        <div class="markdown">
          <div class="gv-mermaid-wrapper" data-gv-mermaid-theme="light">
            <code-block style="display: none;">
              <div class="code-block-decoration">mermaid</div>
              <pre><code role="text">flowchart TD\nA --&gt; B</code></pre>
            </code-block>
            <div class="gv-mermaid-diagram">
              <svg aria-label="Workflow diagram" viewBox="0 0 640 480">
                <g><text>A</text><text>B</text></g>
              </svg>
            </div>
          </div>
        </div>
      </message-content>
    `;

    await PDFPrintService.export(
      extracted([{ user: 'Diagram', assistant: '', starred: false, assistantElement }]),
      {
        url: 'https://gemini.google.com/app/x',
        exportedAt: new Date().toISOString(),
        count: 1,
        title: 'Mermaid Fallback Export',
      },
    );

    const wrapper = document.querySelector<HTMLElement>(
      '.gv-print-turn-assistant .gv-export-mermaid',
    );
    const image = wrapper?.querySelector<HTMLImageElement>('img.gv-export-mermaid-image');
    expect(image?.src).toMatch(/^data:image\/svg\+xml(?:;charset=utf-8,|;base64,)/);
    expect(image?.alt).toBe('Workflow diagram');
    expect(wrapper?.querySelector('svg')).toBeNull();
    expect(wrapper?.getAttribute('data-gv-mermaid-theme')).toBe('light');
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

  it('prefers the adapter title over a generic ChatGPT page title', async () => {
    document.title = 'ChatGPT';
    window.print = vi.fn();

    await PDFPrintService.export([{ user: 'u', assistant: 'a', starred: false }], {
      url: 'https://chatgpt.com/c/abc12345',
      exportedAt: new Date().toISOString(),
      count: 1,
      title: 'AI学习设备选择指南',
      platform: 'ChatGPT',
    });

    expect(document.querySelector('.gv-print-cover-title')?.textContent).toBe('AI学习设备选择指南');
    expect(document.title).toBe('AI学习设备选择指南 - ChatGPT');
  });

  it('keeps an already-rendered image when best-effort inlining fails', async () => {
    window.print = vi.fn();
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('CORS blocked')) as typeof fetch;

    try {
      await PDFPrintService.export(
        [
          {
            user: '',
            assistant: 'Image response',
            starred: false,
            omitEmptySections: true,
            assistantContent: {
              text: 'Image response',
              html: '<img src="https://blocked.example/image.png" alt="kept" />',
              attachments: [],
              hasImages: true,
              hasFormulas: false,
              hasTables: false,
              hasCode: false,
            },
          },
        ],
        {
          url: 'https://chatgpt.com/c/x',
          exportedAt: new Date().toISOString(),
          count: 1,
          title: 'Image fallback',
          platform: 'ChatGPT',
        },
      );
    } finally {
      global.fetch = originalFetch;
    }

    expect(
      document.querySelector<HTMLImageElement>('.gv-print-turn-text img')?.getAttribute('src'),
    ).toBe('https://blocked.example/image.png');
  });

  it('preserves images beyond the inlining fetch cap', async () => {
    window.print = vi.fn();
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('CORS blocked')) as typeof fetch;
    const images = Array.from(
      { length: 41 },
      (_, index) => `<img src="https://blocked.example/${index}.png" alt="${index}" />`,
    ).join('');

    try {
      await PDFPrintService.export(
        [
          {
            user: '',
            assistant: 'Image gallery',
            starred: false,
            omitEmptySections: true,
            assistantContent: {
              text: 'Image gallery',
              html: images,
              attachments: [],
              hasImages: true,
              hasFormulas: false,
              hasTables: false,
              hasCode: false,
            },
          },
        ],
        {
          url: 'https://chatgpt.com/c/x',
          exportedAt: new Date().toISOString(),
          count: 1,
          title: 'Image cap',
          platform: 'ChatGPT',
        },
      );
    } finally {
      global.fetch = originalFetch;
    }

    expect(document.querySelectorAll('.gv-print-turn-text img')).toHaveLength(41);
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

  it('restores page state through the fallback timer when afterprint never fires', async () => {
    vi.useFakeTimers();
    document.title = 'Original title';
    document.body.innerHTML = '<main id="host-content">Page content</main>';
    window.print = vi.fn();
    const cleanupEvent = vi.fn();
    window.addEventListener('gv-print-cleanup', cleanupEvent);
    const exportPromise = PDFPrintService.export([{ user: 'u', assistant: 'a', starred: false }], {
      url: 'https://gemini.google.com/app/x',
      exportedAt: '',
      count: 1,
      title: 'Print title',
    });
    await vi.advanceTimersByTimeAsync(100);
    await exportPromise;
    cleanupEvent.mockClear();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(document.getElementById('gv-pdf-print-container')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.getElementById('gv-pdf-print-container')).toBeNull();
    expect(document.body.classList.contains('gv-pdf-printing')).toBe(false);
    expect(document.title).toBe('Original title');
    expect(document.getElementById('host-content')?.textContent).toBe('Page content');
    expect(document.getElementById('gv-pdf-print-styles')).toBeTruthy();
    expect(cleanupEvent).toHaveBeenCalledOnce();
    window.removeEventListener('gv-print-cleanup', cleanupEvent);
  });

  it.each(['before', 'during'])(
    'cleans up and skips printing when cancelled %s preparation',
    async (when) => {
      vi.useFakeTimers();
      document.title = 'Original title';
      window.print = vi.fn();
      const controller = new AbortController();
      if (when === 'before') controller.abort();
      const exportPromise = PDFPrintService.export(
        [{ user: 'u', assistant: 'a', starred: false }],
        {
          url: 'https://gemini.google.com/app/x',
          exportedAt: '',
          count: 1,
          title: 'Cancelled title',
        },
        { signal: controller.signal },
      );
      const rejected = expect(exportPromise).rejects.toMatchObject({ name: 'AbortError' });
      if (when === 'during') {
        await vi.advanceTimersByTimeAsync(99);
        expect(document.getElementById('gv-pdf-print-container')).toBeTruthy();
        controller.abort();
      }
      await vi.advanceTimersByTimeAsync(100);
      await rejected;
      expect(window.print).not.toHaveBeenCalled();
      expect(document.getElementById('gv-pdf-print-container')).toBeNull();
      expect(document.body.classList.contains('gv-pdf-printing')).toBe(false);
      expect(document.title).toBe('Original title');
    },
  );

  it('replaces the previous print document and applies the next export font size', async () => {
    window.print = vi.fn();
    const metadata = { url: 'https://gemini.google.com/app/x', exportedAt: '', count: 1 };
    await PDFPrintService.export([{ user: 'First', assistant: 'a', starred: false }], metadata);
    const first = document.getElementById('gv-pdf-print-container')!;
    await PDFPrintService.export([{ user: 'Next', assistant: 'a', starred: false }], metadata, {
      fontSize: 17,
    });
    expect(first.isConnected).toBe(false);
    expect(document.querySelectorAll('#gv-pdf-print-container')).toHaveLength(1);
    expect(document.querySelector('.gv-print-turn-user')?.textContent).toContain('Next');
    const styles = document.getElementById('gv-pdf-print-styles')?.textContent;
    expect(styles).toContain('font-size: 17pt;');
    expect(styles).toContain('font-size: 15pt;');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Gemini');
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
      title = resolveNativeSidebarTitle(conversationId);
    }).not.toThrow();
    expect(title).toBe('Escaped Selector Title');
  });
});
