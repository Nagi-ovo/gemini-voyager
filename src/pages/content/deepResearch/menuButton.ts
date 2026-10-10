/**
 * Menu button injection module for Deep Research export
 */
import { ConversationExportService } from '@/features/export/services/ConversationExportService';
import {
  createContentExtractor,
  extractTurnContent,
} from '@/features/export/services/DOMContentExtractor';
import {
  getSavedImageExportWidth,
  saveImageExportWidth,
} from '@/features/export/services/ImageExportPreferenceService';
import type {
  ConversationMetadata,
  ChatTurn as ExportChatTurn,
  ExportFormat,
} from '@/features/export/types/export';
import { ExportDialog } from '@/features/export/ui/ExportDialog';
import { resolveExportErrorMessage } from '@/features/export/ui/ExportErrorMessage';
import {
  exportingProgressText,
  reportFinishedExport,
  showExportAlert,
  showExportProgress,
} from '@/features/export/ui/exportToasts';
import type { AppLanguage } from '@/utils/language';

import { resolveExportAdapter } from '../export/adapter/platformAdapters';
import { waitForElement } from '../export/domWait';
import {
  type ExportDictionaries,
  createExportTranslator,
  loadExportDictionaries,
  readExportLanguage,
  watchExportLanguage,
} from '../export/exportLocale';
import {
  createMenuItemFromNativeTemplate,
  updateMenuItemTemplateLabel,
} from '../shared/nativeMenuItemTemplate';
import { downloadMarkdown } from './download';
import { extractThinkingPanels } from './extractor';
import { formatToMarkdown } from './formatter';
import { extractDeepResearchReportTitle, findDeepResearchReportRoot } from './reportExtractor';

const DOWNLOAD_BUTTON_CLASS = 'gv-deep-research-download';
const SAVE_REPORT_BUTTON_CLASS = 'gv-deep-research-save-report';
const INJECTED_BUTTON_CLASSES = [DOWNLOAD_BUTTON_CLASS, SAVE_REPORT_BUTTON_CLASS];
const TEMPLATE_EXCLUDED_CLASS_NAMES = [...INJECTED_BUTTON_CLASSES, 'share-button'];

export function applyDeepResearchDownloadButtonI18n(
  button: HTMLElement,
  dict: ExportDictionaries,
  lang: AppLanguage,
): void {
  const t = createExportTranslator(dict, lang);
  const text = t('deepResearchDownload');
  const tooltip = t('deepResearchDownloadTooltip');

  updateMenuItemTemplateLabel(button, text, tooltip);
}

export function applyDeepResearchSaveReportButtonI18n(
  button: HTMLElement,
  dict: ExportDictionaries,
  lang: AppLanguage,
): void {
  const t = createExportTranslator(dict, lang);
  const text = t('deepResearchSaveReport');
  const tooltip = t('deepResearchSaveReportTooltip');

  updateMenuItemTemplateLabel(button, text, tooltip);
}

/**
 * Handle download button click
 */
async function handleDownload(dict: ExportDictionaries): Promise<void> {
  try {
    console.log('[Gemini Voyager] Extracting Deep Research thinking content...');

    const content = extractThinkingPanels();
    if (!content) {
      console.warn('[Gemini Voyager] No thinking content found');
      // An empty download still needs a visible outcome, in the language selected at click time.
      const t = createExportTranslator(dict, await readExportLanguage());
      showExportAlert(t('deepResearchNoThinkingContent'), t, 'warning');
      return;
    }

    const markdown = await formatToMarkdown(content);
    downloadMarkdown(markdown);
  } catch (error) {
    console.error('[Gemini Voyager] Error handling download:', error);
  }
}

/**
 * Create menu button matching Material Design style
 */
function createMenuButtonFallback({
  text,
  tooltip,
  className,
  iconName,
  onClick,
}: {
  text: string;
  tooltip: string;
  className: string;
  iconName: string;
  onClick: () => void;
}): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = `mat-mdc-menu-item mat-focus-indicator menu-item-button ${className}`;
  button.setAttribute('mat-menu-item', '');
  button.setAttribute('role', 'menuitem');
  button.setAttribute('tabindex', '0');
  button.setAttribute('aria-disabled', 'false');
  button.setAttribute('aria-label', tooltip);
  button.title = tooltip;

  // Create icon
  const icon = document.createElement('mat-icon');
  icon.className =
    'mat-icon notranslate menu-icon google-symbols mat-ligature-font mat-icon-no-color';
  icon.setAttribute('role', 'img');
  icon.setAttribute('fonticon', iconName);
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '';

  // Create text span
  const span = document.createElement('span');
  span.className = 'mat-mdc-menu-item-text';
  span.textContent = text;

  // Create ripple effect
  const ripple = document.createElement('div');
  ripple.className = 'mat-ripple mat-mdc-menu-ripple';
  ripple.setAttribute('matripple', '');

  button.appendChild(icon);
  button.appendChild(span);
  button.appendChild(ripple);

  // Add click handler
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });

  return button;
}

function createMenuButton({
  text,
  tooltip,
  className,
  iconName,
  onClick,
  menuContent,
}: {
  text: string;
  tooltip: string;
  className: string;
  iconName: string;
  onClick: () => void;
  menuContent: HTMLElement;
}): HTMLElement {
  const button =
    createMenuItemFromNativeTemplate({
      menuContent,
      injectedClassName: className,
      iconName,
      label: text,
      tooltip,
      excludedClassNames: TEMPLATE_EXCLUDED_CLASS_NAMES,
    }) ??
    createMenuButtonFallback({
      text,
      tooltip,
      className,
      iconName,
      onClick: () => {},
    });

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });

  return button;
}

function createDownloadButton(
  text: string,
  tooltip: string,
  dict: ExportDictionaries,
  menuContent: HTMLElement,
): HTMLElement {
  return createMenuButton({
    text,
    tooltip,
    className: DOWNLOAD_BUTTON_CLASS,
    iconName: 'download',
    onClick: () => void handleDownload(dict),
    menuContent,
  });
}

function sanitizeFilenamePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/\.+$/g, '')
    .slice(0, 80);
  return cleaned || 'deep-research-report';
}

function buildReportFilename(format: ExportFormat, title: string): string {
  const base = sanitizeFilenamePart(title || 'deep-research-report');
  if (format === 'json') return `${base}.json`;
  if (format === 'markdown') return `${base}.md`;
  if (format === 'pdf') return `${base}.pdf`;
  return `${base}.png`;
}

function handleSaveReport(dict: ExportDictionaries, lang: AppLanguage): void {
  void (async () => {
    const reportRoot = findDeepResearchReportRoot();
    if (!reportRoot) {
      console.warn('[Gemini Voyager] Report content root not found');
      return;
    }

    const reportTitle = extractDeepResearchReportTitle(reportRoot);
    const metadata: ConversationMetadata = {
      url: location.href,
      exportedAt: new Date().toISOString(),
      count: 1,
      title: reportTitle,
    };

    const reportTurn: ExportChatTurn = {
      user: '',
      assistant: '',
      starred: false,
      omitEmptySections: true,
      assistantElement: reportRoot,
    };

    const initialImageWidth = await getSavedImageExportWidth();
    const t = createExportTranslator(dict, lang);
    const dialog = new ExportDialog();
    dialog.show({
      onExport: async (format, fontSize, imageWidth) => {
        const progress = showExportProgress(exportingProgressText(t));
        try {
          if (format === 'image') {
            await saveImageExportWidth(imageWidth);
          }
          const filename = buildReportFilename(format, reportTitle);
          // Deep Research is a Gemini-only surface; the Gemini dialect renders its $$ formulas.
          const turns = [
            extractTurnContent(reportTurn, createContentExtractor(resolveExportAdapter())),
          ];
          const resultPromise = ConversationExportService.export(turns, metadata, {
            format,
            filename,
            layout: 'document',
            fontSize,
            imageWidth,
          });
          const minVisiblePromise = new Promise((resolve) => setTimeout(resolve, 420));
          const [result] = await Promise.all([resultPromise, minVisiblePromise]);
          if (!result.success) {
            showExportAlert(resolveExportErrorMessage(result.error, t), t);
          } else {
            reportFinishedExport(result, format, t);
          }
        } catch (error) {
          console.error('[Gemini Voyager] Report export error:', error);
          showExportAlert(resolveExportErrorMessage(error, t), t);
        } finally {
          progress.hide();
        }
      },
      onCancel: () => {},
      initialImageWidth,
      speakerLabelsEnabled: false,
      translations: {
        title: t('deepResearchSaveReport'),
        selectFormat: t('export_dialog_select'),
        warning: '',
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
  })().catch((error: unknown) => {
    console.error('[Gemini Voyager] Failed to open report export dialog:', error);
  });
}

function createSaveReportButton(
  text: string,
  tooltip: string,
  dict: ExportDictionaries,
  menuContent: HTMLElement,
): HTMLElement {
  return createMenuButton({
    text,
    tooltip,
    className: SAVE_REPORT_BUTTON_CLASS,
    iconName: 'description',
    onClick: () => {
      void readExportLanguage().then((currentLanguage) => {
        handleSaveReport(dict, currentLanguage);
      });
    },
    menuContent,
  });
}

export function isDeepResearchReportMenuPanel(menuPanel: HTMLElement): boolean {
  if (!menuPanel.matches('.mat-mdc-menu-panel[role="menu"]')) return false;
  const menuContent = menuPanel.querySelector('.mat-mdc-menu-content');
  if (!(menuContent instanceof HTMLElement)) return false;

  const hasReportShareActions = Boolean(
    menuContent.querySelector('[data-test-id="share-button-tooltip-container"]') ||
    menuContent.querySelector('[data-test-id="share-drive-button"]') ||
    menuContent.querySelector('[data-test-id="share-classroom-button"]'),
  );
  const hasReportExportActions = Boolean(
    menuContent.querySelector('[data-test-id="export-to-docs-button"]') ||
    menuContent.querySelector('[data-test-id="copy-button"]'),
  );

  return hasReportShareActions && hasReportExportActions;
}

/**
 * Inject download button into menu
 */
export async function injectDownloadButton(targetMenuPanel?: HTMLElement): Promise<void> {
  try {
    // Load i18n
    const dict = await loadExportDictionaries();
    const lang = await readExportLanguage();
    const t = createExportTranslator(dict, lang);

    const menuPanel =
      targetMenuPanel ?? (await waitForElement('.mat-mdc-menu-panel[role="menu"]', 5000));
    if (!menuPanel) {
      console.log('[Gemini Voyager] Menu panel not found');
      return;
    }
    if (!(menuPanel instanceof HTMLElement)) return;
    if (!menuPanel.isConnected) return;
    if (!isDeepResearchReportMenuPanel(menuPanel)) return;

    // Find the menu content container
    const menuContent = menuPanel.querySelector('.mat-mdc-menu-content');
    if (!menuContent) {
      console.log('[Gemini Voyager] Menu content not found');
      return;
    }

    let downloadButton = menuPanel.querySelector(`.${DOWNLOAD_BUTTON_CLASS}`) as HTMLElement | null;
    if (!downloadButton) {
      downloadButton = createDownloadButton(
        t('deepResearchDownload'),
        t('deepResearchDownloadTooltip'),
        dict,
        menuContent as HTMLElement,
      );
      menuContent.appendChild(downloadButton);
    }

    let saveReportButton = menuPanel.querySelector(
      `.${SAVE_REPORT_BUTTON_CLASS}`,
    ) as HTMLElement | null;
    if (!saveReportButton) {
      saveReportButton = createSaveReportButton(
        t('deepResearchSaveReport'),
        t('deepResearchSaveReportTooltip'),
        dict,
        menuContent as HTMLElement,
      );
      menuContent.appendChild(saveReportButton);
    }

    applyDeepResearchDownloadButtonI18n(downloadButton, dict, lang);
    applyDeepResearchSaveReportButtonI18n(saveReportButton, dict, lang);

    // Keep button text/tooltip in sync with runtime language changes
    const stopLanguage = watchExportLanguage((next) => {
      applyDeepResearchDownloadButtonI18n(downloadButton, dict, next);
      applyDeepResearchSaveReportButtonI18n(saveReportButton, dict, next);
    });
    const observer = new MutationObserver(() => {
      if (!document.contains(downloadButton) && !document.contains(saveReportButton)) {
        stopLanguage();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener(
      'beforeunload',
      () => {
        stopLanguage();
        observer.disconnect();
      },
      { once: true },
    );

    console.log('[Gemini Voyager] Deep Research menu buttons injected successfully');
  } catch (error) {
    console.error('[Gemini Voyager] Error injecting Deep Research menu buttons:', error);
  }
}
