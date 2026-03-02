import { storageService } from '@/core/services/StorageService';
import { StorageKeys } from '@/core/types/common';
import type { ConversationReference, Folder } from '@/pages/content/folder/types';

/**
 * Service for handling automatic categorization of conversations using AI.
 * Uses a dedicated "Native Session Classifier" to avoid API costs.
 */
export class AutoCategorizationService {
  private static instance: AutoCategorizationService;
  private isProcessing = false;
  private classifierSessionName = '[Voyager] Classifier';

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
  public async categorizeCurrentConversation(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const currentTitle = this.getCurrentConversationTitle();
      const currentUrl = window.location.href;

      if (!currentTitle) {
        console.warn('[AutoCategorization] Could not determine current conversation title.');
        return;
      }

      // 1. Get folders for prompt
      const folders = await this.getFolders();
      const prompt = this.generatePrompt(currentTitle, folders);

      // 2. Navigate to classifier session
      const classifierUrl = await this.ensureClassifierSession();
      if (!classifierUrl) {
        throw new Error('Failed to create or find classifier session');
      }

      // 3. Navigate to classifier
      this.navigateTo(classifierUrl);

      // 4. Wait for page load and send prompt
      // TODO: Implement wait and send logic

      // 5. Navigate back
      // this.navigateTo(currentUrl);
    } catch (error) {
      console.error('[AutoCategorization] Error during categorization:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private getCurrentConversationTitle(): string | null {
    // Attempt to find title from sidebar or header
    const activeItem = document.querySelector(
      'conversation-item.selected, .selected conversation-item, a[aria-current="page"]',
    );
    return activeItem?.textContent?.trim() || document.title || null;
  }

  private async getFolders(): Promise<Folder[]> {
    const result = await storageService.get<any>(StorageKeys.FOLDER_DATA);
    return result.success ? result.data.folders : [];
  }

  private generatePrompt(title: string, folders: Folder[]): string {
    const folderNames = folders.map((f) => f.name).join(', ');
    return `Please categorize the following conversation title into one of these folders: [${folderNames}]. 
Title: "${title}"
Return ONLY the name of the folder. If it doesn't fit any, return "None".`;
  }

  private async ensureClassifierSession(): Promise<string | null> {
    // TODO: Search sidebar for classifier session name and return its URL
    // If not found, click "New Chat" and rename it? Or just use a specific tag?
    // For now, let's assume we can find it by name in the sidebar.
    const conversations = document.querySelectorAll('conversation-item, .conversation-list-item');
    for (const item of Array.from(conversations)) {
      if (item.textContent?.includes(this.classifierSessionName)) {
        const link = item.closest('a');
        return link?.href || null;
      }
    }
    return null;
  }

  private navigateTo(url: string) {
    if (window.location.href === url) return;

    // Use SPA-friendly navigation if possible
    const link = document.createElement('a');
    link.href = url;
    link.click();
  }
}

export const autoCategorizationService = AutoCategorizationService.getInstance();
