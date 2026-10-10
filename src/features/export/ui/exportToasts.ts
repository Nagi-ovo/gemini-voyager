/**
 * Export's toasts. One page-lifetime toaster serves every export surface (export
 * runs, Deep Research reports, copy as image, Canvas copy) on every site, so
 * they share the bottom-end stack with the rest of Voyager. A run shows one
 * pending progress toast that each step replaces in place.
 */
import { createToaster } from '@/core/ui/toast/toaster';
import type { ToastAction, ToastTone } from '@/core/ui/toast/types';
import { isSafari } from '@/core/utils/browser';
import type { TranslationKey } from '@/utils/translations';

import type { ExportFormat, ExportResult } from '../types/export';

const exportToaster = createToaster();

/** Outcomes replace one another in place: a newer one makes the older moot. */
const OUTCOME_CHANNEL = 'export';
const PROGRESS_CHANNEL = 'export-progress';
// Their own channels, so the Safari PDF guidance and the omitted-images notice both stay up.
const SAFARI_PDF_CHANNEL = 'export-safari-pdf';
const OMITTED_IMAGES_CHANNEL = 'export-images-omitted';

const NOTICE_MS = 2200;
const SAFARI_PDF_MS = 5000;
const OMITTED_IMAGES_MS = 8000;
const ALERT_MS = 10_000;

export function showExportNotice(
  message: string,
  options: { tone?: ToastTone; durationMs?: number } = {},
): void {
  exportToaster.show({
    channel: OUTCOME_CHANNEL,
    message,
    tone: options.tone,
    durationMs: options.durationMs ?? NOTICE_MS,
  });
}

/**
 * A problem the user has to read, so it stays up well beyond an outcome and
 * offers a close button, as the native alert it replaced did.
 */
export function showExportAlert(
  message: string,
  t: (key: TranslationKey) => string,
  tone: 'warning' | 'error' = 'error',
): void {
  exportToaster.show({
    channel: OUTCOME_CHANNEL,
    message,
    tone,
    durationMs: ALERT_MS,
    dismissLabel: t('floatingPanelClose'),
  });
}

export type ExportProgressText = {
  readonly title?: string;
  readonly message: string;
  /** A count that changes while the step runs; it is announced on its own. */
  readonly detail?: string;
  readonly action?: ToastAction;
};

export type ExportProgress = {
  update(patch: { readonly detail: string }): void;
  /** Close this step's progress; the step it covered, if still running, shows again. */
  hide(): void;
};

/**
 * Running steps, innermost last. A nested step (ChatGPT's crawl inside an
 * export) takes over the one toast and gives it back when it ends.
 */
const progressSteps: { text: ExportProgressText }[] = [];

function showTopProgress(): void {
  const top = progressSteps[progressSteps.length - 1];
  if (!top) {
    exportToaster.dismiss(PROGRESS_CHANNEL);
    return;
  }
  exportToaster.show({ ...top.text, channel: PROGRESS_CHANNEL, pending: true, durationMs: null });
}

export function showExportProgress(text: ExportProgressText): ExportProgress {
  const step = { text };
  progressSteps.push(step);
  showTopProgress();
  return {
    update: (patch) => {
      step.text = { ...step.text, ...patch };
      if (progressSteps[progressSteps.length - 1] === step) {
        exportToaster.show({
          ...step.text,
          channel: PROGRESS_CHANNEL,
          pending: true,
          durationMs: null,
        });
      }
    },
    hide: () => {
      const index = progressSteps.indexOf(step);
      if (index < 0) return;
      const wasTop = index === progressSteps.length - 1;
      progressSteps.splice(index, 1);
      if (wasTop) showTopProgress();
    },
  };
}

/** Close the progress whichever steps show it, before the selection mode takes over. */
export function hideExportProgress(): void {
  progressSteps.length = 0;
  exportToaster.dismiss(PROGRESS_CHANNEL);
}

export function exportingProgressText(t: (key: TranslationKey) => string): ExportProgressText {
  return { title: `${t('pm_export')}...`, message: t('loading') };
}

/** What a finished export still needs to tell the user, if anything. */
export function reportFinishedExport(
  result: Pick<ExportResult, 'omittedImageCount'>,
  format: ExportFormat,
  t: (key: TranslationKey) => string,
): void {
  if (format === 'pdf' && isSafari()) {
    exportToaster.show({
      channel: SAFARI_PDF_CHANNEL,
      message: t('export_toast_safari_pdf_ready'),
      durationMs: SAFARI_PDF_MS,
    });
  }
  const omitted = result.omittedImageCount ?? 0;
  if (omitted <= 0) return;
  exportToaster.show({
    channel: OMITTED_IMAGES_CHANNEL,
    message: t('export_toast_images_omitted').replace('{count}', String(omitted)),
    tone: 'warning',
    durationMs: OMITTED_IMAGES_MS,
  });
}
