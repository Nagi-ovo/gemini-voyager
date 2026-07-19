import { hashString } from '@/core/utils/hash';
import { ConversationExportService } from '@/features/export/services/ConversationExportService';
import {
  getSavedImageExportWidth,
  saveImageExportWidth,
} from '@/features/export/services/ImageExportPreferenceService';
import type { ChatTurn, ExportFormat } from '@/features/export/types/export';
import { ExportDialog } from '@/features/export/ui/ExportDialog';
import { showExportToast } from '@/features/export/ui/ExportToast';
import { claudeAdapter } from '@/features/plugins/sites/adapters/claude';
import { getCurrentLanguage } from '@/utils/i18n';
import type { AppLanguage } from '@/utils/language';
import { TRANSLATIONS, type TranslationKey } from '@/utils/translations';

const BUTTON_ID = 'gv-claude-export-button';
const STYLE_ID = 'gv-claude-export-style';
const CHAT_PATH_PATTERN = /^\/chat\/[^/?#]+/;
const SCROLL_SETTLE_MS = 140;
const SCROLL_STEP_RATIO = 0.75;
const MIN_SCROLL_STEP_PX = 320;
const MAX_SCAN_STEPS = 240;

interface ClaudeExportCopy {
  button: string;
  busy: string;
  empty: string;
  failed: string;
}

const CLAUDE_EXPORT_COPY: Record<AppLanguage, ClaudeExportCopy> = {
  en: {
    button: 'Export chat',
    busy: 'Collecting chat...',
    empty: 'No Claude conversation was found to export.',
    failed: 'Claude export failed',
  },
  zh: {
    button: '导出对话',
    busy: '正在收集对话...',
    empty: '未找到可导出的 Claude 对话。',
    failed: 'Claude 导出失败',
  },
  zh_TW: {
    button: '匯出對話',
    busy: '正在收集對話...',
    empty: '找不到可匯出的 Claude 對話。',
    failed: 'Claude 匯出失敗',
  },
  ja: {
    button: 'チャットを書き出す',
    busy: 'チャットを収集中...',
    empty: '書き出せる Claude の会話が見つかりません。',
    failed: 'Claude の書き出しに失敗しました',
  },
  ko: {
    button: '채팅 내보내기',
    busy: '채팅 수집 중...',
    empty: '내보낼 Claude 대화를 찾을 수 없습니다.',
    failed: 'Claude 내보내기 실패',
  },
  fr: {
    button: 'Exporter le chat',
    busy: 'Collecte du chat...',
    empty: 'Aucune conversation Claude à exporter.',
    failed: "Échec de l'export Claude",
  },
  es: {
    button: 'Exportar chat',
    busy: 'Recopilando chat...',
    empty: 'No se encontró ninguna conversación de Claude para exportar.',
    failed: 'Error al exportar desde Claude',
  },
  pt: {
    button: 'Exportar conversa',
    busy: 'Coletando conversa...',
    empty: 'Nenhuma conversa do Claude foi encontrada para exportar.',
    failed: 'Falha ao exportar do Claude',
  },
  ru: {
    button: 'Экспорт чата',
    busy: 'Сбор сообщений...',
    empty: 'Не найден диалог Claude для экспорта.',
    failed: 'Не удалось экспортировать диалог Claude',
  },
  ar: {
    button: 'تصدير المحادثة',
    busy: 'جارٍ جمع المحادثة...',
    empty: 'لم يتم العثور على محادثة Claude لتصديرها.',
    failed: 'فشل تصدير Claude',
  },
};

export interface ClaudeTurnSnapshot extends ChatTurn {
  readonly hash: string;
}

interface ScanOptions {
  readonly settle?: () => Promise<void>;
  readonly maxSteps?: number;
}

function normalizeText(element: HTMLElement | undefined): string {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim();
}

function deepestMatches(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter(
    (candidate) => !elements.some((other) => other !== candidate && candidate.contains(other)),
  );
}

function compareDocumentOrder(left: HTMLElement, right: HTMLElement): number {
  if (left === right) return 0;
  return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function createSnapshot(
  userElement: HTMLElement,
  assistantElement?: HTMLElement,
): ClaudeTurnSnapshot {
  const user = normalizeText(userElement);
  const assistant = normalizeText(assistantElement);
  const userClone = userElement.cloneNode(true) as HTMLElement;
  const assistantClone = assistantElement?.cloneNode(true) as HTMLElement | undefined;

  userClone.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    image.classList.add('preview-image');
  });
  if (user && !userClone.querySelector('.query-text-line')) {
    const textLine = document.createElement('div');
    textLine.className = 'query-text-line';
    textLine.textContent = user;
    userClone.appendChild(textLine);
  }

  assistantClone?.querySelectorAll<HTMLElement>('.katex').forEach((formula) => {
    const latex = formula
      .querySelector('annotation[encoding="application/x-tex"]')
      ?.textContent?.trim();
    if (!latex) return;
    formula.dataset.math = latex;
    formula.classList.add(formula.closest('.katex-display') ? 'math-block' : 'math-inline');
  });
  assistantClone?.querySelectorAll<HTMLElement>('pre').forEach((codeBlock) => {
    if (codeBlock.querySelector('code')) codeBlock.classList.add('code-block');
  });

  return {
    hash: hashString(`${user}\u0000${assistant}`),
    user,
    assistant,
    starred: false,
    omitEmptySections: true,
    userElement: userClone,
    assistantElement: assistantClone,
  };
}

/** Collect the currently mounted Claude turn window and detach rich DOM clones immediately. */
export function collectClaudeTurnWindow(root: ParentNode = document): ClaudeTurnSnapshot[] {
  const userSelector = claudeAdapter.selectors.userTurn;
  const assistantSelector = claudeAdapter.selectors.assistantTurn;
  if (!userSelector || !assistantSelector) return [];

  const users = Array.from(root.querySelectorAll<HTMLElement>(userSelector));
  const assistants = deepestMatches(
    Array.from(root.querySelectorAll<HTMLElement>(assistantSelector)),
  );
  const snapshots: ClaudeTurnSnapshot[] = [];
  let assistantIndex = 0;

  for (let userIndex = 0; userIndex < users.length; userIndex++) {
    const userElement = users[userIndex];
    const nextUser = users[userIndex + 1];

    while (
      assistantIndex < assistants.length &&
      compareDocumentOrder(assistants[assistantIndex], userElement) < 0
    ) {
      assistantIndex++;
    }

    const assistantElement = assistants[assistantIndex];
    const assistantBelongsToTurn =
      !!assistantElement && (!nextUser || compareDocumentOrder(assistantElement, nextUser) < 0);
    const snapshot = createSnapshot(
      userElement,
      assistantBelongsToTurn ? assistantElement : undefined,
    );

    if (snapshot.user || snapshot.assistant || snapshot.userElement?.childElementCount) {
      snapshots.push(snapshot);
    }
    if (assistantBelongsToTurn) assistantIndex++;
  }

  return snapshots;
}

/** Stitch overlapping virtualized windows without dropping previously collected turns. */
export function mergeClaudeTurnWindows(
  known: ClaudeTurnSnapshot[],
  mounted: ClaudeTurnSnapshot[],
): ClaudeTurnSnapshot[] {
  if (!mounted.length) return known;
  if (!known.length) return mounted;

  const maxOverlap = Math.min(known.length, mounted.length);
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    const knownStart = known.length - overlap;
    const matches = mounted
      .slice(0, overlap)
      .every((snapshot, index) => snapshot.hash === known[knownStart + index].hash);
    if (!matches) continue;

    // Replace the overlap with the newest detached clones, then append the new tail.
    return [...known.slice(0, knownStart), ...mounted];
  }

  return [...known, ...mounted];
}

function findScrollTarget(element: HTMLElement): HTMLElement | Window {
  for (let parent = element.parentElement; parent && parent !== document.body; ) {
    const style = getComputedStyle(parent);
    if (
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return window;
}

function getScrollTop(target: HTMLElement | Window): number {
  return target === window
    ? window.scrollY || document.documentElement.scrollTop || 0
    : (target as HTMLElement).scrollTop;
}

function getViewportHeight(target: HTMLElement | Window): number {
  return target === window
    ? window.innerHeight || document.documentElement.clientHeight || 0
    : (target as HTMLElement).clientHeight;
}

function getScrollHeight(target: HTMLElement | Window): number {
  return target === window
    ? (document.scrollingElement || document.documentElement).scrollHeight
    : (target as HTMLElement).scrollHeight;
}

function setScrollTop(target: HTMLElement | Window, top: number): void {
  if (target === window) {
    window.scrollTo({ top, behavior: 'auto' });
    return;
  }
  const container = target as HTMLElement;
  if (container.scrollTo) container.scrollTo({ top, behavior: 'auto' });
  else container.scrollTop = top;
}

async function settleClaudeWindow(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => window.setTimeout(resolve, SCROLL_SETTLE_MS));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

/** Scan Claude's virtualized conversation from top to bottom, then restore the viewport. */
export async function scanClaudeConversation(options: ScanOptions = {}): Promise<ChatTurn[]> {
  const firstTurn = document.querySelector<HTMLElement>(claudeAdapter.selectors.userTurn || '');
  if (!firstTurn) return [];

  const target = findScrollTarget(firstTurn);
  const originalTop = getScrollTop(target);
  const settle = options.settle ?? settleClaudeWindow;
  const maxSteps = options.maxSteps ?? MAX_SCAN_STEPS;
  let collected: ClaudeTurnSnapshot[] = [];
  let bottomStablePasses = 0;

  try {
    setScrollTop(target, 0);
    await settle();

    for (let step = 0; step < maxSteps; step++) {
      const beforeCount = collected.length;
      collected = mergeClaudeTurnWindows(collected, collectClaudeTurnWindow());
      const top = getScrollTop(target);
      const viewportHeight = Math.max(getViewportHeight(target), MIN_SCROLL_STEP_PX);
      const maxTop = Math.max(0, getScrollHeight(target) - viewportHeight);
      const atBottom = top >= maxTop - 2;

      if (atBottom) {
        bottomStablePasses = collected.length === beforeCount ? bottomStablePasses + 1 : 0;
        if (bottomStablePasses >= 2) break;
        await settle();
        continue;
      }

      bottomStablePasses = 0;
      const stepSize = Math.max(viewportHeight * SCROLL_STEP_RATIO, MIN_SCROLL_STEP_PX);
      setScrollTop(target, Math.min(maxTop, top + stepSize));
      await settle();
    }
  } finally {
    setScrollTop(target, originalTop);
  }

  return collected.map(({ hash: _hash, ...turn }) => turn);
}

function getConversationTitle(): string {
  const title = document.title.replace(/\s*[|-]\s*Claude.*$/i, '').trim();
  return title || 'Claude conversation';
}

function createExportIcon(): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('gv-claude-export-icon');

  const path = document.createElementNS(namespace, 'path');
  path.setAttribute('d', 'M12 3v11m0 0 4-4m-4 4-4-4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  icon.appendChild(path);
  return icon;
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .gv-claude-export-button {
      position: fixed;
      right: 20px;
      bottom: 88px;
      z-index: 2147483000;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 42px;
      padding: 0 15px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 999px;
      background: #d97757;
      color: #fff;
      box-shadow: 0 10px 28px rgba(91, 48, 34, 0.28);
      font: 600 13px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
      cursor: pointer;
      transition: transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
    }
    .gv-claude-export-button:hover {
      background: #c96849;
      box-shadow: 0 13px 32px rgba(91, 48, 34, 0.34);
      transform: translateY(-1px);
    }
    .gv-claude-export-button:focus-visible {
      outline: 3px solid rgba(217, 119, 87, 0.38);
      outline-offset: 3px;
    }
    .gv-claude-export-button:disabled {
      cursor: wait;
      opacity: 0.78;
      transform: none;
    }
    .gv-claude-export-icon {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
    }
    :root.dark .gv-claude-export-button {
      background: #c8765c;
      border-color: rgba(255, 255, 255, 0.18);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.38);
    }
    :root.dark .gv-claude-export-button:hover { background: #d18468; }
    @media (max-width: 640px) {
      .gv-claude-export-button {
        right: 14px;
        bottom: 76px;
        width: 44px;
        min-height: 44px;
        justify-content: center;
        padding: 0;
      }
      .gv-claude-export-label { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .gv-claude-export-button { transition: none; }
    }
  `;
  document.head.appendChild(style);
}

class ClaudeExportPlugin {
  private button: HTMLButtonElement | null = null;
  private dialog: ExportDialog | null = null;
  private observer: MutationObserver | null = null;
  private destroyed = false;
  private busy = false;
  private language: AppLanguage = 'en';

  start(): void {
    ensureStyles();
    this.syncButton();
    if (document.body && !this.observer) {
      this.observer = new MutationObserver(() => this.syncButton());
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('popstate', this.syncButton);
    window.addEventListener('hashchange', this.syncButton);
    void getCurrentLanguage().then((language) => {
      if (this.destroyed) return;
      this.language = language;
      this.updateButtonCopy();
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    this.observer = null;
    window.removeEventListener('popstate', this.syncButton);
    window.removeEventListener('hashchange', this.syncButton);
    this.dialog?.hide();
    this.dialog = null;
    this.button?.remove();
    this.button = null;
    document.getElementById(STYLE_ID)?.remove();
  }

  private syncButton = (): void => {
    if (this.destroyed) return;
    if (!CHAT_PATH_PATTERN.test(location.pathname)) {
      this.button?.remove();
      this.button = null;
      return;
    }
    if (this.button?.isConnected) return;

    const existing = document.getElementById(BUTTON_ID);
    if (existing instanceof HTMLButtonElement) {
      this.button = existing;
      this.updateButtonCopy();
      return;
    }

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = 'gv-claude-export-button';
    button.appendChild(createExportIcon());
    const label = document.createElement('span');
    label.className = 'gv-claude-export-label';
    button.appendChild(label);
    button.addEventListener('click', () => void this.openDialog());
    document.body.appendChild(button);
    this.button = button;
    this.updateButtonCopy();
  };

  private updateButtonCopy(): void {
    if (!this.button) return;
    const copy = CLAUDE_EXPORT_COPY[this.language];
    const text = this.busy ? copy.busy : copy.button;
    const label = this.button.querySelector<HTMLElement>('.gv-claude-export-label');
    if (label) label.textContent = text;
    this.button.title = text;
    this.button.setAttribute('aria-label', text);
    this.button.disabled = this.busy;
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.updateButtonCopy();
  }

  private t(key: TranslationKey): string {
    return TRANSLATIONS[this.language][key] ?? TRANSLATIONS.en[key] ?? key;
  }

  private async openDialog(): Promise<void> {
    if (this.busy) return;
    this.language = await getCurrentLanguage();
    if (this.destroyed) return;
    const initialImageWidth = await getSavedImageExportWidth();
    if (this.destroyed) return;

    this.dialog?.hide();
    const dialog = new ExportDialog();
    this.dialog = dialog;
    dialog.show({
      onExport: (format, fontSize, imageWidth) => {
        void this.exportConversation(format, fontSize, imageWidth);
      },
      onCancel: () => {
        if (this.dialog === dialog) this.dialog = null;
      },
      initialImageWidth,
      translations: {
        title: this.t('export_dialog_title'),
        selectFormat: this.t('export_dialog_select'),
        warning: this.t('export_dialog_warning'),
        safariCmdpHint: this.t('export_dialog_safari_cmdp_hint'),
        safariMarkdownHint: this.t('export_dialog_safari_markdown_hint'),
        cancel: this.t('pm_cancel'),
        export: this.t('pm_export'),
        fontSizeLabel: this.t('export_fontsize_label'),
        fontSizePreview: this.t('export_fontsize_preview'),
        imageWidthLabel: this.t('export_image_width_label'),
        imageWidthNarrow: this.t('export_image_width_narrow'),
        imageWidthMedium: this.t('export_image_width_medium'),
        imageWidthWide: this.t('export_image_width_wide'),
        formatDescriptions: {
          json: this.t('export_format_json_description'),
          markdown: this.t('export_format_markdown_description'),
          pdf: this.t('export_format_pdf_description'),
          image: this.t('export_format_image_description'),
        },
      },
    });
  }

  private async exportConversation(
    format: ExportFormat,
    fontSize?: number,
    imageWidth?: number,
  ): Promise<void> {
    this.setBusy(true);
    try {
      if (format === 'image') await saveImageExportWidth(imageWidth);
      const turns = await scanClaudeConversation();
      if (!turns.length) {
        showExportToast(CLAUDE_EXPORT_COPY[this.language].empty);
        return;
      }

      const result = await ConversationExportService.export(
        turns,
        {
          url: location.href.split('#')[0],
          exportedAt: new Date().toISOString(),
          title: getConversationTitle(),
          count: turns.length,
          source: 'claude',
        },
        { format, fontSize, imageWidth },
      );
      if (!result.success) {
        const detail = result.error ? `: ${result.error}` : '';
        showExportToast(`${CLAUDE_EXPORT_COPY[this.language].failed}${detail}`);
      }
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : '';
      showExportToast(`${CLAUDE_EXPORT_COPY[this.language].failed}${detail}`);
    } finally {
      this.setBusy(false);
    }
  }
}

let instance: ClaudeExportPlugin | null = null;

export function startClaudeExport(): void {
  if (instance) return;
  instance = new ClaudeExportPlugin();
  instance.start();
}

export function stopClaudeExport(): void {
  instance?.destroy();
  instance = null;
}
