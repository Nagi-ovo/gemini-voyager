/** The rows of the history panel: each prompt with its copy, insert and delete actions. */
import type { IconNode } from 'lucide-react';

import { createLucideIcon } from '@/core/icons/lucideIcon';
import { getTranslationSync } from '@/utils/i18n';

import { insertTextIntoChatInput } from '../chatInput/index';
import { expandInputCollapseIfNeeded } from '../inputCollapse/index';
import type { PromptHistoryItem } from './storage';

export interface HistoryRowHandlers {
  notify: (message: string, kind: 'ok' | 'error') => void;
  /** The prompt reached the composer. */
  onInserted: () => void;
  remove: (item: PromptHistoryItem) => void;
}

/** Lucide `history` geometry from lucide-react v0.553.0. */
const HISTORY_ICON_NODE = [
  ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', key: '1357e3' }],
  ['path', { d: 'M3 3v5h5', key: '1xhq8a' }],
  ['path', { d: 'M12 7v5l4 2', key: '1fdv2h' }],
] satisfies IconNode;

/** The trigger's line icon, in currentColor like every other Voyager control. */
export function createHistoryIcon(): SVGSVGElement {
  const icon = createLucideIcon('history', HISTORY_ICON_NODE, 20);
  icon.classList.add('gv-ph-trigger-icon');
  return icon;
}

export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      if (!document.execCommand('copy')) throw new Error('Clipboard copy was rejected');
    } finally {
      textarea.remove();
    }
  }
}

function formatTime(timestamp: number): string {
  const locale = document.documentElement.lang || chrome.i18n?.getUILanguage?.() || undefined;
  return new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function renderHistoryItems(
  list: HTMLElement,
  items: PromptHistoryItem[],
  handlers: HistoryRowHandlers,
): void {
  list.replaceChildren();
  if (items.length === 0) {
    const empty = createEl('div', 'gv-ph-empty');
    empty.textContent = getTranslationSync('promptHistoryEmpty');
    list.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const row = createEl('article', 'gv-ph-item');
    const meta = createEl('div', 'gv-ph-item-meta');
    const badge = createEl('span', `gv-ph-badge gv-ph-badge-${item.type}`);
    badge.textContent = getTranslationSync(
      item.type === 'sent' ? 'promptHistorySent' : 'promptHistoryEdited',
    );
    const time = createEl('time', 'gv-ph-time');
    time.dateTime = new Date(item.timestamp).toISOString();
    time.textContent = formatTime(item.timestamp);
    meta.append(badge, time);

    const text = createEl('div', 'gv-ph-item-text');
    text.textContent = item.content;

    const actions = createEl('div', 'gv-ph-item-actions');
    const copyButton = createEl('button', 'gv-ph-action');
    copyButton.type = 'button';
    copyButton.textContent = getTranslationSync('promptHistoryCopy');
    copyButton.addEventListener('click', (event) => {
      event.stopPropagation();
      void copyText(item.content)
        .then(() => handlers.notify(getTranslationSync('promptHistoryCopied'), 'ok'))
        .catch(() => handlers.notify(getTranslationSync('promptHistoryCopyFailed'), 'error'));
    });

    const insertButton = createEl('button', 'gv-ph-action gv-ph-action-primary');
    insertButton.type = 'button';
    insertButton.textContent = getTranslationSync('promptHistoryInsert');
    insertButton.addEventListener('click', (event) => {
      event.stopPropagation();
      expandInputCollapseIfNeeded();
      if (insertTextIntoChatInput(item.content)) {
        handlers.notify(getTranslationSync('promptHistoryInserted'), 'ok');
        handlers.onInserted();
      } else {
        handlers.notify(getTranslationSync('promptHistoryInsertFailed'), 'error');
      }
    });

    const deleteButton = createEl('button', 'gv-ph-action gv-ph-action-danger');
    deleteButton.type = 'button';
    deleteButton.textContent = getTranslationSync('promptHistoryDelete');
    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      handlers.remove(item);
    });

    actions.append(copyButton, insertButton, deleteButton);
    row.append(meta, text, actions);
    fragment.appendChild(row);
  });
  list.appendChild(fragment);
}
