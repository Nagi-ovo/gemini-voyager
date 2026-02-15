import { getMatchedAdapter } from '@/features/contextSync/adapters';
import { DialogNode } from '@/features/contextSync/types';

export class ContextCaptureService {
  private static instance: ContextCaptureService;

  private constructor() {}

  static getInstance(): ContextCaptureService {
    if (!this.instance) {
      this.instance = new ContextCaptureService();
    }
    return this.instance;
  }

  async captureDialogue(): Promise<DialogNode[]> {
    const host = window.location.hostname;
    const adapter = getMatchedAdapter(host);
    const messages: DialogNode[] = [];

    let queries: HTMLElement[] = [];
    let responses: HTMLElement[] = [];

    if (adapter.user_selector && adapter.ai_selector) {
      queries = adapter.user_selector
        ? (Array.from(document.querySelectorAll(adapter.user_selector.join(','))) as HTMLElement[])
        : [];
      responses = adapter.ai_selector
        ? (Array.from(document.querySelectorAll(adapter.ai_selector.join(','))) as HTMLElement[])
        : [];
    }

    console.log(`[ContextSync] Found ${queries.length} queries and ${responses.length} responses.`);

    const maxLength = Math.max(queries.length, responses.length);

    for (let i = 0; i < maxLength; i++) {
      if (i < queries.length) {
        const info = await this.extractNodeInfo(queries[i], 'user');
        if (info) messages.push(info);
      }
      if (i < responses.length) {
        const info = await this.extractNodeInfo(responses[i], 'assistant');
        if (info) messages.push(info);
      }
    }

    return messages;
  }

  private static async getBase64Safe(url: string): Promise<string | null> {
    if (!url || url === 'about:blank') return null;

    // If it's a blob URL, it's already a high-res/processed image in the page context
    if (url.startsWith('blob:')) {
      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => {
            console.error('[ContextSync] FileReader error for blob');
            resolve(null);
          };
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.error('[ContextSync] Failed to fetch blob URL:', e);
        return null;
      }
    }

    // Determine the "best" URL to fetch.
    // For Google images, try to request the original size (=s0).
    // Export feature doesn't always do this, but for sync we want to be sure.
    // However, we only do it if we see a size parameter to avoid breaking other URLs.
    let targetUrl = url;
    if (url.includes('googleusercontent.com')) {
      // 1. Identify and convert preview URLs to download URLs to trigger interceptor matching
      // User-uploaded previews use rd-gg/, while high-res downloads often use rd-gg-dl/
      if (url.includes('/rd-gg/')) {
        targetUrl = targetUrl.replace('/rd-gg/', '/rd-gg-dl/');
      }

      // 2. Request original size (=s0).
      // This is a known Google image parameter for full resolution.
      targetUrl = targetUrl.replace(/=[swh]\d+.*?(?=[-?#]|$)/, '=s0');
    }

    // Strategy 1: Attempt direct fetch from content script (preserves session/cookies)
    try {
      console.log('[ContextSync] Attempting direct fetch for:', targetUrl);
      const resp = await fetch(targetUrl, {
        credentials: 'include',
        mode: 'cors' as RequestMode,
      });
      if (resp.ok) {
        const blob = await resp.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.warn('[ContextSync] Direct fetch failed, falling back to background:', e);
    }

    // Strategy 2: Background fetch (bypasses some CORS restrictions)
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'gv.fetchImage', url: targetUrl }, (response) => {
        if (response && response.ok) {
          resolve(response.data);
        } else {
          // Strategy 3: Fetch via page context (triggers fetch interceptor in MAIN world)
          chrome.runtime.sendMessage(
            { type: 'gv.fetchImageViaPage', url: targetUrl },
            (pageResponse) => {
              if (pageResponse && pageResponse.ok) {
                resolve(pageResponse.data);
              } else {
                console.error('[ContextSync] Image fetch failed (all methods):', targetUrl);
                resolve(null);
              }
            },
          );
        }
      });
    });
  }

  private convertTableToMarkdown(table: HTMLTableElement): string {
    try {
      const rows = Array.from(table.rows);
      if (rows.length === 0) return '';

      const data = rows.map((row) => {
        const cells = Array.from(row.cells);
        return cells.map((cell) => {
          return cell.innerText.trim().replace(/\|/g, '\\|').replace(/\n/g, '___BR___');
        });
      });

      const maxCols = data.reduce((max, row) => Math.max(max, row.length), 0);
      if (maxCols === 0) return '';

      let md = '\n\n';

      const headerRow = data[0];
      while (headerRow.length < maxCols) headerRow.push('');
      md += '| ' + headerRow.join(' | ') + ' |\n';

      md += '| ' + Array(maxCols).fill('---').join(' | ') + ' |\n';

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        while (row.length < maxCols) row.push('');
        md += '| ' + row.join(' | ') + ' |\n';
      }

      return md + '\n';
    } catch (e) {
      console.error('Table conversion failed', e);
      return table.innerText;
    }
  }

  private async extractNodeInfo(
    el: HTMLElement,
    forceRole: 'user' | 'assistant' | null = null,
  ): Promise<DialogNode | null> {
    if (el.offsetParent === null) return null;
    if (['SCRIPT', 'STYLE', 'NAV', 'HEADER', 'FOOTER', 'SVG', 'PATH'].includes(el.tagName))
      return null;

    const clone = el.cloneNode(true) as HTMLElement;

    // 处理表格
    const tables = Array.from(clone.querySelectorAll('table')).reverse();
    tables.forEach((table) => {
      const md = this.convertTableToMarkdown(table as HTMLTableElement);
      table.replaceWith(document.createTextNode(md));
    });

    // 处理图片：复用导出功能的全面选择器逻辑
    const imgBase64List: string[] = [];
    const imageSelectors = [
      'user-query-file-preview img',
      '.preview-image',
      'generated-image img',
      'single-image img',
      '.attachment-container.generated-images img',
    ].join(',');

    const imgElements = Array.from(clone.querySelectorAll(imageSelectors)) as HTMLImageElement[];
    if (imgElements.length > 0) {
      console.log(`[ContextSync] Found ${imgElements.length} image(s)`);
      for (const imgEl of imgElements) {
        // Use attribute if available, otherwise fallback to property
        let src = imgEl.getAttribute('src') || imgEl.src || '';
        if (!src || src === 'about:blank') continue;

        // Resolve relative URLs to absolute
        if (src.startsWith('/')) {
          src = window.location.origin + src;
        }

        const base64 = await ContextCaptureService.getBase64Safe(src);
        if (base64) {
          imgBase64List.push(base64);
          console.log('[ContextSync] Converted image to Base64 (length):', base64.length);
        }
      }
      console.log(
        `[ContextSync] Successfully converted ${imgBase64List.length} image(s) to Base64`,
      );
    }

    let text = clone.innerText.trim();
    if (text.length < 1 && imgBase64List.length === 0) return null;

    text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    text = text.replace(/___BR___/g, '<br>');

    return {
      url: window.location.hostname,
      className: el.className,
      text: text,
      images: imgBase64List,
      is_ai_likely: forceRole === 'assistant',
      is_user_likely: forceRole === 'user',
      rect: {
        top: el.getBoundingClientRect().top,
        left: el.getBoundingClientRect().left,
        width: el.getBoundingClientRect().width,
      },
    };
  }
}
