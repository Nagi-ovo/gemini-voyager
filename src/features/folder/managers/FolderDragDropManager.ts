/**
 * Folder Drag & Drop Manager
 * Single Responsibility: Handle all drag and drop operations
 */

import type { DragData, FolderId, ConversationId } from '@/core';
import { logger } from '@/core';

export interface DragDropHandlers {
  onConversationDrop: (folderId: FolderId, data: DragData) => void;
  onFolderDrop: (targetFolderId: FolderId, data: DragData) => void;
  onConversationDropToRoot: (data: DragData) => void;
  onFolderDropToRoot: (data: DragData) => void;
}

export class FolderDragDropManager {
  private readonly logger = logger.createChild('FolderDragDrop');
  private handlers: DragDropHandlers | null = null;

  /**
   * Set event handlers
   */
  setHandlers(handlers: DragDropHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Make element draggable for conversations
   */
  makeConversationDraggable(
    element: HTMLElement,
    conversationId: ConversationId,
    title: string,
    url: string,
    sourceFolderId?: FolderId,
    isGem?: boolean,
    gemId?: string
  ): void {
    element.draggable = true;
    element.style.cursor = 'grab';

    element.addEventListener('dragstart', (e) => {
      const dragData: DragData = {
        type: 'conversation',
        title,
        conversationId,
        url,
        isGem,
        gemId,
        sourceFolderId,
      };

      e.dataTransfer?.setData('application/json', JSON.stringify(dragData));
      element.style.opacity = '0.5';

      this.logger.debug('Conversation drag started', { conversationId, title });
    });

    element.addEventListener('dragend', () => {
      element.style.opacity = '1';
    });
  }

  /**
   * Make folder draggable
   */
  makeFolderDraggable(
    element: HTMLElement,
    folderId: FolderId,
    folderName: string,
    canDrag: boolean
  ): void {
    element.draggable = canDrag;
    element.style.cursor = canDrag ? 'grab' : '';

    if (!canDrag) {
      return;
    }

    element.addEventListener('dragstart', (e) => {
      e.stopPropagation();

      const dragData: DragData = {
        type: 'folder',
        folderId,
        title: folderName,
      };

      e.dataTransfer?.setData('application/json', JSON.stringify(dragData));
      element.style.opacity = '0.5';

      this.logger.debug('Folder drag started', { folderId, folderName });
    });

    element.addEventListener('dragend', () => {
      element.style.opacity = '1';
    });
  }

  /**
   * Setup drop zone for folder
   */
  setupFolderDropZone(element: HTMLElement, folderId: FolderId): void {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.add('gv-folder-dragover');
    });

    element.addEventListener('dragleave', () => {
      element.classList.remove('gv-folder-dragover');
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.remove('gv-folder-dragover');

      const data = e.dataTransfer?.getData('application/json');

      if (!data || !this.handlers) {
        return;
      }

      try {
        const dragData: DragData = JSON.parse(data);

        this.logger.debug('Drop on folder', { folderId, dragType: dragData.type });

        if (dragData.type === 'folder') {
          this.handlers.onFolderDrop(folderId, dragData);
        } else {
          this.handlers.onConversationDrop(folderId, dragData);
        }
      } catch (error) {
        this.logger.error('Failed to handle drop', { error });
      }
    });
  }

  /**
   * Setup root drop zone
   */
  setupRootDropZone(element: HTMLElement): void {
    element.addEventListener('dragover', (e) => {
      const hasData = e.dataTransfer?.types.includes('application/json');

      if (!hasData) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      element.classList.add('gv-folder-list-dragover');
    });

    element.addEventListener('dragleave', (e) => {
      const rect = element.getBoundingClientRect();
      const x = (e as DragEvent).clientX;
      const y = (e as DragEvent).clientY;

      // Only remove class if actually leaving the element
      if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
        element.classList.remove('gv-folder-list-dragover');
      }
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      element.classList.remove('gv-folder-list-dragover');

      const data = e.dataTransfer?.getData('application/json');

      if (!data || !this.handlers) {
        return;
      }

      try {
        const dragData: DragData = JSON.parse(data);

        this.logger.debug('Drop on root', { dragType: dragData.type });

        if (dragData.type === 'folder') {
          this.handlers.onFolderDropToRoot(dragData);
        } else {
          this.handlers.onConversationDropToRoot(dragData);
        }
      } catch (error) {
        this.logger.error('Failed to handle root drop', { error });
      }
    });
  }
}
