/**
 * "Copy response as image" button in each Gemini response's action bar.
 *
 * Clicking it offers three widths, renders that single response to a PNG and
 * puts it on the clipboard. Safari falls back to the native pasteboard bridge,
 * then to a download; other browsers report an unsupported clipboard.
 */
import { isSafari } from '@/core/utils/browser';
import type { AppLanguage } from '@/utils/language';

import type {
  ConversationMetadata,
  ExportSpeakerLabels,
} from '../../../features/export/types/export';
import { DEFAULT_IMAGE_EXPORT_WIDTH } from '../../../features/export/types/export';
import { showExportNotice } from '../../../features/export/ui/exportToasts';
import { removeCanvasExportSections } from './conversationCollector';
import { type ExportDictionaries, createExportTranslator } from './exportLocale';
import type { ExportSite } from './exportSite';
import { injectResponseActionCopyImageButtons } from './responseActionImageButton';
import { showResponseActionCopyImageMenu } from './responseActionImageMenu';
import {
  copyImageBlobToClipboard,
  copyImageBlobViaSafariNativePasteboard,
  downloadImageBlob,
  renderResponseImageBlob,
} from './responseImageCopy';

export interface ResponseCopyImageOptions {
  dict: ExportDictionaries;
  /** Current UI language, read on every click and injection. */
  language: () => AppLanguage;
  site: Pick<ExportSite, 'label' | 'title' | 'turns'>;
  /** The `site.turns` message id of the response a copy button belongs to. */
  assistantMessageIdFor: (trigger: HTMLElement) => string | null;
}

type ResponseCopyImageTexts = {
  label: string;
  copied: string;
  downloaded: string;
  failed: string;
  unsupported: string;
  targetMissing: string;
  widthNarrow: string;
  widthMedium: string;
  widthWide: string;
};

/** Outcomes that ask the user to do something differently stay a little longer. */
const NOTICE_LONG_MS = 3200;

let responseActionObserver: MutationObserver | null = null;

function getResponseCopyImageTexts(
  lang: AppLanguage,
  dict: ExportDictionaries,
): ResponseCopyImageTexts {
  const t = createExportTranslator(dict, lang);
  if (lang === 'zh') {
    return {
      label: '复制回复为图片',
      copied: '已复制回复图片',
      downloaded: '已下载回复图片（Safari 剪贴板限制）',
      failed: '复制回复图片失败',
      unsupported: '当前浏览器不支持复制图片到剪贴板',
      targetMissing: '未找到可复制的回复内容',
      widthNarrow: t('export_image_width_narrow'),
      widthMedium: t('export_image_width_medium'),
      widthWide: t('export_image_width_wide'),
    };
  }

  if (lang === 'zh_TW') {
    return {
      label: '複製回覆為圖片',
      copied: '已複製回覆圖片',
      downloaded: '已下載回覆圖片（Safari 剪貼簿限制）',
      failed: '複製回覆圖片失敗',
      unsupported: '目前瀏覽器不支援將圖片複製到剪貼簿',
      targetMissing: '找不到可複製的回覆內容',
      widthNarrow: t('export_image_width_narrow'),
      widthMedium: t('export_image_width_medium'),
      widthWide: t('export_image_width_wide'),
    };
  }

  return {
    label: 'Copy response as image',
    copied: 'Response image copied',
    downloaded: 'Downloaded response image (Safari clipboard limitation)',
    failed: 'Failed to copy response image',
    unsupported: 'Clipboard image copy is not supported in this browser',
    targetMissing: 'Unable to locate response content',
    widthNarrow: t('export_image_width_narrow'),
    widthMedium: t('export_image_width_medium'),
    widthWide: t('export_image_width_wide'),
  };
}

function buildResponseImageFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `gemini-response-${stamp}.png`;
}

function isUnsupportedClipboardError(error: unknown): boolean {
  if (error instanceof DOMException) {
    const name = error.name.toLowerCase();
    if (name === 'notallowederror' || name === 'notsupportederror' || name === 'securityerror') {
      return true;
    }
  }

  if (!(error instanceof Error)) return false;

  if (/clipboard image copy is not supported/i.test(error.message)) {
    return true;
  }

  const lowerMessage = error.message.toLowerCase();
  return (
    lowerMessage.includes('clipboard') &&
    (lowerMessage.includes('not allowed') ||
      lowerMessage.includes('permission') ||
      lowerMessage.includes('gesture') ||
      lowerMessage.includes('unsupported'))
  );
}

async function copyResponseAsImage(
  trigger: HTMLElement,
  options: ResponseCopyImageOptions,
  imageWidth: number = DEFAULT_IMAGE_EXPORT_WIDTH,
): Promise<void> {
  if (trigger.dataset.gvCopyImageBusy === '1') {
    return;
  }
  trigger.dataset.gvCopyImageBusy = '1';

  const { dict, site } = options;
  const lang = options.language();
  const texts = getResponseCopyImageTexts(lang, dict);
  const t = createExportTranslator(dict, lang);
  const speakerDefaults: ExportSpeakerLabels = {
    user: t('export_speaker_user_default'),
    assistant: t('export_speaker_assistant_default'),
  };
  const messageId = options.assistantMessageIdFor(trigger);
  let blobForFallback: Blob | null = null;
  try {
    if (!messageId) {
      showExportNotice(texts.targetMissing, { tone: 'warning' });
      return;
    }

    const turnsForExport = await site.turns.build(new Set<string>([messageId]), {});
    if (turnsForExport.length === 0) {
      showExportNotice(texts.targetMissing, { tone: 'warning' });
      return;
    }

    const metadata: ConversationMetadata = {
      url: location.href,
      exportedAt: new Date().toISOString(),
      count: turnsForExport.length,
      title: site.title(),
      platform: site.label,
    };

    const blob = await renderResponseImageBlob(turnsForExport, metadata, {
      imageWidth,
      speakerDefaults,
    });
    blobForFallback = blob;
    await copyImageBlobToClipboard(blob);
    showExportNotice(texts.copied, { tone: 'success' });
  } catch (error) {
    if (isSafari() && blobForFallback) {
      if (await copyImageBlobViaSafariNativePasteboard(blobForFallback)) {
        showExportNotice(texts.copied, { tone: 'success' });
        return;
      }
      downloadImageBlob(blobForFallback, buildResponseImageFilename());
      showExportNotice(texts.downloaded, { durationMs: NOTICE_LONG_MS });
      return;
    }
    if (isUnsupportedClipboardError(error)) {
      showExportNotice(texts.unsupported, { tone: 'warning', durationMs: NOTICE_LONG_MS });
      return;
    }
    console.error('[Gemini Voyager] Failed to copy response image:', error);
    showExportNotice(texts.failed, { tone: 'error', durationMs: NOTICE_LONG_MS });
  } finally {
    delete trigger.dataset.gvCopyImageBusy;
    removeCanvasExportSections();
  }
}

function injectCopyImageButtons(root: ParentNode, options: ResponseCopyImageOptions): void {
  const texts = getResponseCopyImageTexts(options.language(), options.dict);
  injectResponseActionCopyImageButtons(root, {
    label: texts.label,
    tooltip: texts.label,
    onClick: (button) => {
      showResponseActionCopyImageMenu({
        anchor: button,
        translations: {
          narrow: texts.widthNarrow,
          medium: texts.widthMedium,
          wide: texts.widthWide,
        },
        onSelect: (width) => {
          void copyResponseAsImage(button, options, width);
        },
      });
    },
  });
}

/**
 * Add the button to every response on the page now and to responses rendered
 * later. The page-wide observer is created once and disconnected on
 * `beforeunload`. Returns `relabel`, which re-applies the buttons in the current
 * language (call it after a language change).
 */
export function startResponseCopyImageActions(options: ResponseCopyImageOptions): {
  relabel: () => void;
} {
  const relabel = () => injectCopyImageButtons(document, options);
  relabel();
  if (responseActionObserver) return { relabel };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        injectCopyImageButtons(node, options);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  responseActionObserver = observer;

  window.addEventListener(
    'beforeunload',
    () => {
      try {
        responseActionObserver?.disconnect();
      } catch {}
      responseActionObserver = null;
    },
    { once: true },
  );
  return { relabel };
}
