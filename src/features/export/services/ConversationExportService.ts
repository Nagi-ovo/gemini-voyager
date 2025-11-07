/**
 * Conversation Export Service
 * Unified service for exporting conversations in multiple formats
 * Uses Strategy pattern for format-specific implementations
 */

import JSZip from 'jszip';

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
          return await this.exportMarkdown(turns, metadata, options);

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
  private static async exportMarkdown(
    turns: ChatTurn[],
    metadata: ConversationMetadata,
    options: ExportOptions,
  ): Promise<ExportResult> {
    // First create a clean markdown (no inlining)
    const markdown = MarkdownFormatter.format(turns, metadata);
    const imageUrls = MarkdownFormatter.extractImageUrls(markdown);

    // If no images → plain .md
    if (imageUrls.length === 0) {
      const filename = options.filename || MarkdownFormatter.generateFilename();
      MarkdownFormatter.download(markdown, filename);
      return { success: true, format: 'markdown' as ExportFormat, filename };
    }

    // If has images → build a zip with chat.md + assets
    const zip = new JSZip();
    const assetsFolder = zip.folder('assets');
    const mapping = new Map<string, string>();

    // Helper: choose extension by Content-Type or URL
    const pickExt = (contentType: string | null, url: string): string => {
      const byType: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/svg+xml': 'svg',
      };
      if (contentType && byType[contentType]) return byType[contentType];
      const m = url.split('?')[0].match(/\.(png|jpg|jpeg|gif|webp|svg)$/i);
      if (m) return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
      return 'bin';
    };

    let idx = 1;
    const bgFetch = async (u: string): Promise<{ blob: Blob; contentType: string } | null> => {
      try {
        const resp = await new Promise<any>((resolve) => {
          try { chrome.runtime?.sendMessage?.({ type: 'gv.fetchImage', url: u }, resolve); } catch { resolve(null); }
        });
        if (resp && resp.ok && resp.base64) {
          const contentType = String(resp.contentType || 'application/octet-stream');
          const bin = atob(resp.base64);
          const len = bin.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
          return { blob: new Blob([bytes], { type: contentType }), contentType };
        }
      } catch {}
      return null;
    };

    await Promise.all(imageUrls.map(async (url) => {
      // Attempt content-script fetch first
      let blob: Blob | null = null;
      let contentType: string | null = null;
      try {
        const resp = await fetch(url, { credentials: 'include', mode: 'cors' as RequestMode });
        if (resp.ok) {
          contentType = resp.headers.get('Content-Type');
          blob = await resp.blob();
        }
      } catch {}
      // If failed, try background fetch (bypasses page CORS)
      if (!blob) {
        const bg = await bgFetch(url);
        if (bg) {
          blob = bg.blob;
          contentType = bg.contentType;
        }
      }
      if (!blob) return; // leave original URL
      const ext = pickExt(contentType, url);
      const fileName = `img-${String(idx++).padStart(3, '0')}.${ext}`;
      // Store inside the 'assets' folder WITHOUT duplicating the folder name
      await assetsFolder?.file(fileName, blob);
      // Reference in markdown should include the 'assets/' prefix
      mapping.set(url, `assets/${fileName}`);
    }));

    const packagedMd = MarkdownFormatter.rewriteImageUrls(markdown, mapping);
    zip.file('chat.md', packagedMd);

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const filename = (options.filename || MarkdownFormatter.generateFilename()).replace(/\.md$/i, '.zip');
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); } catch {}
      URL.revokeObjectURL(url);
    }, 0);

    return { success: true, format: 'markdown' as ExportFormat, filename };
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
