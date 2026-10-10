import { logger } from '@/core/services/LoggerService';
import type { ToastHandle, Toaster } from '@/core/ui/toast/types';
import { getTranslationSync } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

import { findNativeDownloadButton } from './downloadButton';
import type { ImageHealthFingerprint } from './imageHealthDetector';

/** Download toasts sit beside the clicked button for this long, then join the stack. */
const ANCHOR_TTL_MS = 30000;
const DOWNLOADING_MS = 3000;
const LARGE_WARNING_MS = 8000;
const PROCESSING_FALLBACK_MS = 35000;
const FINAL_MS = { success: 2500, warning: 10000, error: 4000 } as const;

/** Correlate intents and status tokens so an older download cannot finish newer feedback. */
export function createDownloadFeedback({
  getBridge,
  capturePreview,
  toaster,
  isRemovalEnabled,
}: {
  getBridge: () => HTMLElement;
  capturePreview: (button: HTMLButtonElement) => Promise<ImageHealthFingerprint | null>;
  toaster: Toaster;
  isRemovalEnabled: () => boolean;
}) {
  let statusObserver: MutationObserver | null = null;
  const previewFingerprintsByIntent = new Map<string, Promise<ImageHealthFingerprint | null>>();
  let downloadTrackingReady = false;
  let downloadCaptureHandler: ((event: Event) => void) | null = null;
  let lastImmediateToastAt = 0;
  let sequenceCounter = 0;

  // Gemini can spend more than 10s walking the download chain on slow networks
  // before the final rd-gg/rd-gg-dl image request appears.
  const DOWNLOAD_INTENT_TTL_MS = 60000;

  type DownloadToastSequence = {
    id: number;
    token: string;
    download: ToastHandle | null;
    downloadDismissed: boolean;
    warning: ToastHandle | null;
    processing: ToastHandle | null;
    processingTimer: ReturnType<typeof setTimeout> | null;
  };

  let activeSequence: DownloadToastSequence | null = null;

  const open = (handle: ToastHandle | null): ToastHandle | null => (handle?.isOpen ? handle : null);

  // Dismissing feedback must remain possible while the native image download continues.
  const showPending = (message: string, durationMs: number, onDismiss?: () => void): ToastHandle =>
    toaster.show({
      message,
      tone: 'info',
      pending: true,
      durationMs,
      dismissLabel: t('floatingPanelClose', 'Close'),
      onDismiss,
    });

  function showDownloadPending(
    sequence: DownloadToastSequence,
    message: string,
  ): ToastHandle | null {
    // A late status must not reopen a downloading phase the user already closed.
    if (sequence.downloadDismissed) return null;
    return showPending(message, DOWNLOADING_MS, () => {
      sequence.downloadDismissed = true;
    });
  }

  function clearActiveDownloadSequence(): void {
    if (!activeSequence) return;
    previewFingerprintsByIntent.delete(activeSequence.token);
    if (activeSequence.processingTimer) clearTimeout(activeSequence.processingTimer);
    activeSequence = null;
  }

  const t = (key: TranslationKey, fallback: string): string => {
    const value = getTranslationSync(key);
    return value === key ? fallback : value;
  };

  function markDownloadIntent(token: string): void {
    const bridge = getBridge();
    bridge.dataset.downloadIntentExpiresAt = String(Date.now() + DOWNLOAD_INTENT_TTL_MS);
    bridge.dataset.downloadIntentToken = token;
  }

  function beginDownloadSequence(button: HTMLButtonElement): void {
    const now = Date.now();
    if (now - lastImmediateToastAt < 300 && activeSequence) {
      markDownloadIntent(activeSequence.token);
      return;
    }
    lastImmediateToastAt = now;

    if (activeSequence?.processingTimer) {
      clearTimeout(activeSequence.processingTimer);
    }
    if (activeSequence) previewFingerprintsByIntent.delete(activeSequence.token);

    const sequenceId = ++sequenceCounter;
    const token = `gv_download_${now}_${sequenceId}`;
    previewFingerprintsByIntent.set(token, capturePreview(button));
    markDownloadIntent(token);
    toaster.setAnchor(button, ANCHOR_TTL_MS);
    const sequence: DownloadToastSequence = {
      id: sequenceId,
      token,
      download: null,
      downloadDismissed: false,
      warning: null,
      processing: null,
      processingTimer: null,
    };

    if (isRemovalEnabled()) {
      const downloadMessage = t('downloadingOriginal', '正在下载原始图片');
      const processingMessage = t('downloadProcessing', '正在处理水印中');
      sequence.download = showDownloadPending(sequence, downloadMessage);

      sequence.processingTimer = setTimeout(() => {
        if (!activeSequence || activeSequence.id !== sequenceId) return;
        activeSequence.download?.dismiss();
        activeSequence.download = null;
        if (!activeSequence.processing) {
          activeSequence.processing = showPending(processingMessage, PROCESSING_FALLBACK_MS);
        }
      }, DOWNLOADING_MS);
    }

    activeSequence = sequence;
  }

  function setupDownloadButtonTracking(): void {
    if (downloadTrackingReady) return;
    downloadTrackingReady = true;

    downloadCaptureHandler = (event: Event): void => {
      const button = findNativeDownloadButton(event.target);
      if (!button) return;

      beginDownloadSequence(button);
    };

    document.addEventListener('pointerdown', downloadCaptureHandler, true);
    document.addEventListener('click', downloadCaptureHandler, true);
  }

  const finalizeSequence = (
    sequence: DownloadToastSequence,
    tone: 'success' | 'warning' | 'error',
    message: string,
  ): void => {
    if (sequence.processingTimer) {
      clearTimeout(sequence.processingTimer);
      sequence.processingTimer = null;
    }
    sequence.warning?.dismiss();
    sequence.warning = null;
    sequence.download?.dismiss();
    sequence.download = null;

    const final = {
      message,
      tone,
      pending: false,
      durationMs: FINAL_MS[tone],
      dismissLabel: t('floatingPanelClose', 'Close'),
    } as const;
    const processing = open(sequence.processing);
    if (processing) processing.update(final);
    else sequence.processing = toaster.show(final);
  };

  function showDownloading(sequence: DownloadToastSequence, message: string): void {
    sequence.warning?.dismiss();
    sequence.warning = null;
    if (!open(sequence.download)) sequence.download = showDownloadPending(sequence, message);
  }

  function showLargeDownload(
    sequence: DownloadToastSequence,
    message: string,
    warning: string,
  ): void {
    const download = open(sequence.download);
    if (download) download.update({ message, tone: 'info' });
    else sequence.download = showDownloadPending(sequence, message);
    if (!open(sequence.warning)) {
      sequence.warning = toaster.show({
        message: warning,
        tone: 'warning',
        durationMs: LARGE_WARNING_MS,
        dismissLabel: t('floatingPanelClose', 'Close'),
      });
    }
  }

  function showProcessing(sequence: DownloadToastSequence, message: string): void {
    const processing = open(sequence.processing);
    if (processing) {
      processing.update({ message, tone: 'info' });
      return;
    }
    if (!sequence.processingTimer) {
      sequence.processing = showPending(message, PROCESSING_FALLBACK_MS);
    }
  }

  /**
   * Setup listener for status events from fetchInterceptor
   */
  function setupStatusListener(): void {
    if (statusObserver) return;
    const bridge = getBridge();
    const downloadMessage = t('downloadingOriginal', '正在下载原始图片');
    const downloadLargeMessage = t('downloadingOriginalLarge', '正在下载原始图片（大文件）');
    const warningMessage = t('downloadLargeWarning', '大文件警告');
    const processingMessage = t('downloadProcessing', '正在处理水印中');
    const successMessage = t('downloadSuccess', '正在下载');
    const errorPrefix = t('downloadError', '失败');
    const corruptedMessage = t(
      'googleImageCorrupted',
      'Google 返回的原图已损坏（并非 Voyager 导致）；下载结果可能模糊或内容缺失',
    );

    const handleStatus = (statusData: string): void => {
      logger.debug('Watermark status received', { statusData });
      if (!statusData) return;

      try {
        const { type, message, intentToken } = JSON.parse(statusData);
        bridge.removeAttribute('data-status');
        if (!activeSequence || intentToken !== activeSequence.token) return;

        switch (type) {
          case 'DOWNLOADING':
            showDownloading(activeSequence, downloadMessage);
            break;
          case 'DOWNLOADING_LARGE':
            showLargeDownload(activeSequence, downloadLargeMessage, warningMessage);
            break;
          case 'PROCESSING':
            showProcessing(activeSequence, processingMessage);
            break;
          case 'SUCCESS':
            // Step 3: Done, auto-dismiss after 2s
            finalizeSequence(activeSequence, 'success', successMessage);
            break;
          case 'ERROR':
            finalizeSequence(activeSequence, 'error', `${errorPrefix}: ${message}`);
            break;
          case 'GOOGLE_IMAGE_CORRUPTED':
            finalizeSequence(activeSequence, 'warning', corruptedMessage);
            break;
        }
      } catch (e) {
        console.error('[Gemini Voyager] Failed to parse status:', e);
      }
    };

    statusObserver = new MutationObserver(() => {
      const statusData = bridge.dataset.status;
      if (!statusData) return;
      handleStatus(statusData);
    });

    statusObserver.observe(bridge, { attributes: true, attributeFilter: ['data-status'] });
    if (bridge.dataset.status) {
      handleStatus(bridge.dataset.status);
    }
  }

  const start = (): void => {
    setupStatusListener();
    setupDownloadButtonTracking();
  };

  const stop = (): void => {
    statusObserver?.disconnect();
    statusObserver = null;
    clearActiveDownloadSequence();
    toaster.clear();
    if (downloadCaptureHandler) {
      document.removeEventListener('pointerdown', downloadCaptureHandler, true);
      document.removeEventListener('click', downloadCaptureHandler, true);
      downloadCaptureHandler = null;
    }
    downloadTrackingReady = false;
  };

  const takePreview = (token: string) => {
    const fingerprint = previewFingerprintsByIntent.get(token);
    previewFingerprintsByIntent.delete(token);
    return fingerprint;
  };

  return { start, stop, takePreview };
}
