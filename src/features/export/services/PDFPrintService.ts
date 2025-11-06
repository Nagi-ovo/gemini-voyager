/**
 * PDF Print Service
 * Implements elegant "paper book" style PDF export using browser's print function
 * Philosophy: Content over design, readability over fidelity
 */

import type { ChatTurn, ConversationMetadata } from '../types/export';
import { DOMContentExtractor } from './DOMContentExtractor';

/**
 * PDF print service using browser's native print dialog
 * Injects optimized styles for paper-friendly output
 */
export class PDFPrintService {
  private static PRINT_STYLES_ID = 'gv-pdf-print-styles';
  private static PRINT_CONTAINER_ID = 'gv-pdf-print-container';

  /**
   * Export conversation as PDF using browser print
   */
  static async export(turns: ChatTurn[], metadata: ConversationMetadata): Promise<void> {
    // Create print container
    const container = this.createPrintContainer(turns, metadata);
    document.body.appendChild(container);

    // Inject print styles
    this.injectPrintStyles();

    // Small delay to ensure styles are applied
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger print dialog
    window.print();

    // Cleanup after print dialog closes
    // Note: We can't reliably detect when print dialog closes,
    // so we clean up after a reasonable delay
    setTimeout(() => {
      this.cleanup();
    }, 1000);
  }

  /**
   * Create HTML container for printing
   */
  private static createPrintContainer(turns: ChatTurn[], metadata: ConversationMetadata): HTMLElement {
    const container = document.createElement('div');
    container.id = this.PRINT_CONTAINER_ID;
    container.className = 'gv-print-only';

    // Build HTML content
    container.innerHTML = `
      <div class="gv-print-document">
        ${this.renderHeader(metadata)}
        ${this.renderContent(turns)}
        ${this.renderFooter(metadata)}
      </div>
    `;

    return container;
  }

  /**
   * Render document header
   */
  private static renderHeader(metadata: ConversationMetadata): string {
    const title = metadata.title || this.extractTitleFromURL(metadata.url);
    const date = this.formatDate(metadata.exportedAt);

    return `
      <header class="gv-print-header">
        <h1 class="gv-print-title">${this.escapeHTML(title)}</h1>
        <div class="gv-print-meta">
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Turns:</strong> ${metadata.count}</p>
          <p><strong>Source:</strong> <a href="${this.escapeHTML(metadata.url)}">Gemini Chat</a></p>
        </div>
      </header>
    `;
  }

  /**
   * Render conversation content
   */
  private static renderContent(turns: ChatTurn[]): string {
    return `
      <main class="gv-print-content">
        ${turns.map((turn, index) => this.renderTurn(turn, index + 1)).join('\n')}
      </main>
    `;
  }

  /**
   * Render a single turn
   */
  private static renderTurn(turn: ChatTurn, index: number): string {
    const starredClass = turn.starred ? 'gv-print-turn-starred' : '';

    // Extract rich content if DOM elements available
    let userContent: string;
    let assistantContent: string;

    if (turn.userElement) {
      const extracted = DOMContentExtractor.extractUserContent(turn.userElement);
      userContent = extracted.html || '<em>No content</em>';
    } else {
      userContent = this.formatContent(turn.user);
    }

    if (turn.assistantElement) {
      const extracted = DOMContentExtractor.extractAssistantContent(turn.assistantElement);
      assistantContent = extracted.html || '<em>No content</em>';
    } else {
      assistantContent = this.formatContent(turn.assistant);
    }

    return `
      <article class="gv-print-turn ${starredClass}">
        <div class="gv-print-turn-header">
          <span class="gv-print-turn-number">Turn ${index}</span>
          ${turn.starred ? '<span class="gv-print-star">⭐</span>' : ''}
        </div>

        <div class="gv-print-turn-user">
          <div class="gv-print-turn-label">👤 User</div>
          <div class="gv-print-turn-text">${userContent}</div>
        </div>

        ${
          assistantContent
            ? `
          <div class="gv-print-turn-assistant">
            <div class="gv-print-turn-label">🤖 Assistant</div>
            <div class="gv-print-turn-text">${assistantContent}</div>
          </div>
        `
            : ''
        }
      </article>
    `;
  }

  /**
   * Format content for HTML output
   */
  private static formatContent(content: string): string {
    if (!content) return '<em>No content</em>';

    // Escape HTML but preserve line breaks
    let formatted = this.escapeHTML(content);

    // Convert double line breaks to paragraphs
    formatted = formatted
      .split('\n\n')
      .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
      .join('');

    return formatted;
  }

  /**
   * Render footer
   */
  private static renderFooter(metadata: ConversationMetadata): string {
    return `
      <footer class="gv-print-footer">
        <p>Exported from <a href="https://github.com/Nagi-ovo/gemini-voyager">Gemini Voyager</a></p>
        <p>Generated on ${this.formatDate(metadata.exportedAt)}</p>
      </footer>
    `;
  }

  /**
   * Inject print-optimized styles
   */
  private static injectPrintStyles(): void {
    // Check if already injected
    if (document.getElementById(this.PRINT_STYLES_ID)) return;

    const style = document.createElement('style');
    style.id = this.PRINT_STYLES_ID;
    style.textContent = `
      /* Hide print container on screen */
      .gv-print-only {
        display: none;
      }

      /* Show print container when printing */
      @media print {
        /* Hide everything except print container */
        body > *:not(#${this.PRINT_CONTAINER_ID}) {
          display: none !important;
        }

        .gv-print-only {
          display: block !important;
        }

        /* Reset page styles */
        @page {
          margin: 2cm;
          size: A4;
        }

        /* Document container */
        .gv-print-document {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 11pt;
          line-height: 1.6;
          color: #000;
          background: #fff;
          max-width: 100%;
        }

        /* Header */
        .gv-print-header {
          margin-bottom: 2em;
          padding-bottom: 1em;
          border-bottom: 2px solid #333;
        }

        .gv-print-title {
          font-size: 20pt;
          font-weight: bold;
          margin: 0 0 0.5em 0;
          color: #000;
        }

        .gv-print-meta {
          font-size: 10pt;
          color: #333;
        }

        .gv-print-meta p {
          margin: 0.25em 0;
        }

        /* Content */
        .gv-print-content {
          margin: 2em 0;
        }

        /* Turn */
        .gv-print-turn {
          margin-bottom: 2em;
          page-break-inside: avoid;
        }

        .gv-print-turn-header {
          display: flex;
          align-items: center;
          gap: 0.5em;
          margin-bottom: 0.5em;
          font-size: 12pt;
          font-weight: bold;
          color: #555;
        }

        .gv-print-turn-starred .gv-print-turn-header {
          color: #d97706;
        }

        .gv-print-star {
          font-size: 14pt;
        }

        /* Turn sections */
        .gv-print-turn-user,
        .gv-print-turn-assistant {
          margin: 1em 0;
        }

        .gv-print-turn-label {
          font-weight: 600;
          font-size: 11pt;
          margin-bottom: 0.5em;
          color: #222;
        }

        .gv-print-turn-text {
          padding-left: 1em;
          border-left: 3px solid #e5e7eb;
          color: #1a1a1a;
        }

        .gv-print-turn-assistant .gv-print-turn-text {
          border-left-color: #93c5fd;
        }

        .gv-print-turn-text p {
          margin: 0.5em 0;
        }

        .gv-print-turn-text em {
          color: #666;
        }

        /* Code blocks (if any) */
        .gv-print-turn-text code,
        .gv-print-turn-text pre {
          font-family: 'Courier New', monospace;
          font-size: 9pt;
          background: #f5f5f5;
          padding: 0.2em 0.4em;
          border-radius: 3px;
        }

        .gv-print-turn-text pre {
          padding: 0.75em;
          border-left: 3px solid #d1d5db;
          overflow-x: auto;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        /* Footer */
        .gv-print-footer {
          margin-top: 2em;
          padding-top: 1em;
          border-top: 1px solid #ccc;
          font-size: 9pt;
          color: #666;
          text-align: center;
        }

        .gv-print-footer p {
          margin: 0.25em 0;
        }

        /* Links */
        a {
          color: #2563eb;
          text-decoration: none;
        }

        a[href]:after {
          content: " (" attr(href) ")";
          font-size: 9pt;
          color: #666;
        }

        /* Utilities */
        strong {
          font-weight: 600;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Cleanup print container and styles
   */
  private static cleanup(): void {
    const container = document.getElementById(this.PRINT_CONTAINER_ID);
    if (container) {
      container.remove();
    }

    // Keep styles for potential reuse
    // They don't affect screen display anyway
  }

  /**
   * Helper: Extract title from URL
   */
  private static extractTitleFromURL(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
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
   * Helper: Format date
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
   * Helper: Escape HTML
   */
  private static escapeHTML(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
