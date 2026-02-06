/**
 * Image export service
 *
 * Generates a single PNG image from a rendered export document.
 * Uses DOM-to-image rendering and inlines remote images (best-effort).
 */
import { toBlob } from 'html-to-image';

import type { ChatTurn, ConversationMetadata } from '../types/export';
import { DOMContentExtractor } from './DOMContentExtractor';

export class ImageExportService {
  static async export(
    turns: ChatTurn[],
    metadata: ConversationMetadata,
    options: { filename: string },
  ): Promise<void> {
    const filename = options.filename.toLowerCase().endsWith('.png')
      ? options.filename
      : `${options.filename}.png`;

    const container = this.createRenderContainer(turns, metadata);
    document.body.appendChild(container);

    try {
      await this.inlineImages(container);

      const target =
        (container.querySelector('.gv-image-export-doc') as HTMLElement | null) || container;

      const blob = await toBlob(target, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true,
      });

      if (!blob) {
        throw new Error('Image render failed');
      }

      this.downloadBlob(blob, filename);
    } finally {
      try {
        container.remove();
      } catch {
        /* ignore */
      }
    }
  }

  private static createRenderContainer(turns: ChatTurn[], metadata: ConversationMetadata): HTMLElement {
    const outer = document.createElement('div');
    outer.className = 'gv-image-export-container';
    Object.assign(outer.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '760px',
      background: '#ffffff',
      color: '#111827',
      zIndex: '-1',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);

    const title = metadata.title || 'Conversation';
    const date = this.formatDate(metadata.exportedAt);
    const headerHtml = `
      <header class="gv-image-export-header">
        <h1 class="gv-image-export-title">${this.escapeHTML(title)}</h1>
        <div class="gv-image-export-meta">
          <div>${this.escapeHTML(date)}</div>
          <div><a href="${this.escapeAttr(metadata.url)}">${this.escapeHTML(metadata.url)}</a></div>
          <div>${metadata.count} conversation turns</div>
        </div>
      </header>
    `;

    const turnsHtml = turns
      .map((turn, idx) => {
        const turnIndex = idx + 1;
        const starred = turn.starred ? ' ⭐' : '';
        const userHtml = turn.userElement
          ? DOMContentExtractor.extractUserContent(turn.userElement).html
          : this.formatPlainTextAsHtml(turn.user);
        const assistantHtml = turn.assistantElement
          ? DOMContentExtractor.extractAssistantContent(turn.assistantElement).html
          : this.formatPlainTextAsHtml(turn.assistant);

        if (!turn.omitEmptySections) {
          return `
          <article class="gv-image-export-turn">
            <div class="gv-image-export-turn-header">Turn ${turnIndex}${starred}</div>
            <section class="gv-image-export-block">
              <div class="gv-image-export-label">User</div>
              <div class="gv-image-export-content">${userHtml || '<em>No content</em>'}</div>
            </section>
            <section class="gv-image-export-block">
              <div class="gv-image-export-label">Assistant</div>
              <div class="gv-image-export-content">${assistantHtml || '<em>No content</em>'}</div>
            </section>
          </article>
        `;
        }

        const hasUser = !!turn.userElement || !!turn.user.trim();
        const hasAssistant = !!turn.assistantElement || !!turn.assistant.trim();

        return `
          <article class="gv-image-export-turn">
            <div class="gv-image-export-turn-header">Turn ${turnIndex}${starred}</div>
            ${
              hasUser
                ? `
            <section class="gv-image-export-block">
              <div class="gv-image-export-label">User</div>
              <div class="gv-image-export-content">${userHtml || '<em>No content</em>'}</div>
            </section>
            `
                : ''
            }
            ${
              hasAssistant
                ? `
            <section class="gv-image-export-block">
              <div class="gv-image-export-label">Assistant</div>
              <div class="gv-image-export-content">${assistantHtml || '<em>No content</em>'}</div>
            </section>
            `
                : ''
            }
          </article>
        `;
      })
      .join('\n');

    const footerHtml = `
      <footer class="gv-image-export-footer">
        <div>Exported from Gemini Voyager</div>
        <div>Generated on ${this.escapeHTML(date)}</div>
      </footer>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .gv-image-export-doc {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 16px;
        line-height: 1.75;
        padding: 32px;
      }

      .gv-image-export-header {
        margin-bottom: 18px;
        padding-bottom: 14px;
        border-bottom: 1px solid rgba(0,0,0,0.12);
      }

      .gv-image-export-title {
        margin: 0;
        font-size: 36px;
        line-height: 1.2;
        color: #111827;
        word-break: break-word;
      }

      .gv-image-export-meta {
        margin-top: 10px;
        color: #6b7280;
        font-size: 14px;
        display: grid;
        gap: 6px;
      }

      .gv-image-export-turn {
        margin: 20px 0;
        padding: 16px 0;
        border-bottom: 1px solid rgba(0,0,0,0.08);
      }

      .gv-image-export-turn-header {
        font-weight: 700;
        font-size: 18px;
        color: #374151;
        margin-bottom: 12px;
      }

      .gv-image-export-block {
        margin: 14px 0;
      }

      .gv-image-export-label {
        font-weight: 700;
        font-size: 15px;
        margin-bottom: 8px;
        color: #111827;
      }

      .gv-image-export-content {
        padding-left: 14px;
        border-left: 3px solid rgba(0,0,0,0.10);
      }

      .gv-image-export-content img {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 10px 0;
      }

      .gv-image-export-content pre {
        background: rgba(0,0,0,0.05);
        padding: 12px 14px;
        border-radius: 8px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 14px;
        line-height: 1.6;
      }

      .gv-image-export-footer {
        margin-top: 20px;
        padding-top: 12px;
        border-top: 1px solid rgba(0,0,0,0.12);
        color: #6b7280;
        font-size: 13px;
        display: grid;
        gap: 6px;
      }
    `;

    const doc = document.createElement('div');
    doc.className = 'gv-image-export-doc';
    doc.innerHTML = `${headerHtml}${turnsHtml}${footerHtml}`;

    outer.appendChild(style);
    outer.appendChild(doc);
    return outer;
  }

  private static async inlineImages(container: HTMLElement): Promise<void> {
    const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
    if (imgs.length === 0) return;

    const blobToDataUrl = async (blob: Blob): Promise<string | null> => {
      try {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('readAsDataURL failed'));
          reader.onload = () => resolve(String(reader.result || ''));
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    };

    const toDataUrl = async (url: string): Promise<string | null> => {
      if (!/^https?:\/\//i.test(url)) return null;

      // Try content-script fetch first
      try {
        const resp = await fetch(url, { credentials: 'include', mode: 'cors' as RequestMode });
        if (resp.ok) {
          const blob = await resp.blob();
          const data = await blobToDataUrl(blob);
          if (data) return data;
        }
      } catch {
        /* ignore */
      }

      // Fallback to background fetch (bypasses page CORS)
      try {
        const data = await new Promise<string | null>((resolve) => {
          try {
            chrome.runtime?.sendMessage?.({ type: 'gv.fetchImage', url }, (resp) => {
              if (resp && resp.ok && resp.base64) {
                const contentType = String(resp.contentType || 'application/octet-stream');
                resolve(`data:${contentType};base64,${resp.base64}`);
              } else {
                resolve(null);
              }
            });
          } catch {
            resolve(null);
          }
        });
        if (data) return data;
      } catch {
        /* ignore */
      }

      return null;
    };

    await Promise.all(
      imgs.map(async (img) => {
        const src = img.getAttribute('src') || '';
        const data = await toDataUrl(src);
        if (data) {
          try {
            img.src = data;
          } catch {
            /* ignore */
          }
        }
      }),
    );

    await Promise.all(
      imgs.map((img) =>
        (img as HTMLImageElement & { decode?: () => Promise<void> }).decode?.().catch(() => {
          /* ignore */
        }),
      ),
    );
  }

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

  private static escapeHTML(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private static escapeAttr(text: string): string {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private static formatPlainTextAsHtml(text: string): string {
    const safe = this.escapeHTML(text || '');
    if (!safe.trim()) return '<em>No content</em>';
    const paras = safe
      .split(/\n\n+/)
      .map((p) => p.replace(/\n/g, '<br>'))
      .map((p) => `<p>${p}</p>`);
    return paras.join('');
  }

  private static formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }
}
