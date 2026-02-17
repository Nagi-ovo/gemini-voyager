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

  private async getBase64Safe(url: string): Promise<string | null> {
    return new Promise((resolve) => {
      console.log('[ContextSync] Sending gv.fetchImage message for:', url);
      const timeout = setTimeout(() => {
        console.warn('[ContextSync] Image fetch timeout for:', url);
        resolve(null);
      }, 10000); // 10s timeout

      chrome.runtime.sendMessage({ type: 'gv.fetchImage', url: url }, (response) => {
        clearTimeout(timeout);
        console.log('[ContextSync] Received response for gv.fetchImage:', response);
        if (response && response.ok) {
          // background/index.ts now returns { ok: true, data: "data:image/png;base64,..." }
          resolve(response.data);
        } else {
          console.error('[ContextSync] Image fetch failed:', response?.error || 'unknown error');
          resolve(null);
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

    // 处理图片
    const imgBase64List: string[] = [];
    const imgElements = Array.from(clone.querySelectorAll('.preview-image')) as HTMLImageElement[];
    if (imgElements.length > 0) {
      console.log(`Found ${imgElements.length} image(s)`);
      for (const imgEl of imgElements) {
        if (imgEl.src) {
          console.log('Found image URL:', imgEl.src);
          const base64 = await this.getBase64Safe(imgEl.src);
          if (base64) {
            imgBase64List.push(base64);
            console.log('Converted to Base64 (length):', base64.length);
          }
        }
      }
      console.log(`Successfully converted ${imgBase64List.length} image(s) to Base64`);
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
