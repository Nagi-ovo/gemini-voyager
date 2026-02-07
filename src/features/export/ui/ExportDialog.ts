/**
 * Export Dialog UI
 * Material Design styled format selection dialog
 */
import { isSafari } from '@/core/utils/browser';

import { ConversationExportService } from '../services/ConversationExportService';
import type { ExportFormat } from '../types/export';

export interface ExportDialogOptions {
  onExport: (format: ExportFormat) => void;
  onCancel: () => void;
  translations: {
    title: string;
    selectFormat: string;
    warning: string;
    safariCmdpHint: string;
    safariMarkdownHint: string;
    cancel: string;
    export: string;
    formatDescriptions: Record<ExportFormat, string>;
  };
}

/**
 * Export format selection dialog
 */
export class ExportDialog {
  private overlay: HTMLElement | null = null;
  private selectedFormat: ExportFormat = 'markdown' as ExportFormat;

  /**
   * Show export dialog
   */
  show(options: ExportDialogOptions): void {
    this.overlay = this.createDialog(options);
    document.body.appendChild(this.overlay);

    // Keep initial focus on container to avoid showing a browser focus ring on JSON radio.
    const dialog = this.overlay.querySelector('.gv-export-dialog') as HTMLElement | null;
    dialog?.focus();
  }

  /**
   * Hide and cleanup dialog
   */
  hide(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  /**
   * Create dialog element
   */
  private createDialog(options: ExportDialogOptions): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'gv-export-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'gv-export-dialog';
    dialog.tabIndex = -1;

    // Title
    const title = document.createElement('div');
    title.className = 'gv-export-dialog-title';
    title.textContent = options.translations.title;

    // Subtitle
    const subtitle = document.createElement('div');
    subtitle.className = 'gv-export-dialog-subtitle';
    subtitle.textContent = options.translations.selectFormat;

    // Format options
    const formatsList = document.createElement('div');
    formatsList.className = 'gv-export-format-list';

    const formats = ConversationExportService.getAvailableFormats();
    formats.forEach((formatInfo) => {
      const localizedDescription =
        options.translations.formatDescriptions[formatInfo.format] || formatInfo.description;

      const option = this.createFormatOption(
        { ...formatInfo, description: localizedDescription },
        options.translations.safariCmdpHint,
        options.translations.safariMarkdownHint,
      );
      formatsList.appendChild(option);
    });

    // Buttons
    const buttons = document.createElement('div');
    buttons.className = 'gv-export-dialog-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'gv-export-dialog-btn gv-export-dialog-btn-secondary';
    cancelBtn.textContent = options.translations.cancel;
    cancelBtn.addEventListener('click', () => {
      options.onCancel();
      this.hide();
    });

    const exportBtn = document.createElement('button');
    exportBtn.className = 'gv-export-dialog-btn gv-export-dialog-btn-primary';
    exportBtn.textContent = options.translations.export;
    exportBtn.addEventListener('click', () => {
      options.onExport(this.selectedFormat);
      this.hide();
    });

    buttons.appendChild(cancelBtn);
    buttons.appendChild(exportBtn);

    // Assemble dialog
    dialog.appendChild(title);
    dialog.appendChild(subtitle);
    if (options.translations.warning.trim()) {
      const warning = document.createElement('div');
      warning.className = 'gv-export-dialog-warning';
      warning.textContent = options.translations.warning;
      dialog.appendChild(warning);
    }
    dialog.appendChild(formatsList);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        options.onCancel();
        this.hide();
      }
    });

    // Close on Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        options.onCancel();
        this.hide();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    return overlay;
  }

  /**
   * Create format option radio button
   */
  private createFormatOption(
    formatInfo: {
      format: ExportFormat;
      label: string;
      description: string;
      recommended?: boolean;
    },
    safariCmdpHint: string,
    safariMarkdownHint: string,
  ): HTMLElement {
    const option = document.createElement('label');
    option.className = 'gv-export-format-option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'export-format';
    radio.value = formatInfo.format;
    radio.checked = formatInfo.format === 'markdown';

    if (radio.checked) {
      this.selectedFormat = formatInfo.format;
    }

    radio.addEventListener('change', () => {
      if (radio.checked) {
        this.selectedFormat = formatInfo.format;
      }
    });

    const content = document.createElement('div');
    content.className = 'gv-export-format-content';

    const labelDiv = document.createElement('div');
    labelDiv.className = 'gv-export-format-label';
    labelDiv.textContent = formatInfo.label;

    if (formatInfo.recommended) {
      const badge = document.createElement('span');
      badge.className = 'gv-export-format-badge';
      badge.textContent = 'Recommended';
      labelDiv.appendChild(badge);
    }

    const desc = document.createElement('div');
    desc.className = 'gv-export-format-description';
    let hintText = formatInfo.description;

    if (isSafari()) {
      if (formatInfo.format === ('pdf' as ExportFormat)) {
        hintText = `${formatInfo.description} ${safariCmdpHint}`;
      } else if (formatInfo.format === ('markdown' as ExportFormat)) {
        hintText = `${formatInfo.description} ${safariMarkdownHint}`;
      }
    }

    desc.textContent = hintText;

    content.appendChild(labelDiv);
    content.appendChild(desc);

    option.appendChild(radio);
    option.appendChild(content);

    return option;
  }
}
