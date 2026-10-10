// Static imports to avoid CSP issues with dynamic imports in content scripts
import { StorageKeys } from '@/core/types/common';
import type { AppLanguage } from '@/utils/language';

import {
  getSavedImageExportWidth,
  saveImageExportWidth,
} from '../../../features/export/services/ImageExportPreferenceService';
import {
  SpeakerLabelPreferenceSaver,
  getSavedSpeakerLabelOverrides,
} from '../../../features/export/services/SpeakerLabelPreferenceService';
import { type ExportSpeakerLabels } from '../../../features/export/types/export';
import { ExportDialog } from '../../../features/export/ui/ExportDialog';
import { watchRouteChanges } from '../utils/routeWatcher';
import { watchConversationMenusForExport } from './conversationMenuExportObserver';
import { waitForElement } from './domWait';
import { startExportEntryGate } from './exportEntryGate';
import {
  type ExportDictionaries,
  createExportTranslator,
  loadExportDictionaries,
  readExportLanguage,
  translateExportOr,
  watchExportLanguage,
} from './exportLocale';
import { resolveExportLogoAnchor } from './exportLogoAnchor';
import { createExportRunner } from './exportRun';
import { ensureGeneratedUiScreenshotPermission } from './generatedUiScreenshots';
import { mountLogoExportButton } from './logoExportButton';
import { mountPersistentExportToolbar } from './persistentExportToolbar';
import { startResponseCopyImageActions } from './responseCopyImageAction';
import { openSidebarConversationForExport } from './sidebarConversationNavigation';
import { resolveExportSite } from './sites/resolveExportSite';

// Resolved once per page load
const exportSite = resolveExportSite();
const exportRunner = createExportRunner({ site: exportSite });

let activeExportDialog: ExportDialog | null = null;

/**
 * Mount the export entry point for the current platform.
 *
 * The returned cleanup is intentionally platform-agnostic. Native plugins own
 * their lifecycle and retain this callback; Gemini's native caller may ignore it
 * because its content script owns the page lifetime.
 */
export async function startExportButton(
  options: { signal?: AbortSignal } = {},
): Promise<() => void> {
  const noCleanup = () => {};
  if (options.signal?.aborted) return noCleanup;
  // Check for pending export immediately
  if (exportSite.history) {
    void exportRunner.resumePending();
  }

  const dict = await loadExportDictionaries();
  if (options.signal?.aborted) return noCleanup;
  let lang = await readExportLanguage();
  if (options.signal?.aborted) return noCleanup;
  const entryPoints = exportSite.entryPoints;

  if (entryPoints.kind === 'toolbar') {
    let toolbarHandle: ReturnType<typeof mountPersistentExportToolbar> | null = null;
    const mountToolbar = () => {
      const [label, tooltip] = entryPointTexts(dict, lang);
      toolbarHandle = mountPersistentExportToolbar({
        label,
        tooltip,
        onClick: () => void showExportDialog(dict, lang, { signal: options.signal }),
      });
      toolbarHandle.root.setAttribute('data-gv-platform', exportSite.id);
    };
    const unmountToolbar = () => {
      exportRunner.cancel();
      toolbarHandle?.remove();
      toolbarHandle = null;
      activeExportDialog?.hide();
      activeExportDialog = null;
    };
    // A host whose chat UI shares the origin with unrelated pages only gets
    // the entry point where a conversation can exist, and loses it again when
    // the SPA navigates away from one.
    const isConversationPage = entryPoints.isConversationPage;
    let stopEntryGate: () => void;
    if (isConversationPage) {
      stopEntryGate = startExportEntryGate({
        isEligible: () => isConversationPage(document, location.href),
        mount: mountToolbar,
        unmount: unmountToolbar,
        watchRoute: watchRouteChanges,
        root: document.body,
      });
    } else {
      mountToolbar();
      stopEntryGate = unmountToolbar;
    }
    const stopLanguage = watchExportLanguage((next) => {
      lang = next;
      toolbarHandle?.setText(...entryPointTexts(dict, next));
    });
    return () => {
      stopEntryGate();
      stopLanguage();
    };
  }

  // --- Gemini path: logo anchor + menu injection ---

  watchConversationMenusForExport({
    label: () => translateExportOr(dict, lang, 'exportChatJson', 'Export conversation history'),
    onExport: (context) => {
      if (context.menuType === 'sidebar' && context.trigger) {
        const trigger = context.trigger;
        void (async () => {
          const opened = await openSidebarConversationForExport(
            trigger,
            entryPoints.userSelectors,
            createExportTranslator(dict, lang),
          );
          if (!opened) {
            return;
          }
          await showExportDialog(dict, lang);
        })();
        return;
      }
      if (context.menuType === 'message') {
        const initialSelectedMessageId = entryPoints.assistantMessageIdFor(context.trigger);
        void showExportDialog(dict, lang, { initialSelectedMessageId });
        return;
      }
      void showExportDialog(dict, lang);
    },
  });
  const copyImageActions = startResponseCopyImageActions({
    dict,
    language: () => lang,
    site: exportSite,
    assistantMessageIdFor: entryPoints.assistantMessageIdFor,
  });

  // The lr26 UI removed the logo entirely; resolveExportLogoAnchor short-circuits
  // there instead of waiting out the full timeout (which delayed this fallback
  // toolbar by several seconds on every conversation load).
  const logo = await resolveExportLogoAnchor(waitForElement);
  if (!logo) {
    // Fallback for lr26+ Gemini UI where the logo has been removed: mount a
    // persistent top-right toolbar so users still have an always-visible
    // export entry point. Menu injection (conversation ⋮ / response ⋮) still
    // runs in parallel via the observers above.
    let toolbarHandle: ReturnType<typeof mountPersistentExportToolbar> | null = null;

    const readToolbarEnabled = async (): Promise<boolean> => {
      try {
        const stored = await new Promise<Record<string, unknown>>((resolve) => {
          try {
            chrome.storage?.sync?.get([StorageKeys.PERSISTENT_EXPORT_TOOLBAR_ENABLED], (items) =>
              resolve(items || {}),
            );
          } catch {
            resolve({});
          }
        });
        const v = stored[StorageKeys.PERSISTENT_EXPORT_TOOLBAR_ENABLED];
        return v !== false;
      } catch {
        return true;
      }
    };

    const ensureToolbarVisibility = (enabled: boolean) => {
      if (enabled && !toolbarHandle) {
        const [label, tooltip] = entryPointTexts(dict, lang);
        toolbarHandle = mountPersistentExportToolbar({
          label,
          tooltip,
          onClick: () => showExportDialog(dict, lang),
        });
      } else if (!enabled && toolbarHandle) {
        toolbarHandle.remove();
        toolbarHandle = null;
      }
    };

    ensureToolbarVisibility(await readToolbarEnabled());

    const stopLanguage = watchExportLanguage((next) => {
      lang = next;
      toolbarHandle?.setText(...entryPointTexts(dict, next));
      copyImageActions.relabel();
    });
    const onToolbarSettingChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'sync') return;
      const toolbarChange = changes[StorageKeys.PERSISTENT_EXPORT_TOOLBAR_ENABLED];
      if (toolbarChange && 'newValue' in toolbarChange) {
        ensureToolbarVisibility(toolbarChange.newValue !== false);
      }
    };
    try {
      chrome.storage?.onChanged?.addListener(onToolbarSettingChange);
    } catch {}
    window.addEventListener(
      'beforeunload',
      () => {
        stopLanguage();
        try {
          chrome.storage?.onChanged?.removeListener(onToolbarSettingChange);
        } catch {}
      },
      { once: true },
    );
    return () => {};
  }
  const logoButton = mountLogoExportButton(logo, {
    texts: () => {
      const [label, title] = entryPointTexts(dict, lang);
      return { title, label };
    },
    onClick: () => void showExportDialog(dict, lang),
  });
  if (!logoButton) return () => {};

  const stopLanguage = watchExportLanguage((next) => {
    lang = next;
    const [label, title] = entryPointTexts(dict, next);
    logoButton.relabel({ title, label });
    copyImageActions.relabel();
  });
  window.addEventListener('beforeunload', stopLanguage, { once: true });

  return () => {
    logoButton.stop();
    stopLanguage();
  };
}

/** The export entry point's label and tooltip. */
function entryPointTexts(dict: ExportDictionaries, lang: AppLanguage): [string, string] {
  return [
    translateExportOr(dict, lang, 'pm_export', 'Export'),
    translateExportOr(dict, lang, 'exportChatJson', 'Export chat history'),
  ];
}

async function showExportDialog(
  dict: ExportDictionaries,
  lang: AppLanguage,
  options?: {
    initialSelectedMessageId?: string | null;
    signal?: AbortSignal;
  },
): Promise<void> {
  if (options?.signal?.aborted) return;
  const t = createExportTranslator(dict, lang);
  const speakerDefaults: ExportSpeakerLabels = {
    user: t('export_speaker_user_default'),
    assistant: t('export_speaker_assistant_default'),
  };
  const [initialImageWidth, savedSpeakerLabelOverrides] = await Promise.all([
    getSavedImageExportWidth(),
    getSavedSpeakerLabelOverrides(),
  ]);
  if (options?.signal?.aborted) return;

  // We defer collection until after the export sequence (scrolling/refresh checks)

  const dialog = new ExportDialog();
  const speakerLabelPreferenceSaver = new SpeakerLabelPreferenceSaver();
  activeExportDialog = dialog;

  dialog.show({
    onExport: (format, fontSize, imageWidth, usePromptAsTurnHeading, speakerLabels) =>
      exportRunner.run(
        {
          format,
          fontSize,
          imageWidth,
          usePromptAsTurnHeading,
          speakerLabels,
          initialSelectedMessageId: options?.initialSelectedMessageId || undefined,
        },
        { dict, lang },
        async (signal) => {
          await speakerLabelPreferenceSaver.flush();
          if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
          await ensureGeneratedUiScreenshotPermission();
          if (format === 'image') {
            await saveImageExportWidth(imageWidth);
          }
        },
      ),

    onCancel: () => {
      void speakerLabelPreferenceSaver.flush();
      if (activeExportDialog === dialog) activeExportDialog = null;
    },
    onSpeakerLabelOverridesChange: (speakerLabelOverrides) => {
      speakerLabelPreferenceSaver.schedule(speakerLabelOverrides);
    },
    initialImageWidth,
    showPromptHeadingOption: true,
    initialSpeakerLabelOverrides: savedSpeakerLabelOverrides,
    speakerNames: {
      title: t('export_speaker_names'),
      userLabel: t('export_speaker_user_label'),
      assistantLabel: t('export_speaker_ai_label'),
      userDefault: speakerDefaults.user,
      assistantDefault: speakerDefaults.assistant,
    },
    translations: {
      title: t('export_dialog_title'),
      selectFormat: t('export_dialog_select'),
      warning: t('export_dialog_warning'),
      safariCmdpHint: t('export_dialog_safari_cmdp_hint'),
      safariMarkdownHint: t('export_dialog_safari_markdown_hint'),
      cancel: t('pm_cancel'),
      export: t('pm_export'),
      fontSizeLabel: t('export_fontsize_label'),
      fontSizePreview: t('export_fontsize_preview'),
      imageWidthLabel: t('export_image_width_label'),
      imageWidthNarrow: t('export_image_width_narrow'),
      imageWidthMedium: t('export_image_width_medium'),
      imageWidthWide: t('export_image_width_wide'),
      promptHeadingLabel: t('export_markdown_prompt_heading'),
      promptHeadingHint: t('export_markdown_prompt_heading_hint'),
      formatDescriptions: {
        json: t('export_format_json_description'),
        markdown: t('export_format_markdown_description'),
        pdf: t('export_format_pdf_description'),
        image: t('export_format_image_description'),
      },
    },
  });
}

export default { startExportButton };
