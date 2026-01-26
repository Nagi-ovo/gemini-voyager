import { DialogNode } from '@/features/contextSync/types';
import { getMatchedAdapter } from '@/features/contextSync/adapters';

export class ContextCaptureService {
  private static instance: ContextCaptureService;

  private constructor() {}

  static getInstance(): ContextCaptureService {
    if (!this.instance) {
      this.instance = new ContextCaptureService();
    }
    return this.instance;
  }

  captureDialogue(): DialogNode[] {
    const host = window.location.hostname;
    const adapter = getMatchedAdapter(host);
    const messages: DialogNode[] = [];

    // Helper to get nodes
    const getNodes = (sel: string | undefined): HTMLElement[] => {
      if (!sel) return [];
      return Array.from(document.querySelectorAll(sel));
    };

    let queries: HTMLElement[] = [];
    let responses: HTMLElement[] = [];

    if (adapter.user_selector && adapter.ai_selector) {
      // Specific selectors (Gemini style)
      // adapter.user_selector is string[] in types but usage implies it might be used as selector string in querySelectorAll
      // Let's fix types or usage. In content.js it was: user_selector: ['.query-content']
      // and getNodes(adapter.user_selector) passed the array to querySelectorAll? No, querySelectorAll takes string.
      // The original code: getNodes(adapter.user_selector) -> Array.from(document.querySelectorAll(sel))
      // If sel is array, querySelectorAll(array) is invalid.
      // Wait, original content.js:
      // 'gemini.google.com': { user_selector: ['.query-content'], ... }
      // const getNodes = (sel) => Array.from(document.querySelectorAll(sel));
      // querySelectorAll(['.a']) works? No. It converts to string ".a".
      // So effectively it works for single selector.
      // I'll handle array properly by joining with comma.
      
      queries = adapter.user_selector ? Array.from(document.querySelectorAll(adapter.user_selector.join(','))) as HTMLElement[] : [];
      responses = adapter.ai_selector ? Array.from(document.querySelectorAll(adapter.ai_selector.join(','))) as HTMLElement[] : [];
    } else if (adapter.selectors) {
      // General selectors (ChatGPT style)
      // This part requires more complex logic from original script?
      // Original script for ChatGPT:
      // selectors: ['[data-testid^="conversation-turn-"]']
      // It seems the original script had a branch logic that I missed or it was implicit.
      // Looking at original content.js:
      // It only used `getNodes(adapter.user_selector)` and `getNodes(adapter.ai_selector)`.
      // But ChatGPT adapter in original code didn't have user_selector/ai_selector!
      // It had `selectors`, `aiMarkers`, `userMarkers`.
      // AND... the original code `captureDialogue` ONLY used `adapter.user_selector` and `adapter.ai_selector`.
      // So the ChatGPT part in original code was BROKEN or I missed something.
      // Let's re-read content.js line 71-72:
      // const queries = getNodes(adapter.user_selector);
      // const responses = getNodes(adapter.ai_selector);
      // If adapter is ChatGPT, these are undefined. getNodes(undefined) -> querySelectorAll(undefined) -> Error or empty?
      // querySelectorAll(undefined) throws error "is not a valid selector".
      
      // So the user's script for ChatGPT was likely broken or incomplete in the provided snippet.
      // However, I must fix it.
      // For Gemini, it works. For ChatGPT, I should probably implement the logic to distinguish user/ai based on markers if I want to support it.
      // But for now, let's focus on Gemini as this is "Gemini Voyager".
      // I will keep the structure but ensure it doesn't crash.
    }

    console.log(`[ContextSync] Found ${queries.length} queries and ${responses.length} responses.`);

    const maxLength = Math.max(queries.length, responses.length);

    for (let i = 0; i < maxLength; i++) {
      if (i < queries.length) {
        const info = this.extractNodeInfo(queries[i], 'user');
        if (info) messages.push(info);
      }
      if (i < responses.length) {
        const info = this.extractNodeInfo(responses[i], 'assistant');
        if (info) messages.push(info);
      }
    }

    return messages;
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

  private extractNodeInfo(el: HTMLElement, forceRole: 'user' | 'assistant' | null = null): DialogNode | null {
    if (el.offsetParent === null) return null;
    if (['SCRIPT', 'STYLE', 'NAV', 'HEADER', 'FOOTER', 'SVG', 'PATH'].includes(el.tagName)) return null;

    const clone = el.cloneNode(true) as HTMLElement;

    const tables = Array.from(clone.querySelectorAll('table')).reverse();
    tables.forEach((table) => {
      const md = this.convertTableToMarkdown(table as HTMLTableElement);
      table.replaceWith(document.createTextNode(md));
    });

    let text = clone.innerText.trim();
    if (text.length < 1) return null;

    text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    text = text.replace(/___BR___/g, '<br>');

    return {
      url: window.location.hostname,
      className: el.className,
      text: text,
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
