/**
 * Image export service
 *
 * Generates a single PNG image from a rendered export document.
 * Uses DOM-to-image rendering and inlines remote images (best-effort).
 */
import { isSafari } from '@/core/utils/browser';

import { isEventLikeImageRenderError } from '../types/errors';
import type { ChatTurn, ConversationMetadata } from '../types/export';
import { DOMContentExtractor } from './DOMContentExtractor';
import { renderElementToImageBlob } from './ImageRenderService';

export interface RenderableDocumentContent {
  title: string;
  url: string;
  exportedAt: string;
  markdown: string;
  html: string;
}

export class ImageExportService {
  private static readonly PRIMARY_RENDER_MAX_ATTEMPTS = 3;

  private static readonly PRIMARY_RENDER_RETRY_DELAY_MS = 260;

  static async export(
    turns: ChatTurn[],
    metadata: ConversationMetadata,
    options: { filename: string; fontSize?: number },
  ): Promise<void> {
    const filename = options.filename.toLowerCase().endsWith('.png')
      ? options.filename
      : `${options.filename}.png`;

    const blob = await this.renderConversationBlob(turns, metadata, options);
    this.downloadBlob(blob, filename);
  }

  static async exportDocument(
    content: RenderableDocumentContent,
    options: { filename: string },
  ): Promise<void> {
    const filename = options.filename.toLowerCase().endsWith('.png')
      ? options.filename
      : `${options.filename}.png`;

    const blob = await this.renderDocumentBlob(content);
    this.downloadBlob(blob, filename);
  }

  static async renderConversationBlob(
    turns: ChatTurn[],
    metadata: ConversationMetadata,
    options: { fontSize?: number },
  ): Promise<Blob> {
    const container = this.createRenderContainer(turns, metadata, options.fontSize);
    return await this.renderContainerToBlob(container);
  }

  static async renderDocumentBlob(content: RenderableDocumentContent): Promise<Blob> {
    const container = this.createDocumentRenderContainer(content);
    return await this.renderContainerToBlob(container);
  }

  private static createRenderContainer(
    turns: ChatTurn[],
    metadata: ConversationMetadata,
    fontSize?: number,
  ): HTMLElement {
    const outer = document.createElement('div');
    outer.className = 'gv-image-export-container';
    Object.assign(outer.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '620px',
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

    const basePx = fontSize ?? 20;
    const titlePx = Math.round(basePx * 2.5);
    const metaPx = Math.max(basePx - 2, 10);
    const headerPx = Math.round(basePx * 1.2);
    const codePx = Math.max(basePx - 2, 10);
    const footerPx = Math.max(basePx - 4, 10);

    const style = document.createElement('style');
    style.textContent = `
      .gv-image-export-doc {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: ${basePx}px;
        line-height: 1.9;
        padding: 26px;
      }

      .gv-image-export-header {
        margin-bottom: 18px;
        padding-bottom: 14px;
        border-bottom: 1px solid rgba(0,0,0,0.12);
      }

      .gv-image-export-title {
        margin: 0;
        font-size: ${titlePx}px;
        line-height: 1.2;
        color: #111827;
        word-break: break-word;
      }

      .gv-image-export-meta {
        margin-top: 10px;
        color: #6b7280;
        font-size: ${metaPx}px;
        display: grid;
        gap: 8px;
      }

      .gv-image-export-turn {
        margin: 24px 0;
        padding: 20px 0;
        border-bottom: 1px solid rgba(0,0,0,0.08);
      }

      .gv-image-export-turn-header {
        font-weight: 700;
        font-size: ${headerPx}px;
        color: #374151;
        margin-bottom: 14px;
      }

      .gv-image-export-block {
        margin: 16px 0;
      }

      .gv-image-export-label {
        font-weight: 700;
        font-size: ${basePx}px;
        margin-bottom: 10px;
        color: #111827;
      }

      .gv-image-export-content {
        font-size: ${basePx}px;
        padding-left: 16px;
        border-left: 3px solid rgba(0,0,0,0.10);
      }

      .gv-image-export-content img {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 12px 0;
      }

      .gv-image-export-content pre {
        background: rgba(0,0,0,0.05);
        padding: 14px 16px;
        border-radius: 8px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: ${codePx}px;
        line-height: 1.8;
      }

      .gv-image-export-footer {
        margin-top: 24px;
        padding-top: 14px;
        border-top: 1px solid rgba(0,0,0,0.12);
        color: #6b7280;
        font-size: ${footerPx}px;
        display: grid;
        gap: 8px;
      }
    `;

    const doc = document.createElement('div');
    doc.className = 'gv-image-export-doc';
    doc.innerHTML = `${headerHtml}${turnsHtml}${footerHtml}`;

    outer.appendChild(style);
    outer.appendChild(doc);
    return outer;
  }

  private static createDocumentRenderContainer(content: RenderableDocumentContent): HTMLElement {
    const outer = document.createElement('div');
    outer.className = 'gv-image-export-container';
    Object.assign(outer.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '620px',
      background: '#ffffff',
      color: '#111827',
      zIndex: '-1',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);

    const date = this.formatDate(content.exportedAt);
    const bodyHtml = content.html.trim() || this.formatPlainTextAsHtml(content.markdown);
    const headerHtml = `
      <header class="gv-image-export-header">
        <h1 class="gv-image-export-title">${this.escapeHTML(content.title || 'Deep Research Report')}</h1>
        <div class="gv-image-export-meta">
          <div>${this.escapeHTML(date)}</div>
          <div><a href="${this.escapeAttr(content.url)}">${this.escapeHTML(content.url)}</a></div>
        </div>
      </header>
    `;

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
        font-size: 20px;
        line-height: 1.9;
        padding: 26px;
      }

      .gv-image-export-header {
        margin-bottom: 18px;
        padding-bottom: 14px;
        border-bottom: 1px solid rgba(0,0,0,0.12);
      }

      .gv-image-export-title {
        margin: 0;
        font-size: 50px;
        line-height: 1.2;
        color: #111827;
        word-break: break-word;
      }

      .gv-image-export-meta {
        margin-top: 10px;
        color: #6b7280;
        font-size: 18px;
        display: grid;
        gap: 8px;
      }

      .gv-image-export-report-content {
        margin: 18px 0 24px;
        color: #1a1a1a;
        font-size: 20px;
      }

      .gv-image-export-report-content p {
        margin: 12px 0;
      }

      .gv-image-export-report-content img {
        max-width: 100%;
        height: auto;
        display: block;
        margin: 12px 0;
      }

      .gv-image-export-report-content pre {
        background: rgba(0,0,0,0.05);
        padding: 14px 16px;
        border-radius: 8px;
        overflow-x: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 18px;
        line-height: 1.8;
      }

      .gv-image-export-footer {
        margin-top: 24px;
        padding-top: 14px;
        border-top: 1px solid rgba(0,0,0,0.12);
        color: #6b7280;
        font-size: 16px;
        display: grid;
        gap: 8px;
      }
    `;

    const doc = document.createElement('div');
    doc.className = 'gv-image-export-doc';
    doc.innerHTML = `${headerHtml}<main class="gv-image-export-report-content">${bodyHtml}</main>${footerHtml}`;

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
        let src = img.getAttribute('src') || '';
        // For Google images, request original size (=s0) instead of thumbnail
        if (
          /^https?:\/\//i.test(src) &&
          (src.includes('googleusercontent.com') || src.includes('ggpht.com'))
        ) {
          const sizePattern = /=[swh]\d+[^?#]*/;
          src = sizePattern.test(src) ? src.replace(sizePattern, '=s0') : src + '=s0';
        }
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

  private static async renderWithSafariFallback(container: HTMLElement): Promise<Blob> {
    const primaryTarget =
      (container.querySelector('.gv-image-export-doc') as HTMLElement | null) || container;
    const maxPrimaryAttempts = isSafari() ? 1 : this.PRIMARY_RENDER_MAX_ATTEMPTS;
    return await renderElementToImageBlob(primaryTarget, {
      maxAttempts: maxPrimaryAttempts,
      retryDelayMs: this.PRIMARY_RENDER_RETRY_DELAY_MS,
      shouldRetry: (error) => this.shouldRetryPrimaryRender(error),
      enableSanitizedFallback: isSafari(),
      sanitizeSelector: 'img',
      shouldFallback: () => true,
    });
  }

  private static async renderContainerToBlob(container: HTMLElement): Promise<Blob> {
    document.body.appendChild(container);

    try {
      await this.inlineImages(container);
      return await this.renderWithSafariFallback(container);
    } finally {
      try {
        container.remove();
      } catch {
        /* ignore */
      }
    }
  }

  private static shouldRetryPrimaryRender(error: unknown): boolean {
    if (isEventLikeImageRenderError(error)) return true;

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('image') || message.includes('decode') || message.includes('network');
    }

    return false;
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
