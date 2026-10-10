import type { ExportPlatformAdapter } from '@/pages/content/export/adapter/platformAdapters';
import { resolveExportAdapter } from '@/pages/content/export/adapter/platformAdapters';

import { processYouTubeCovers } from '../DOMContentExtractor';
import { escapeHtmlAttribute, normalizeText } from '../exportDomPolicy';

export const domExtractorTestAdapter: ExportPlatformAdapter = {
  ...resolveExportAdapter(),
  extractUserImage: (element) =>
    element.querySelectorAll<HTMLImageElement>('user-query-file-preview img, .preview-image'),
  extractAssistantImage: (
    child,
    htmlParts,
    textParts,
    flags,
    tagName,
    _debug,
    processedImageSrcs,
  ) => {
    if (
      child.querySelector(
        '.attachment-container.youtube img.thumbnail, youtube-block img.thumbnail, single-video img.thumbnail',
      )
    ) {
      return processYouTubeCovers(child, htmlParts, textParts, flags);
    }
    if (tagName !== 'img') return undefined;

    const image = child as HTMLImageElement;
    const src = image.src || image.getAttribute('src') || '';
    if (src && src !== 'about:blank' && !processedImageSrcs?.has(src)) {
      processedImageSrcs?.add(src);
      const alt = image.getAttribute('alt')?.trim() || 'Image';
      flags.hasImages = true;
      htmlParts.push(`<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}" />`);
      textParts.push(`\n![${alt.replace(/\]/g, '\\]')}](${src})\n`);
    }
    return true;
  },
  extractFormula: () => undefined,
  extractCodeBlock: () => undefined,
  extractUserText: (textLines, textParts, element) => {
    textLines.forEach((line) => {
      const text = normalizeText(line.textContent ?? '');
      if (text) textParts.push(text);
    });
    if (textParts.length === 0) {
      const contentOnly = element.cloneNode(true) as HTMLElement;
      Array.from(contentOnly.querySelectorAll<HTMLElement>('[role="group"][aria-label]')).forEach(
        (candidate) => candidate.remove(),
      );
      const fallback = normalizeText(contentOnly.textContent ?? '');
      if (fallback) textParts.push(fallback);
    }
  },
  getUserAttachmentCandidates: (element) => {
    const geminiUploadedFiles = Array.from(
      element.querySelectorAll<HTMLElement>(
        'user-query-file-preview [data-test-id="uploaded-file"]',
      ),
    );
    if (geminiUploadedFiles.length > 0) return geminiUploadedFiles;

    const geminiFilePreviews = Array.from(
      element.querySelectorAll<HTMLElement>('user-query-file-preview .new-file-preview-file'),
    );
    if (geminiFilePreviews.length > 0) return geminiFilePreviews;

    return Array.from(element.querySelectorAll<HTMLElement>('[role="group"][aria-label]')).filter(
      (candidate) => {
        const name = candidate.getAttribute('aria-label')?.trim();
        const buttonName = candidate
          .querySelector<HTMLElement>('[data-default-action] button[aria-label]')
          ?.getAttribute('aria-label')
          ?.trim();
        return !!name && name === buttonName;
      },
    );
  },
};
