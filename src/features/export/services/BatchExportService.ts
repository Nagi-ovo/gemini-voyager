/**
 * Batch Export Service
 * Automatically traverses all conversations and exports them as individual JSON files
 */
import JSZip from 'jszip';

import { ConversationCollector } from '../../../pages/content/export';

/**
 * Represents a single conversation link in the sidebar
 */
interface ConversationLink {
  element: HTMLAnchorElement;
  title: string;
  index: number;
}

/**
 * Batch export result
 */
interface BatchExportResult {
  total: number;
  successful: number;
  failed: number;
  conversations: Array<{
    title: string;
    url: string;
    turnCount: number;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Service for batch exporting all Gemini conversations
 */
export class BatchExportService {
  private static readonly CONVERSATIONS_LIST_ID = 'conversations-list-0';
  private static readonly PAGE_LOAD_DELAY = 2000; // ms to wait after clicking
  private static readonly EXPORT_DELAY = 500; // ms to wait before extracting

  /**
   * Export all conversations as a ZIP file containing individual JSON files
   */
  static async exportAllConversations(): Promise<BatchExportResult> {
    console.log('[BatchExport] Starting batch export...');

    // 1. Get all conversation links
    const links = this.getConversationLinks();
    if (links.length === 0) {
      console.warn('[BatchExport] No conversations found');
      return {
        total: 0,
        successful: 0,
        failed: 0,
        conversations: [],
      };
    }

    console.log(`[BatchExport] Found ${links.length} conversations`);

    // 2. Store current URL to return later
    const originalUrl = window.location.href;

    // 3. Export each conversation
    const results: BatchExportResult['conversations'] = [];
    const zip = new JSZip();

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      console.log(`[BatchExport] [${i + 1}/${links.length}] Exporting: ${link.title}`);

      try {
        // Click the conversation link
        await this.clickConversationLink(link.element);

        // Wait for page to load
        await this.delay(this.PAGE_LOAD_DELAY);

        // Extract conversation data
        const conversation = await this.extractCurrentConversation();

        // Add to ZIP
        const filename = this.sanitizeFilename(`${i + 1}_${conversation.title}.json`);
        zip.file(filename, JSON.stringify(conversation, null, 2));

        results.push({
          title: conversation.title,
          url: conversation.url,
          turnCount: conversation.turnCount,
          success: true,
        });

        console.log(`[BatchExport] ✓ Exported: ${link.title} (${conversation.turnCount} turns)`);

        // Small delay before next conversation
        await this.delay(this.EXPORT_DELAY);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[BatchExport] ✗ Failed to export: ${link.title}`, error);

        results.push({
          title: link.title,
          url: link.element.href,
          turnCount: 0,
          success: false,
          error: errorMessage,
        });
      }
    }

    // 4. Generate ZIP file
    console.log('[BatchExport] Generating ZIP file...');
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // 5. Download ZIP
    const timestamp = this.generateTimestamp();
    const zipFilename = `gemini-conversations-${timestamp}.zip`;
    this.downloadBlob(zipBlob, zipFilename);

    console.log(
      `[BatchExport] ✓ Exported ${results.filter((r) => r.success).length}/${links.length} conversations`,
    );

    // 6. Optionally return to original conversation
    if (originalUrl && originalUrl !== window.location.href) {
      console.log('[BatchExport] Returning to original conversation...');
      window.location.href = originalUrl;
    }

    return {
      total: links.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      conversations: results,
    };
  }

  /**
   * Get all conversation links from the sidebar
   */
  private static getConversationLinks(): ConversationLink[] {
    const container = document.getElementById(this.CONVERSATIONS_LIST_ID);
    if (!container) {
      console.error(`[BatchExport] Container #${this.CONVERSATIONS_LIST_ID} not found`);
      return [];
    }

    const links = Array.from(container.querySelectorAll('a'));
    const result: ConversationLink[] = [];

    for (let i = 0; i < links.length; i++) {
      const link = links[i] as HTMLAnchorElement;
      const titleEl = link.querySelector('.conversation-title');
      const title = titleEl
        ? titleEl.textContent?.trim() || `Conversation ${i + 1}`
        : `Conversation ${i + 1}`;

      // Skip if no href (shouldn't happen)
      if (!link.href) continue;

      result.push({
        element: link,
        title,
        index: i,
      });
    }

    return result;
  }

  /**
   * Click a conversation link and wait for navigation
   */
  private static async clickConversationLink(link: HTMLAnchorElement): Promise<void> {
    const oldUrl = window.location.href;

    // Dispatch full mouse event sequence
    const opts = { bubbles: true, cancelable: true, view: window };
    link.dispatchEvent(new MouseEvent('mousedown', opts));
    await this.delay(50);
    link.dispatchEvent(new MouseEvent('mouseup', opts));
    await this.delay(50);
    link.click();

    // Wait for URL to change (with timeout)
    const startTime = Date.now();
    const timeout = 10000; // 10 seconds max

    while (window.location.href === oldUrl && Date.now() - startTime < timeout) {
      await this.delay(100);
    }

    if (window.location.href === oldUrl) {
      throw new Error('URL did not change after clicking conversation link');
    }
  }

  /**
   * Extract the current conversation's data
   */
  private static async extractCurrentConversation(): Promise<{
    format: string;
    title: string;
    url: string;
    exportedAt: string;
    turnCount: number;
    turns: Array<{
      user: string;
      assistant: string;
      starred: boolean;
    }>;
  }> {
    // Wait for content to stabilize after page load
    await this.delay(this.EXPORT_DELAY);

    // Trigger lazy loading using ConversationCollector
    // This ensures all historical messages are loaded before export
    await ConversationCollector.triggerLazyLoad();

    // Get conversation metadata
    const title = this.getConversationTitle();
    const url = window.location.href;
    const exportedAt = new Date().toISOString();

    // Collect chat pairs using ConversationCollector
    const turns = ConversationCollector.collectCurrentPairs();

    return {
      format: 'gemini-voyager.chat.v1',
      title,
      url,
      exportedAt,
      turnCount: turns.length,
      turns,
    };
  }

  /**
   * Get the current conversation's title
   */
  private static getConversationTitle(): string {
    // Try multiple strategies
    const strategies = [
      // Strategy 1: From selected conversation in native sidebar
      () => {
        const actionsContainer = document.querySelector('.conversation-actions-container.selected');
        if (actionsContainer && actionsContainer.previousElementSibling) {
          const convEl = actionsContainer.previousElementSibling as HTMLElement;
          const title = convEl.textContent?.trim() || '';
          return title;
        }
        return '';
      },
      // Strategy 2: From page title
      () => {
        const titleEl = document.querySelector('title');
        const title = titleEl?.textContent?.trim() || '';
        if (title && title !== 'Gemini' && !title.startsWith('Gemini -')) {
          return title;
        }
        return '';
      },
      // Strategy 3: From active conversation in folder UI
      () => {
        const activeFolderTitle = document.querySelector(
          '.gv-folder-conversation.gv-folder-conversation-selected .gv-conversation-title',
        );
        return activeFolderTitle?.textContent?.trim() || '';
      },
    ];

    for (const strategy of strategies) {
      try {
        const title = strategy();
        if (title) {
          return title;
        }
      } catch {
        continue;
      }
    }

    return 'Untitled Conversation';
  }

  /**
   * Sanitize filename for safe file system usage
   */
  private static sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100); // Limit length
  }

  /**
   * Generate timestamp string
   */
  private static generateTimestamp(): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  /**
   * Download a blob as a file
   */
  private static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
    }, 0);
  }

  /**
   * Delay helper
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
