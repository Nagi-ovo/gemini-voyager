/**
 * Markdown formatter service
 * Converts conversation to clean, standard Markdown format
 * Following the "paper book" philosophy - content over design
 */

import type { ChatTurn, ConversationMetadata } from '../types/export';

import { DOMContentExtractor } from './DOMContentExtractor';

/**
 * Markdown formatting service
 * Produces clean, portable Markdown following CommonMark specification
 */
export class MarkdownFormatter {
  /**
   * Fetch URL as data URL (best-effort). Returns null on failure.
   */
  private static async fetchAsDataURL(url: string): Promise<string | null> {
    try {
      const resp = await fetch(url, { credentials: 'include', mode: 'cors' as RequestMode });
      if (!resp.ok || !resp.body) return null;
      const blob = await resp.blob();
      return await new Promise<string>((resolve, reject) => {
        try {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('readAsDataURL failed'));
          reader.onload = () => resolve(String(reader.result || ''));
          reader.readAsDataURL(blob);
        } catch (e) {
          reject(e);
        }
      });
    } catch {
      return null;
    }
  }

  /**
   * Extract image URLs from Markdown (http/https only)
   */
  static extractImageUrls(markdown: string): string[] {
    const imgRegex = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g;
    const out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = imgRegex.exec(markdown)) !== null) {
      out.add(m[1]);
    }
    return Array.from(out);
  }

  /**
   * Rewrite Markdown image URLs using provided mapping (original -> newUrl)
   */
  static rewriteImageUrls(markdown: string, mapping: Map<string, string>): string {
    const imgRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
    return markdown.replace(imgRegex, (_all, alt, url) => {
      const next = mapping.get(url);
      return next ? `![${alt}](${next})` : _all;
    });
  }

  /**
   * Async formatter that tries to inline images as data URLs
   */
  static async formatWithAssets(turns: ChatTurn[], metadata: ConversationMetadata): Promise<string> {
    const md = this.format(turns, metadata);
    const urls = this.extractImageUrls(md);
    if (urls.length === 0) return md;

    const urlToData = new Map<string, string>();
    await Promise.all(
      urls.map(async (u) => {
        const data = await this.fetchAsDataURL(u);
        if (data) urlToData.set(u, data);
      }),
    );
    if (urlToData.size === 0) return md;

    return this.rewriteImageUrls(md, urlToData);
  }
  /**
   * Format conversation as Markdown
   */
  static format(turns: ChatTurn[], metadata: ConversationMetadata): string {
    const sections: string[] = [];

    // Header with metadata
    sections.push(this.formatHeader(metadata));
    sections.push(''); // Empty line

    // Divider
    sections.push('---');
    sections.push('');

    // Conversation turns
    turns.forEach((turn, index) => {
      sections.push(this.formatTurn(turn, index + 1));
      sections.push(''); // Empty line between turns
    });

    // Footer
    sections.push('---');
    sections.push('');
    sections.push(this.formatFooter(metadata));

    return sections.join('\n');
  }

  /**
   * Format header with conversation metadata
   */
  private static formatHeader(metadata: ConversationMetadata): string {
    const lines: string[] = [];

    // Title
    const title = metadata.title || this.extractTitleFromURL(metadata.url);
    lines.push(`# ${this.escapeMarkdown(title)}`);
    lines.push('');

    // Metadata table
    lines.push(`**Date**: ${this.formatDate(metadata.exportedAt)}`);
    lines.push(`**Turns**: ${metadata.count}`);
    lines.push(`**Source**: [Gemini Chat](${metadata.url})`);

    return lines.join('\n');
  }

  /**
   * Format a single conversation turn
   */
  private static formatTurn(turn: ChatTurn, index: number): string {
    const lines: string[] = [];

    // User question
    lines.push(`## Turn ${index}${turn.starred ? ' ⭐' : ''}`);
    lines.push('');
    lines.push('### 👤 User');
    lines.push('');

    // Extract rich content if DOM element available
    if (turn.userElement) {
      const extracted = DOMContentExtractor.extractUserContent(turn.userElement);

      // Handle images
      if (extracted.hasImages) {
        lines.push('*[This turn includes uploaded images]*');
        lines.push('');
      }

      lines.push(extracted.text || '_No content_');
    } else {
      lines.push(this.formatContent(turn.user));
    }

    // Assistant response (always show section, even if empty)
    lines.push('');
    lines.push('### 🤖 Assistant');
    lines.push('');

    if (turn.assistantElement) {
      const extracted = DOMContentExtractor.extractAssistantContent(turn.assistantElement);
      // Fallback to plain assistant text if rich extraction produced nothing
      const fallback = this.formatContent(turn.assistant);
      lines.push(extracted.text || fallback || '_No content_');
    } else {
      lines.push(this.formatContent(turn.assistant));
    }

    return lines.join('\n');
  }

  /**
   * Format content with proper Markdown syntax
   * Preserves code blocks, lists, and other formatting
   */
  private static formatContent(content: string): string {
    if (!content) return '_No content_';

    // Content is already mostly plain text from DOM extraction
    // We just need to ensure proper escaping and structure

    let formatted = content.trim();

    // Detect and preserve code blocks (already formatted by Gemini)
    // The extractAssistantText already gives us clean text
    // We'll just ensure proper indentation for code

    return formatted;
  }

  /**
   * Format footer
   */
  private static formatFooter(metadata: ConversationMetadata): string {
    return [
      `*Exported from [Gemini Voyager](https://github.com/Nagi-ovo/gemini-voyager)*`,
      `*Generated on ${this.formatDate(metadata.exportedAt)}*`,
    ].join('  \n'); // Two spaces for line break
  }

  /**
   * Extract title from URL
   */
  private static extractTitleFromURL(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      // Extract from Gemini URL pattern
      // e.g., /app/conversation-id or /chat/conversation-id
      const match = pathname.match(/\/(app|chat)\/([^/]+)/);
      if (match) {
        const id = match[2];
        return `Gemini Conversation ${id.substring(0, 8)}`;
      }

      return 'Gemini Conversation';
    } catch {
      return 'Gemini Conversation';
    }
  }

  /**
   * Format date in readable format
   */
  private static formatDate(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  /**
   * Escape special Markdown characters
   */
  private static escapeMarkdown(text: string): string {
    // Escape special characters that could break Markdown
    return text.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1');
  }

  /**
   * Generate filename for Markdown export
   */
  static generateFilename(): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `gemini-chat-${y}${m}${day}-${hh}${mm}${ss}.md`;
  }

  /**
   * Download Markdown file
   */
  static download(content: string, filename?: string): void {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || this.generateFilename();
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
}
