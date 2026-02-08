/**
 * Export Dialog UI
 * Material Design styled format selection dialog
 */
import { isSafari } from '@/core/utils/browser';

import { ConversationExportService } from '../services/ConversationExportService';
import type { ExportFormat } from '../types/export';

export interface ExportDialogOptions {
  onExport: (format: ExportFormat, fontSize?: number) => void;
  onCancel: () => void;
  translations: {
    title: string;
    selectFormat: string;
    warning: string;
    safariCmdpHint: string;
    safariMarkdownHint: string;
    cancel: string;
    export: string;
    fontSizeLabel: string;
    fontSizePreview: string;
    formatDescriptions: Record<ExportFormat, string>;
  };
}

/**
 * Export format selection dialog
 */
/** Default font sizes per format */
const PDF_DEFAULT_FONT_SIZE = 11;
const IMAGE_DEFAULT_FONT_SIZE = 20;
const PDF_MIN = 8;
const PDF_MAX = 16;
const IMAGE_MIN = 14;
const IMAGE_MAX = 28;

export class ExportDialog {
  private overlay: HTMLElement | null = null;
  private selectedFormat: ExportFormat = 'markdown' as ExportFormat;
  private fontSize: number = PDF_DEFAULT_FONT_SIZE;

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

    // Font size section (visible only for PDF/Image)
    const fontSizeSection = this.createFontSizeSection(options);

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
      const isPdfOrImage =
        this.selectedFormat === ('pdf' as ExportFormat) ||
        this.selectedFormat === ('image' as ExportFormat);
      options.onExport(this.selectedFormat, isPdfOrImage ? this.fontSize : undefined);
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
    dialog.appendChild(fontSizeSection);
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
        this.updateFontSizeSection();
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
      } else if (
        formatInfo.format === ('markdown' as ExportFormat) ||
        formatInfo.format === ('image' as ExportFormat)
      ) {
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

  /**
   * Create font size control section with slider and preview
   */
  private createFontSizeSection(options: ExportDialogOptions): HTMLElement {
    const section = document.createElement('div');
    section.className = 'gv-export-fontsize-section';
    // Hidden by default since markdown is initially selected
    section.style.display = 'none';

    // Header row: label + value
    const header = document.createElement('div');
    header.className = 'gv-export-fontsize-header';

    const label = document.createElement('span');
    label.className = 'gv-export-fontsize-label';
    label.textContent = options.translations.fontSizeLabel;

    const value = document.createElement('span');
    value.className = 'gv-export-fontsize-value';
    value.textContent = `${this.fontSize}pt`;

    header.appendChild(label);
    header.appendChild(value);

    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'gv-export-fontsize-slider';
    slider.min = String(PDF_MIN);
    slider.max = String(PDF_MAX);
    slider.step = '1';
    slider.value = String(this.fontSize);

    // Preview text
    const preview = document.createElement('div');
    preview.className = 'gv-export-fontsize-preview';
    preview.textContent = options.translations.fontSizePreview;
    preview.style.fontSize = `${this.fontSize}pt`;

    slider.addEventListener('input', () => {
      this.fontSize = Number(slider.value);
      const unit = this.selectedFormat === ('image' as ExportFormat) ? 'px' : 'pt';
      value.textContent = `${this.fontSize}${unit}`;
      preview.style.fontSize = `${this.fontSize}${unit}`;
    });

    section.appendChild(header);
    section.appendChild(slider);
    section.appendChild(preview);

    return section;
  }

  /**
   * Update font size section visibility and slider range based on selected format
   */
  private updateFontSizeSection(): void {
    if (!this.overlay) return;

    const section = this.overlay.querySelector('.gv-export-fontsize-section') as HTMLElement | null;
    if (!section) return;

    const isPdf = this.selectedFormat === ('pdf' as ExportFormat);
    const isImage = this.selectedFormat === ('image' as ExportFormat);

    if (!isPdf && !isImage) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';

    const slider = section.querySelector('.gv-export-fontsize-slider') as HTMLInputElement | null;
    const value = section.querySelector('.gv-export-fontsize-value') as HTMLElement | null;
    const preview = section.querySelector('.gv-export-fontsize-preview') as HTMLElement | null;

    if (isPdf) {
      this.fontSize = PDF_DEFAULT_FONT_SIZE;
      if (slider) {
        slider.min = String(PDF_MIN);
        slider.max = String(PDF_MAX);
        slider.value = String(this.fontSize);
      }
      if (value) value.textContent = `${this.fontSize}pt`;
      if (preview) preview.style.fontSize = `${this.fontSize}pt`;
    } else {
      this.fontSize = IMAGE_DEFAULT_FONT_SIZE;
      if (slider) {
        slider.min = String(IMAGE_MIN);
        slider.max = String(IMAGE_MAX);
        slider.value = String(this.fontSize);
      }
      if (value) value.textContent = `${this.fontSize}px`;
      if (preview) preview.style.fontSize = `${this.fontSize}px`;
    }
  }
}
