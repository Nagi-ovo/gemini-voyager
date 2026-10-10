/**
 * One export run, from the dialog's Export button to the written file.
 *
 * Gemini lazy-loads history, so a run first clicks the topmost message until
 * the conversation stops growing. That click can reload the page: the run is
 * kept in sessionStorage and `resumePending` continues it on the next load.
 * Other hosts let their turn source read the conversation, or scroll to the
 * top when it does not. The run then shows
 * the selection session and exports the chosen messages.
 *
 * The runner owns the active operation: starting a run aborts the previous one
 * and dismisses its selection UI, and `cancel` does the same without starting.
 */
import { logger } from '@/core/services/LoggerService';
import { askConfirm } from '@/core/ui/confirm';
import type { AppLanguage } from '@/utils/language';

import type {
  ConversationMetadata,
  ExportFormat,
  ExportSpeakerLabels,
} from '../../../features/export/types/export';
import { resolveExportErrorMessage } from '../../../features/export/ui/ExportErrorMessage';
import {
  exportingProgressText,
  hideExportProgress,
  reportFinishedExport,
  showExportAlert,
  showExportProgress,
} from '../../../features/export/ui/exportToasts';
import { removeCanvasExportSections } from './conversationCollector';
import { waitForAnyElement, waitForElement } from './domWait';
import { isAbortError, throwIfExportCancelled } from './exportCancellation';
import { withExportCollectingBanner } from './exportCollectingBanner';
import { noteExportTurns } from './exportHealth';
import {
  type ExportDictionaries,
  createExportTranslator,
  loadExportDictionaries,
  readExportLanguage,
} from './exportLocale';
import {
  type ExportSelectionConfirmation,
  startExportSelectionSession,
} from './exportSelectionSession';
import type { ExportSite, ExportTurnReader } from './exportSite';
import {
  captureGeneratedUiScreenshots,
  ensureGeneratedUiScreenshotPermission,
  removeGeneratedUiScreenshotSections,
} from './generatedUiScreenshots';
import {
  type PendingExportState,
  advancePendingExportState,
  clearPendingExportState,
  createPendingExportState,
  exportPendingConversation,
  persistPendingExportState,
  restorePendingExportState,
} from './pendingExportState';
import { runPreparedExport } from './preparedExport';
import {
  computeConversationFingerprint,
  waitForConversationFingerprintChangeOrTimeout,
} from './topNodePreload';

const EXPORT_PRELOAD_WAIT_OPTIONS = {
  timeoutMs: 12000,
  minWaitMs: 700,
  idleMs: 320,
  pollIntervalMs: 90,
  maxSamples: 10,
} as const;
const FINAL_EXPORT_PREPARE_DELAY_MS = 120;

export interface ExportRunRequest {
  format: ExportFormat;
  fontSize?: number;
  imageWidth?: number;
  usePromptAsTurnHeading?: boolean;
  speakerLabels?: ExportSpeakerLabels;
  /** Message to preselect in the selection session. */
  initialSelectedMessageId?: string;
}

export interface ExportRunLocale {
  dict: ExportDictionaries;
  lang: AppLanguage;
}

export interface ExportRunnerDeps {
  site: ExportSite;
}

export interface ExportRunner {
  /**
   * Abort any active run, then start this one. `prepare` runs first under the
   * new operation's signal (for work that must happen before the page changes).
   * Never rejects: cancellations are silent, other errors are logged or shown in a toast.
   */
  run(
    request: ExportRunRequest,
    locale: ExportRunLocale,
    prepare?: (signal: AbortSignal) => Promise<void>,
  ): Promise<void>;
  /** Continue a run interrupted by a page reload, if this page has one pending. */
  resumePending(): Promise<void>;
  /** Abort the active run and dismiss its selection UI. */
  cancel(): void;
}

function exportRouteKey(url: string): string {
  const parsed = new URL(url, location.href);
  return `${parsed.origin}${parsed.pathname}${parsed.search}`;
}

export function createExportRunner(deps: ExportRunnerDeps): ExportRunner {
  const { site } = deps;
  const collector = site.page;
  let activeExportController: AbortController | null = null;
  let activeExportSelectionCleanup: (() => void) | null = null;

  function beginExportOperation(): AbortController {
    activeExportController?.abort();
    activeExportSelectionCleanup?.();
    activeExportSelectionCleanup = null;
    const controller = new AbortController();
    activeExportController = controller;
    return controller;
  }

  function cancelActiveExportOperation(): void {
    activeExportController?.abort();
    activeExportController = null;
    activeExportSelectionCleanup?.();
    activeExportSelectionCleanup = null;
  }

  /**
   * Scroll the conversation to the very top so virtual-scroll containers
   * render their topmost nodes, then wait for the DOM to settle.
   */
  async function scrollToTopAndRender(): Promise<void> {
    const topEl = collector.topUserElement();
    if (topEl) {
      topEl.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
    // Give virtual scroll frameworks time to render the newly-visible nodes.
    await new Promise<void>((resolve) => {
      let settled = false;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const done = () => {
        if (settled) return;
        settled = true;
        obs.disconnect();
        if (idleTimer != null) clearTimeout(idleTimer);
        resolve();
      };
      const obs = new MutationObserver(() => {
        if (idleTimer != null) clearTimeout(idleTimer);
        idleTimer = setTimeout(done, 400);
      });
      obs.observe(document.body, { childList: true, subtree: true });
      // Also set a hard cap so we don't hang forever.
      setTimeout(done, 3000);
      // Kick the idle timer in case no mutations fire at all.
      idleTimer = setTimeout(done, 400);
    });
  }

  /**
   * Executes the export sequence:
   * 1. Find top node and click it.
   * 2. Wait to see if refresh happens.
   * 3. If refresh -> script dies, on load we resume.
   * 4. If no refresh -> we are stable, proceed to export.
   */
  async function executeExportSequence(
    state: PendingExportState,
    { dict, lang }: ExportRunLocale,
  ): Promise<void> {
    const signal = activeExportController?.signal;
    throwIfExportCancelled(signal);

    // No preload loop: the source reads the thread itself, or we scroll to the top.
    const history = site.history;
    if (!history) {
      return runPreparedExport(
        site.turns,
        { signal, expectedUrl: state.url },
        {
          scrollToTop: scrollToTopAndRender,
          exportSelection: (session) =>
            performFinalExport(state, dict, lang, session ?? site.turns),
        },
      );
    }

    if (state.attempt > 25) {
      console.warn('[Gemini Voyager] Export aborted: too many attempts.');
      clearPendingExportState(sessionStorage);
      const t = createExportTranslator(dict, lang);
      showExportAlert(t('export_error_too_many_attempts'), t);
      return;
    }

    // 1. Find Top Node
    if (state.attempt > 0) {
      logger.debug('[Gemini Voyager] Resuming export... waiting for content load.');
      await waitForAnyElement(history.userSelectors(), 15000);
    }

    // Wait a bit if we just reloaded
    let topNode = collector.topUserElement();
    if (!topNode) {
      await waitForElement('body', 2000);
      const pairs = collector.collectChatPairs();
      if (pairs.length > 0 && pairs[0].userElement) {
        topNode = pairs[0].userElement;
      }
    }

    if (!topNode) {
      logger.debug('[Gemini Voyager] No top node found, proceeding to export directly.');
      clearPendingExportState(sessionStorage);
      await performFinalExport(state, dict, lang, site.turns);
      return;
    }

    const fingerprintSelectors = [...history.userSelectors(), ...history.assistantSelectors()];
    const beforeFingerprint = computeConversationFingerprint(
      document.body,
      fingerprintSelectors,
      10,
    );

    logger.debug(`[Gemini Voyager] Simulating click on top node (Attempt ${state.attempt + 1})...`);

    // Update state before action to persist across potential reload
    persistPendingExportState(sessionStorage, state, Date.now());

    // Dispatch click logic
    try {
      topNode.scrollIntoView({ behavior: 'auto', block: 'center' });
      const opts = { bubbles: true, cancelable: true, view: window };
      topNode.dispatchEvent(new MouseEvent('mousedown', opts));
      topNode.dispatchEvent(new MouseEvent('mouseup', opts));
      topNode.click();
    } catch (e) {
      console.error('[Gemini Voyager] Failed to click top node:', e);
    }

    // 2. Wait for either hard refresh (page unload) OR a "soft refresh" that loads more history.
    // If the page unloads, the script stops and `checkPendingExport()` resumes on next load via sessionStorage.
    const { changed } = await waitForConversationFingerprintChangeOrTimeout(
      document.body,
      fingerprintSelectors,
      beforeFingerprint,
      EXPORT_PRELOAD_WAIT_OPTIONS,
    );
    throwIfExportCancelled(signal);

    if (changed) {
      logger.debug('[Gemini Voyager] History expanded (soft refresh). Clicking top node again...');
      await executeExportSequence(advancePendingExportState(state, Date.now()), { dict, lang });
      return;
    }

    logger.debug('[Gemini Voyager] No refresh or update detected. Exporting...');
    clearPendingExportState(sessionStorage);
    await performFinalExport(state, dict, lang, site.turns);
  }

  async function executeExportSequenceWithProgress(
    request: ExportRunRequest | PendingExportState,
    locale: ExportRunLocale,
  ): Promise<void> {
    const progress = showExportProgress(
      exportingProgressText(createExportTranslator(locale.dict, locale.lang)),
    );
    try {
      throwIfExportCancelled(activeExportController?.signal);
      const resumed = 'attempt' in request;
      // Snapshot before history clicks can replace the open Canvas documents.
      if (!resumed) collector.snapshotOpenCanvasDocs();
      const state = resumed
        ? request
        : createPendingExportState(request.format, location.href, Date.now(), request);
      await executeExportSequence(state, locale);
    } finally {
      progress.hide();
      collector.releaseCanvasDocs();
      removeGeneratedUiScreenshotSections();
    }
  }

  /**
   * Performs the actual file generation and download.
   */
  async function performFinalExport(
    state: PendingExportState,
    dict: ExportDictionaries,
    lang: AppLanguage,
    reader: ExportTurnReader,
  ) {
    const t = createExportTranslator(dict, lang);
    const signal = activeExportController?.signal;
    throwIfExportCancelled(signal);

    await new Promise((r) => setTimeout(r, FINAL_EXPORT_PREPARE_DELAY_MS));
    throwIfExportCancelled(signal);
    await captureGeneratedUiScreenshots();
    throwIfExportCancelled(signal);

    const messages = reader.messages();
    if (!noteExportTurns(messages.length > 0, () => collector.collectChatPairs().length > 0)) {
      showExportAlert(t('export_dialog_warning'), t, 'warning');
      return;
    }
    hideExportProgress();

    const selectionUrl = location.href;
    const selectionTitle = site.title();
    const showCollectingBanner = () =>
      showExportProgress({
        title: t('export_collecting_title'),
        message: t('export_collecting_desc'),
      }).hide;

    const exportSelection = async ({ takeSelection }: ExportSelectionConfirmation) => {
      let hideProgress: (() => void) | null = null;
      try {
        throwIfExportCancelled(signal);
        await ensureGeneratedUiScreenshotPermission();
        const selectedIdsForExport = takeSelection();
        await captureGeneratedUiScreenshots();
        throwIfExportCancelled(signal);

        const buildTurns = () =>
          reader.build(selectedIdsForExport, { signal, expectedUrl: selectionUrl });
        const turnsForExport = site.turns.scrollsWhileBuilding
          ? await withExportCollectingBanner(showCollectingBanner, buildTurns)
          : await buildTurns();
        throwIfExportCancelled(signal);
        if (exportRouteKey(location.href) !== exportRouteKey(selectionUrl)) {
          throw new Error('export_conversation_changed');
        }
        if (turnsForExport.length === 0) throw new Error('export_empty_selection');

        const metadata: ConversationMetadata = {
          url: selectionUrl,
          exportedAt: new Date().toISOString(),
          count: turnsForExport.length,
          title: selectionTitle,
          platform: site.label,
        };

        let includeImageSource = true;
        if (state.format === 'markdown') {
          const hasSearchImages = turnsForExport.some(
            (turn) =>
              turn.assistantContent?.html.includes('attachment-container.search-images') ||
              turn.assistantElement?.querySelector('.attachment-container.search-images') != null,
          );
          if (hasSearchImages) {
            const sources = await askConfirm<'include' | 'exclude'>({
              message: t('export_md_include_source_confirm'),
              tone: 'neutral',
              choices: [
                {
                  id: 'exclude',
                  label: t('export_md_include_source_exclude'),
                  emphasis: 'secondary',
                },
                { id: 'include', label: t('export_md_include_source_include') },
              ],
              cancelLabel: t('pm_cancel'),
              signal,
            });
            // Cancel, Escape or an outside press drops the export rather than guess its links.
            if (sources === null) return;
            throwIfExportCancelled(signal);
            if (exportRouteKey(location.href) !== exportRouteKey(selectionUrl)) {
              throw new Error('export_conversation_changed');
            }
            includeImageSource = sources === 'include';
          }
        }

        hideProgress = showExportProgress(exportingProgressText(t)).hide;
        const resultPromise = exportPendingConversation(
          state,
          turnsForExport,
          metadata,
          includeImageSource,
          signal,
        );
        const minVisiblePromise = new Promise((resolve) => setTimeout(resolve, 420));
        const [result] = await Promise.all([resultPromise, minVisiblePromise]);
        throwIfExportCancelled(signal);

        if (!result.success) {
          showExportAlert(resolveExportErrorMessage(result.error, t), t);
        } else {
          reportFinishedExport(result, state.format, t);
        }
      } catch (error) {
        if (!isAbortError(error)) {
          console.error('[Gemini Voyager] Export error:', error);
          showExportAlert(resolveExportErrorMessage(error, t), t);
        }
      } finally {
        hideProgress?.();
        removeCanvasExportSections();
        removeGeneratedUiScreenshotSections();
      }
    };

    const resolveRoles = reader.roles;
    const session = startExportSelectionSession({
      t,
      signal,
      abortExport: () => activeExportController?.abort(),
      readMessages: () => reader.messages(),
      initialSelectedMessageId: state.initialSelectedMessageId || null,
      anchors: collector,
      isSameConversation: () => exportRouteKey(location.href) === exportRouteKey(selectionUrl),
      resolveRoles: resolveRoles
        ? (messageIds) =>
            withExportCollectingBanner(showCollectingBanner, () =>
              resolveRoles(messageIds, { signal, expectedUrl: selectionUrl }),
            )
        : undefined,
      onConfirm: exportSelection,
    });
    activeExportSelectionCleanup = session.cancel;
    await session.done;
    if (activeExportSelectionCleanup === session.cancel) activeExportSelectionCleanup = null;
  }

  /**
   * Check if there is a pending export operation from a previous page load.
   */
  async function resumePending(): Promise<void> {
    try {
      const state = restorePendingExportState(sessionStorage, location.href);
      if (!state) return;

      // If state exists, it means we clicked and page refreshed.
      // So we resume the sequence.
      logger.debug('[Gemini Voyager] Resuming pending export sequence...');

      // We need i18n for final export/alert
      const dict = await loadExportDictionaries();
      const lang = await readExportLanguage();

      await executeExportSequenceWithProgress(state, { dict, lang });
    } catch (e) {
      console.error('[Gemini Voyager] Failed to resume pending export:', e);
      clearPendingExportState(sessionStorage);
    }
  }

  async function run(
    request: ExportRunRequest,
    locale: ExportRunLocale,
    prepare?: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    const controller = beginExportOperation();
    try {
      await prepare?.(controller.signal);
      await executeExportSequenceWithProgress(request, locale);
    } catch (err) {
      if (!isAbortError(err)) console.error('[Gemini Voyager] Export error:', err);
    } finally {
      if (activeExportController === controller) {
        activeExportController = null;
        activeExportSelectionCleanup = null;
      }
    }
  }

  return { run, resumePending, cancel: cancelActiveExportOperation };
}
