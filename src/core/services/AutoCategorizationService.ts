import { promptStorageService, storageService } from '@/core/services/StorageService';
import { StorageKeys } from '@/core/types/common';
import DefaultModelManager from '@/pages/content/defaultModel/modelLocker';
import { getFolderManager } from '@/pages/content/folder/index';
import type { ConversationReference, Folder } from '@/pages/content/folder/types';
import { getTranslationSyncUnsafe } from '@/utils/i18n';

/**
 * Service for handling automatic categorization of conversations using AI.
 * Uses a disposable "new chat" session to avoid API costs.
 * The classifier session is deleted after each use to keep the sidebar clean.
 */
export class AutoCategorizationService {
  private static instance: AutoCategorizationService;
  private isProcessing = false;

  // Robust delete configuration (mirrored from FolderManager)
  private readonly DELETE_CONFIG = {
    MENU_APPEAR_DELAY: 800,
    DIALOG_APPEAR_DELAY: 800,
    DELETION_COMPLETE_DELAY: 3000,
    MAX_BUTTON_WAIT_TIME: 8000,
    BUTTON_CHECK_INTERVAL: 200,
  } as const;

  private constructor() {}

  public static getInstance(): AutoCategorizationService {
    if (!AutoCategorizationService.instance) {
      AutoCategorizationService.instance = new AutoCategorizationService();
    }
    return AutoCategorizationService.instance;
  }

  /**
   * Triggers the categorization process for the current conversation.
   */
  public async categorizeCurrentConversation(userPrompt?: string): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 0. Wait for the CURRENT response to complete (Crucial for stability)
      await this.waitForResponseComplete(20000);

      const currentTitle = this.getCurrentConversationTitle();
      const currentUrl = window.location.href;

      if (!currentTitle || currentUrl.endsWith('/app')) {
        return;
      }

      // 1. Get context and folders
      const lastUserMessage = this.getLastUserMessage(userPrompt);
      const folderManager = getFolderManager();
      if (!folderManager) return;
      const folders = folderManager.data?.folders || [];

      const prompt = this.generatePrompt(currentTitle, folders, lastUserMessage);

      // 2. Setup classifier session (SPA style)
      DefaultModelManager.getInstance().setBypassed(true);
      const classifierUrl = await this.createDisposableSession();
      if (!classifierUrl) throw new Error('Failed to create session');

      // 3. Send categorization prompt
      await this.waitForElement('rich-textarea [contenteditable="true"]', 8000);
      const input = document.querySelector('rich-textarea [contenteditable="true"]') as HTMLElement;
      if (!input) throw new Error('Input not found');

      input.textContent = prompt;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await this.delay(500);

      const sendBtn = document.querySelector(
        'button[aria-label*="Send"], .send-button',
      ) as HTMLElement;
      if (sendBtn) sendBtn.click();

      // 4. Wait for AI response
      await this.waitForResponseComplete(15000);

      const responseText = this.getLatestResponse();
      const classifierConvUrl = window.location.href;

      // 5. Apply categorization
      let matchedFolder = this.findMatchingFolder(responseText, folders);
      const suggestedName = responseText.trim().replace(/['"[\]]/g, '');

      if (suggestedName.toLowerCase() !== 'none') {
        const m = currentUrl.match(/\/app\/([a-fA-F0-9]+)/);
        if (m && m[1]) {
          const conversationId = m[1];
          if (!matchedFolder) {
            const newFolderId = folderManager.createFolderByName(suggestedName);
            matchedFolder = { id: newFolderId, name: suggestedName } as Folder;
            await this.delay(800);
          }
          const convRef: ConversationReference = {
            conversationId,
            title: currentTitle,
            url: currentUrl,
            addedAt: Date.now(),
            isGem: false,
          };
          folderManager.addConversationsToFolder(matchedFolder.id, [convRef]);
        }
      }

      // 6. Navigation Back (SPA to avoid refresh)
      this.navigateTo(currentUrl);

      // 7. Silent Deletion from Sidebar (Happens after we navigate back)
      // Wait for navigation and sidebar to settle (increased to 3.5s)
      await this.delay(3500);
      await this.deleteConversationByUrl(classifierConvUrl);
    } catch (error) {
      // Silently fail to not interrupt user flow
    } finally {
      DefaultModelManager.getInstance().setBypassed(false);
      this.isProcessing = false;
    }
  }

  /**
   * Navigates to a URL using SPA clicks to avoid page reload.
   */
  private navigateTo(url: string) {
    if (window.location.href === url) return;

    // 1. Try to find a sidebar link to trigger SPA navigation
    const m = url.match(/\/app\/([a-fA-F0-9]+)/);
    const hexId = m ? m[1] : null;

    if (hexId) {
      const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/"]');
      for (const link of Array.from(links)) {
        if (link.href.includes(hexId)) {
          link.scrollIntoView({ behavior: 'smooth', block: 'center' });
          link.focus();
          link.click();
          return;
        }
      }
    }

    // 2. Fallback to New Chat button if it's the base /app URL
    if (url.endsWith('/app') || url.endsWith('/app/')) {
      const btn = document.querySelector(
        '[data-test-id="new-chat-button"], a[href="/app"]',
      ) as HTMLElement;
      if (btn) {
        btn.click();
        return;
      }
    }

    // 3. Final fallback: full page reload
    window.location.assign(url);
  }

  private async createDisposableSession(): Promise<string | null> {
    this.navigateTo(window.location.origin + '/app');
    await this.delay(1500);
    return window.location.href;
  }

  /**
   * Advanced Deletion Logic (Aligned with Manager.ts)
   */
  private async deleteConversationByUrl(url: string): Promise<void> {
    const m = url.match(/\/app\/([a-fA-F0-9]+)/);
    if (!m) return;
    const hexId = m[1];

    let conversationEl = this.findNativeConversationElementByHexId(hexId);
    if (!conversationEl) {
      return;
    }

    conversationEl.scrollIntoView({ block: 'center' });
    conversationEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await this.delay(300);

    const moreButton = await this.findAndClickMoreButton(conversationEl);
    if (!moreButton) return;

    await this.delay(this.DELETE_CONFIG.MENU_APPEAR_DELAY);
    const deleteBtnClicked = await this.waitForDeleteButtonAndClick();
    if (!deleteBtnClicked) return;

    await this.delay(this.DELETE_CONFIG.DIALOG_APPEAR_DELAY);
    await this.confirmDeleteIfNeeded();
    await this.delay(this.DELETE_CONFIG.DELETION_COMPLETE_DELAY);
  }

  private findNativeConversationElementByHexId(hexId: string): HTMLElement | null {
    const convs = document.querySelectorAll('[data-test-id="conversation"]');
    for (const conv of Array.from(convs)) {
      const el = conv as HTMLElement;
      const jslog = el.getAttribute('jslog');
      if (jslog && jslog.includes(hexId)) return el;
      const link = el.querySelector('a[href*="/app/"]') as HTMLAnchorElement;
      if (link && link.href.includes(hexId)) return el;
    }
    return null;
  }

  private async findAndClickMoreButton(conversationEl: HTMLElement): Promise<HTMLElement | null> {
    // Gemini often requires a hover/mouseenter to make the button 'active' or visible
    conversationEl.scrollIntoView({ block: 'center' });
    conversationEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await this.delay(400);

    const btn =
      (conversationEl.parentElement?.querySelector(
        '[data-test-id="actions-menu-button"]',
      ) as HTMLElement) ||
      (conversationEl.querySelector('[data-test-id="actions-menu-button"]') as HTMLElement);

    if (btn) {
      btn.click();
      return btn;
    }
    return null;
  }

  private async waitForDeleteButtonAndClick(): Promise<boolean> {
    const keywords = this.getDeleteKeywords();
    const start = Date.now();

    while (Date.now() - start < this.DELETE_CONFIG.MAX_BUTTON_WAIT_TIME) {
      const items = document.querySelectorAll(
        '.cdk-overlay-container button, .cdk-overlay-container [role="menuitem"]',
      );
      for (const item of Array.from(items)) {
        const el = item as HTMLElement;
        // Priority 1: data-test-id
        if (el.getAttribute('data-test-id') === 'delete-button') {
          el.click();
          return true;
        }

        // Priority 2: Keywords
        const text = el.textContent?.toLowerCase().trim() || '';
        if (text && keywords.some((k) => text.includes(k))) {
          el.click();
          return true;
        }
      }
      await this.delay(200);
    }
    return false;
  }

  private async confirmDeleteIfNeeded(): Promise<void> {
    const start = Date.now();
    const timeout = 5000;

    while (Date.now() - start < timeout) {
      const dialog = document.querySelector('mat-dialog-container');
      if (dialog) {
        // Try precise ID first
        const btn =
          (dialog.querySelector('[data-test-id="confirm-button"]') as HTMLElement) ||
          (dialog.querySelector('[data-test-id="delete-button"]') as HTMLElement);

        if (btn) {
          btn.click();
          return;
        }

        // Try text matching as fallback
        const btns = Array.from(dialog.querySelectorAll('button'));
        const textBtn = btns.find((b) => {
          const t = b.textContent?.toLowerCase() || '';
          return (
            t.includes('delete') || t.includes('删除') || t.includes('确定') || t.includes('yes')
          );
        });

        if (textBtn) {
          textBtn.click();
          return;
        }
      }
      await this.delay(250);
    }
  }

  private getDeleteKeywords(): string[] {
    const raw = getTranslationSyncUnsafe('batch_delete_match_patterns') || '';
    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
  }

  // ==================== General Utilities ====================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async waitForElement(selector: string, timeoutMs: number): Promise<Element | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = document.querySelector(selector);
      if (el) return el;
      await this.delay(200);
    }
    return null;
  }

  private async waitForResponseComplete(timeoutMs: number = 20000): Promise<void> {
    const startTime = Date.now();
    await this.delay(500);
    while (Date.now() - startTime < timeoutMs) {
      const stopBtn = document.querySelector(
        'button[aria-label*="Stop"], button mat-icon[fonticon="stop"]',
      );
      if (!stopBtn || (stopBtn as HTMLElement).offsetParent === null) {
        await this.delay(800);
        return;
      }
      await this.delay(500);
    }
  }

  private getLastUserMessage(userPrompt?: string): string | undefined {
    const bubbles = document.querySelectorAll(
      '.user-query-bubble-with-background, [data-message-author="USER"]',
    );
    return bubbles.length > 0 ? bubbles[bubbles.length - 1].textContent?.trim() : userPrompt;
  }

  private getLatestResponse(): string {
    const messages = document.querySelectorAll('message-content');
    return messages.length > 0 ? messages[messages.length - 1].textContent || '' : '';
  }

  private findMatchingFolder(response: string, folders: Folder[]): Folder | null {
    const clean = response
      .trim()
      .toLowerCase()
      .replace(/['"[\]]/g, '');
    return (
      folders.find((f) => f.name.toLowerCase() === clean || clean.includes(f.name.toLowerCase())) ||
      null
    );
  }

  private getCurrentConversationTitle(): string | null {
    const active = document.querySelector('conversation-item.selected, a[aria-current="page"]');
    return active?.textContent?.trim() || document.title.replace(' - Gemini', '') || null;
  }

  private generatePrompt(title: string, folders: Folder[], userPrompt?: string): string {
    const names = folders.map((f) => f.name).join(', ');
    const lang = document.documentElement.lang || 'en';
    return `Categorize: "${title}". Folders: [${names}]. Use user language: ${lang}. Return ONLY the folder name. Context: ${userPrompt?.substring(0, 300) ?? ''}`;
  }
}

export const autoCategorizationService = AutoCategorizationService.getInstance();
