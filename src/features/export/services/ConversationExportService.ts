/**
 * Conversation Export Service
 * Unified service for exporting conversations in multiple formats
 * Uses Strategy pattern for format-specific implementations
 */

import type { ChatTurn, ConversationMetadata, ExportFormat, ExportOptions, ExportResult } from '../types/export';

import { MarkdownFormatter } from './MarkdownFormatter';
import { PDFPrintService } from './PDFPrintService';

/**
 * Main export service
 * Coordinates different export strategies
 */
export class ConversationExportService {
  /**
   * Export conversation in specified format
   */
  static async export(
    turns: ChatTurn[],
    metadata: ConversationMetadata,
    options: ExportOptions,
  ): Promise<ExportResult> {
    try {
      switch (options.format) {
        case 'json':
          return this.exportJSON(turns, metadata, options);

        case 'markdown':
          return this.exportMarkdown(turns, metadata, options);

        case 'pdf':
          return await this.exportPDF(turns, metadata, options);

        default:
          return {
            success: false,
            format: options.format,
            error: `Unsupported format: ${options.format}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        format: options.format,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Export as JSON (existing format)
   */
  private static exportJSON(turns: ChatTurn[], metadata: ConversationMetadata, options: ExportOptions): ExportResult {
    const payload = {
      format: 'gemini-voyager.chat.v1' as const,
      url: metadata.url,
      exportedAt: metadata.exportedAt,
      count: metadata.count,
      items: turns,
    };

    const filename = options.filename || this.generateFilename('json');
    this.downloadJSON(payload, filename);

    return {
      success: true,
      format: 'json' as ExportFormat,
      filename,
    };
  }

  /**
   * Export as Markdown
   */
  private static exportMarkdown(
    turns: ChatTurn[],
    metadata: ConversationMetadata,
    options: ExportOptions,
  ): ExportResult {
    const markdown = MarkdownFormatter.format(turns, metadata);
    const filename = options.filename || MarkdownFormatter.generateFilename();

    MarkdownFormatter.download(markdown, filename);

    return {
      success: true,
      format: 'markdown' as ExportFormat,
      filename,
    };
  }

  /**
   * Export as PDF (using print dialog)
   */
  private static async exportPDF(
    turns: ChatTurn[],
    metadata: ConversationMetadata,
    options: ExportOptions,
  ): Promise<ExportResult> {
    await PDFPrintService.export(turns, metadata);

    // Note: We can't get the actual filename from print dialog
    // User chooses filename in Save as PDF dialog
    return {
      success: true,
      format: 'pdf' as ExportFormat,
      filename: options.filename || this.generateFilename('pdf'),
    };
  }

  /**
   * Download JSON file
   */
  private static downloadJSON(data: unknown, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
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
   * Generate filename with timestamp
   */
  private static generateFilename(extension: string): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `gemini-chat-${y}${m}${day}-${hh}${mm}${ss}.${extension}`;
  }

  /**
   * Get available export formats
   */
  static getAvailableFormats(): Array<{
    format: ExportFormat;
    label: string;
    description: string;
    recommended?: boolean;
  }> {
    return [
      {
        format: 'json' as ExportFormat,
        label: 'JSON',
        description: 'Machine-readable format for developers',
      },
      {
        format: 'markdown' as ExportFormat,
        label: 'Markdown',
        description: 'Clean, portable text format (recommended)',
        recommended: true,
      },
      {
        format: 'pdf' as ExportFormat,
        label: 'PDF',
        description: 'Print-friendly format via Save as PDF',
      },
    ];
  }
}
