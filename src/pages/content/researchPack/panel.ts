/**
 * Research Pack panel: a floating launcher plus a side panel that lists the
 * pack, edits the instruction, previews the Markdown and offers the actions.
 *
 * All page-derived text (answers, titles, links) is written with
 * `textContent` / `value`, never `innerHTML`. Styles live in
 * `public/contentStyle.css` under `gv-rp-`.
 */
import { askConfirm } from '@/core/ui/confirm';
import { createToaster } from '@/core/ui/toast/toaster';
import { safeHttpUrl } from '@/features/researchPack/services/citations';
import { HANDOFF_TARGET_IDS, type HandoffTarget } from '@/features/researchPack/services/handoff';
import { platformLabel } from '@/features/researchPack/services/markdown';
import type { TemplateLibrary } from '@/features/researchPack/services/templates';
import type { ResearchPack, ResearchPackItem } from '@/features/researchPack/services/types';
import type { TranslationKey } from '@/utils/translations';

import { announceSurfaceOpened } from '../floatingSurfaces';
import { formatTarget } from './continueIn';
import { createTemplatesSection } from './templatesSection';

export interface ResearchPackPanelActions {
  onMove: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  /** Persist the instruction; the returned promise settles when the save does. */
  onInstructionChange: (instruction: string) => Promise<unknown> | void;
  onCopy: () => void;
  onDownload: () => void;
  onInsert: () => void;
  /** Open a new chat on `target` with the pack. Runs inside the click. */
  onContinue: (target: HandoffTarget) => void;
  /** The panel was opened. */
  onOpen?: () => void;
  onClear: () => void;
  /** Read the pack again after a failed load. */
  onRetry: () => void;
  /** Where instruction templates are kept: the Prompt Manager library. */
  templateLibrary: TemplateLibrary;
  /** Save a text file, such as an exported template. */
  onDownloadFile: (filename: string, content: string) => void;
}

export interface ResearchPackPanel {
  readonly root: HTMLElement;
  /**
   * Show `pack`. The instruction box keeps what the user is typing unless
   * `replaceInstruction` is set, which the first snapshot of a scope uses so
   * one account's text never stays on screen for another. `locked` disables
   * every edit and action while a scope has no snapshot yet; `loadFailed` also
   * says so and offers Retry, and keeps the launcher on screen with an error
   * badge so the panel can always be reopened to retry.
   */
  render: (
    pack: ResearchPack,
    markdown: string,
    options?: { replaceInstruction?: boolean; locked?: boolean; loadFailed?: boolean },
  ) => void;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
  /**
   * The instruction as currently typed. Exports read this rather than the
   * stored pack, so a click right after typing never loses the last edit.
   */
  instructionDraft: () => string;
  /** Cancel the debounced save and return its text, or null when none is pending. */
  takePendingInstruction: () => string | null;
  /** Feedback in the panel's status line, or as a stack toast while the panel is closed. */
  notify: (message: string, tone?: 'ok' | 'error') => void;
  /** Re-read every label after a language change. */
  relabel: () => void;
  /** Read the template list again after the prompt library changed. */
  refreshTemplates: () => void;
  destroy: () => void;
}

const INSTRUCTION_SAVE_DELAY_MS = 400;
const STATUS_CLEAR_DELAY_MS = 3500;
const STATUS_CHANNEL = 'status';
const SNIPPET_CHARS = 220;

type Translate = (key: TranslationKey) => string;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function snippet(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > SNIPPET_CHARS ? `${compact.slice(0, SNIPPET_CHARS)}…` : compact;
}

function format(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(String(value)),
    template,
  );
}

export function createResearchPackPanel(
  t: Translate,
  actions: ResearchPackPanelActions,
): ResearchPackPanel {
  const root = el('div', 'gv-rp-root');

  const launcher = el('button', 'gv-rp-launcher');
  launcher.type = 'button';
  launcher.hidden = true;
  const launcherLabel = el('span', 'gv-rp-launcher-label');
  const launcherCount = el('span', 'gv-rp-launcher-count');
  launcher.append(launcherLabel, launcherCount);

  const panel = el('section', 'gv-rp-panel');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');

  const header = el('header', 'gv-rp-header');
  const title = el('h2', 'gv-rp-title');
  const count = el('span', 'gv-rp-count');
  const closeButton = el('button', 'gv-rp-icon-btn gv-rp-close', '×');
  closeButton.type = 'button';
  header.append(title, count, closeButton);

  const loadError = el('div', 'gv-rp-load-error');
  loadError.hidden = true;
  loadError.setAttribute('role', 'alert');
  const loadErrorText = el('p', 'gv-rp-load-error-text');
  loadErrorText.id = 'gv-rp-load-error-text';
  const retryButton = el('button', 'gv-rp-btn');
  retryButton.type = 'button';
  loadError.append(loadErrorText, retryButton);

  const empty = el('p', 'gv-rp-empty');
  const list = el('ol', 'gv-rp-list');

  const instructionLabel = el('label', 'gv-rp-label');
  instructionLabel.htmlFor = 'gv-rp-instruction';
  const instruction = el('textarea', 'gv-rp-instruction');
  instruction.id = 'gv-rp-instruction';
  instruction.rows = 3;

  const preview = el('details', 'gv-rp-preview');
  const previewSummary = el('summary', 'gv-rp-preview-summary');
  const markdownView = el('pre', 'gv-rp-markdown');
  markdownView.tabIndex = 0;
  preview.append(previewSummary, markdownView);

  const status = el('p', 'gv-rp-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const footer = el('footer', 'gv-rp-actions');
  const insertButton = el('button', 'gv-rp-btn gv-rp-btn-primary');
  const copyButton = el('button', 'gv-rp-btn');
  const downloadButton = el('button', 'gv-rp-btn');
  const clearButton = el('button', 'gv-rp-btn gv-rp-btn-quiet');
  for (const button of [insertButton, copyButton, downloadButton, clearButton]) {
    button.type = 'button';
  }
  footer.append(insertButton, copyButton, downloadButton, clearButton);

  const continueRow = el('div', 'gv-rp-continue');
  const continueButtons = HANDOFF_TARGET_IDS.map((target) => {
    const button = el('button', 'gv-rp-btn gv-rp-continue-btn');
    button.type = 'button';
    button.dataset.target = target;
    continueRow.append(button);
    return { target, button };
  });

  const body = el('div', 'gv-rp-body');
  body.append(loadError, empty, list, instructionLabel, instruction, preview);
  panel.append(header, body, status, continueRow, footer);
  // While the panel is closed, feedback goes to the shared toast stack.
  const toaster = createToaster();
  root.append(launcher, panel);

  // Owns any open confirm: closing, locking or destroying the panel answers it
  // with null, so a confirm opened for one pack never acts on another.
  let confirmOwner = new AbortController();
  const dropConfirm = (): void => {
    confirmOwner.abort();
    confirmOwner = new AbortController();
  };
  const confirm = async (request: {
    anchor: HTMLElement;
    message: string;
    confirmLabel: string;
  }): Promise<boolean> =>
    (await askConfirm({
      message: request.message,
      anchor: request.anchor,
      side: 'above',
      tone: 'danger',
      cancelLabel: t('pm_cancel'),
      choices: [{ id: 'confirm', label: request.confirmLabel }],
      signal: confirmOwner.signal,
    })) === 'confirm';
  let currentPack: ResearchPack | null = null;
  let loadFailed = false;
  let instructionTimer: ReturnType<typeof setTimeout> | null = null;
  let savesInFlight = 0;
  let statusTimer: ReturnType<typeof setTimeout> | null = null;

  const saveInstruction = (): void => {
    const pending = actions.onInstructionChange(instruction.value);
    if (!pending) return;
    savesInFlight += 1;
    void Promise.resolve(pending)
      .catch(() => undefined)
      .finally(() => {
        savesInFlight -= 1;
      });
  };

  const flushInstruction = (): void => {
    if (instructionTimer === null) return;
    clearTimeout(instructionTimer);
    instructionTimer = null;
    saveInstruction();
  };

  /**
   * Replace the instruction outright, as picking a template does. Unlike a
   * snapshot from storage, this wins over focus and pending saves: any typing
   * still waiting to be saved is dropped in favour of the chosen text.
   */
  const applyInstruction = (text: string): void => {
    if (instructionTimer !== null) clearTimeout(instructionTimer);
    instructionTimer = null;
    instruction.value = text;
    saveInstruction();
  };

  const templates = createTemplatesSection({
    t,
    library: actions.templateLibrary,
    instruction: () => instruction.value,
    applyInstruction,
    confirm,
    notify: (message, tone) => notify(message, tone),
    download: actions.onDownloadFile,
  });
  preview.before(templates.root);

  const syncLauncher = (): void => {
    const itemCount = currentPack?.items.length ?? 0;
    // A failed load leaves nothing to count, so the badge shows the failure instead.
    launcherCount.textContent = loadFailed ? '!' : String(itemCount);
    launcher.hidden = !panel.hidden || (itemCount === 0 && !loadFailed);
    launcher.title = loadFailed ? t('researchPackLoadFailed') : t('researchPackOpen');
    if (loadFailed) {
      launcher.dataset.state = 'error';
      launcher.setAttribute('aria-describedby', loadErrorText.id);
    } else {
      delete launcher.dataset.state;
      launcher.removeAttribute('aria-describedby');
    }
  };

  const open = (): void => {
    panel.hidden = false;
    toaster.dismiss(STATUS_CHANNEL);
    syncLauncher();
    templates.refresh();
    closeButton.focus({ preventScroll: true });
    announceSurfaceOpened('research-pack');
    actions.onOpen?.();
  };

  const close = (): void => {
    flushInstruction();
    dropConfirm();
    panel.hidden = true;
    syncLauncher();
  };

  const renderItem = (item: ResearchPackItem, position: number, total: number): HTMLLIElement => {
    const row = el('li', 'gv-rp-item');
    row.dataset.itemId = item.id;

    const head = el('div', 'gv-rp-item-head');
    head.append(el('span', 'gv-rp-item-index', `${position + 1}`));
    const sourceText = item.sourceTitle || t('researchPackUntitledSource');
    const href = safeHttpUrl(item.sourceUrl);
    if (href) {
      const source = el('a', 'gv-rp-item-source', sourceText);
      source.href = href;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.title = href;
      head.append(source);
    } else {
      head.append(el('span', 'gv-rp-item-source', sourceText));
    }
    if (item.excerpt) head.append(el('span', 'gv-rp-badge', t('researchPackExcerptBadge')));

    const text = el('p', 'gv-rp-item-snippet', snippet(item.text));
    const meta = el(
      'p',
      'gv-rp-item-meta',
      `${platformLabel(item.platform)} · ${format(t('researchPackSourceCount'), {
        count: item.citations.length,
      })}`,
    );

    const controls = el('div', 'gv-rp-item-actions');
    const up = el('button', 'gv-rp-icon-btn', '↑');
    const down = el('button', 'gv-rp-icon-btn', '↓');
    const remove = el('button', 'gv-rp-icon-btn', '×');
    for (const [button, label] of [
      [up, t('researchPackMoveUp')],
      [down, t('researchPackMoveDown')],
      [remove, t('researchPackRemove')],
    ] as const) {
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    up.disabled = position === 0;
    down.disabled = position === total - 1;
    up.addEventListener('click', () => actions.onMove(item.id, -1));
    down.addEventListener('click', () => actions.onMove(item.id, 1));
    remove.addEventListener('click', () => actions.onRemove(item.id));
    controls.append(up, down, remove);

    row.append(head, text, meta, controls);
    return row;
  };

  const relabel = (): void => {
    launcher.setAttribute('aria-label', t('researchPackOpen'));
    launcherLabel.textContent = t('researchPackShortTitle');
    panel.setAttribute('aria-label', t('researchPackTitle'));
    title.textContent = t('researchPackTitle');
    closeButton.setAttribute('aria-label', t('researchPackClose'));
    closeButton.title = t('researchPackClose');
    empty.textContent = t('researchPackEmpty');
    loadErrorText.textContent = t('researchPackLoadFailed');
    retryButton.textContent = t('researchPackRetry');
    instructionLabel.textContent = t('researchPackInstructionLabel');
    instruction.placeholder = t('researchPackInstructionPlaceholder');
    previewSummary.textContent = t('researchPackPreview');
    insertButton.textContent = t('researchPackInsert');
    insertButton.title = t('researchPackInsertHint');
    copyButton.textContent = t('researchPackCopy');
    downloadButton.textContent = t('researchPackDownload');
    clearButton.textContent = t('researchPackClear');
    for (const { target, button } of continueButtons) {
      button.textContent = formatTarget(t('researchPackContinueIn'), target);
      button.title = formatTarget(t('researchPackContinueHint'), target);
    }
    templates.relabel();
    if (currentPack) {
      count.textContent = format(t('researchPackItemCount'), { count: currentPack.items.length });
    }
    syncLauncher();
  };

  const render = (
    pack: ResearchPack,
    markdown: string,
    options: { replaceInstruction?: boolean; locked?: boolean; loadFailed?: boolean } = {},
  ): void => {
    loadFailed = options.loadFailed === true;
    const locked = loadFailed || options.locked === true;
    loadError.hidden = !loadFailed;
    currentPack = pack;
    panel.setAttribute('aria-busy', String(locked));
    instruction.disabled = locked;
    templates.setLocked(locked);
    // A confirm opened for the old content must not act on what replaces it.
    if (locked) dropConfirm();
    count.textContent = format(t('researchPackItemCount'), { count: pack.items.length });
    const hasItems = pack.items.length > 0;
    empty.hidden = hasItems || loadFailed;
    list.replaceChildren(
      ...pack.items.map((item, index) => renderItem(item, index, pack.items.length)),
    );
    // Never replace text the user is typing or that is still being saved.
    if (
      options.replaceInstruction ||
      (document.activeElement !== instruction && instructionTimer === null && savesInFlight === 0)
    ) {
      instruction.value = pack.instruction;
    }
    markdownView.textContent = markdown;
    for (const button of [
      insertButton,
      copyButton,
      downloadButton,
      clearButton,
      ...continueButtons.map(({ button }) => button),
    ]) {
      button.disabled = locked || !hasItems;
    }
    syncLauncher();
  };

  const notify = (message: string, tone: 'ok' | 'error' = 'ok'): void => {
    status.textContent = '';
    toaster.dismiss(STATUS_CHANNEL);
    if (statusTimer !== null) clearTimeout(statusTimer);
    statusTimer = null;
    if (panel.hidden) {
      toaster.show({
        channel: STATUS_CHANNEL,
        message,
        tone: tone === 'ok' ? 'success' : 'error',
        durationMs: STATUS_CLEAR_DELAY_MS,
      });
      return;
    }
    status.textContent = message;
    status.dataset.tone = tone;
    statusTimer = setTimeout(() => {
      statusTimer = null;
      status.textContent = '';
    }, STATUS_CLEAR_DELAY_MS);
  };

  launcher.addEventListener('click', open);
  retryButton.addEventListener('click', () => actions.onRetry());
  closeButton.addEventListener('click', close);
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
    if (!launcher.hidden) launcher.focus({ preventScroll: true });
  });
  instruction.addEventListener('input', () => {
    if (instructionTimer !== null) clearTimeout(instructionTimer);
    instructionTimer = setTimeout(() => {
      instructionTimer = null;
      saveInstruction();
    }, INSTRUCTION_SAVE_DELAY_MS);
  });
  instruction.addEventListener('blur', flushInstruction);
  insertButton.addEventListener('click', () => {
    flushInstruction();
    actions.onInsert();
  });
  copyButton.addEventListener('click', () => {
    flushInstruction();
    actions.onCopy();
  });
  downloadButton.addEventListener('click', () => {
    flushInstruction();
    actions.onDownload();
  });
  for (const { target, button } of continueButtons) {
    button.addEventListener('click', () => {
      flushInstruction();
      actions.onContinue(target);
    });
  }
  clearButton.addEventListener('click', async () => {
    const confirmed = await confirm({
      anchor: clearButton,
      message: t('researchPackClearConfirm'),
      confirmLabel: t('researchPackClear'),
    });
    if (confirmed) actions.onClear();
  });

  relabel();

  return {
    root,
    render,
    open,
    close,
    isOpen: () => !panel.hidden,
    instructionDraft: () => instruction.value,
    takePendingInstruction: () => {
      if (instructionTimer === null) return null;
      clearTimeout(instructionTimer);
      instructionTimer = null;
      return instruction.value;
    },
    notify,
    relabel,
    refreshTemplates: templates.refresh,
    destroy: () => {
      flushInstruction();
      if (statusTimer !== null) clearTimeout(statusTimer);
      statusTimer = null;
      toaster.destroy();
      templates.destroy();
      confirmOwner.abort();
      root.remove();
    },
  };
}
