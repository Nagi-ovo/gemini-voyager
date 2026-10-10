import { askConfirm } from '@/core/ui/confirm';
import type { TranslationKey } from '@/utils/translations';

import {
  CHATGPT_JUMP_ACCOUNT_MESSAGE,
  CHATGPT_JUMP_ACCOUNT_TIMEOUT_MS,
} from './chatGptJumpMessages';
import { type SavedLibraryItem, buildSavedLibraryItemUrl } from './model';
import { formatSavedLibraryAccount } from './presentation';
import { ALL_FILTER, getSavedLibraryView } from './viewModel';

/** An unavailable content script must never block opening a saved conversation. */
async function readChatGptJumpAccount(): Promise<string | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
        const tab = tabs.find((candidate) => {
          if (typeof candidate.id !== 'number' || !candidate.url) return false;
          try {
            return new URL(candidate.url).origin === 'https://chatgpt.com';
          } catch {
            return false;
          }
        });
        if (tab?.id === undefined) return null;
        const response: unknown = await chrome.tabs.sendMessage(tab.id, {
          type: CHATGPT_JUMP_ACCOUNT_MESSAGE,
        });
        if (
          !response ||
          typeof response !== 'object' ||
          !('ok' in response) ||
          response.ok !== true ||
          !('account' in response) ||
          typeof response.account !== 'string' ||
          !/^chatgpt:[a-f0-9]{64}$/.test(response.account)
        )
          return null;
        return response.account;
      })(),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), CHATGPT_JUMP_ACCOUNT_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Shared by the popup and Library; account switching remains a manual ChatGPT action. */
export async function confirmSavedLibraryOpen(
  item: SavedLibraryItem,
  items: readonly SavedLibraryItem[],
  t: (key: TranslationKey) => string,
  signal?: AbortSignal,
): Promise<boolean> {
  const target = new URL(buildSavedLibraryItemUrl(item));
  if (signal?.aborted) return false;
  if (item.kind !== 'starred' || target.hostname !== 'chatgpt.com' || !item.account) return true;
  const account = await readChatGptJumpAccount();
  if (signal?.aborted) return false;
  if (!account || account === item.account) return true;
  const view = getSavedLibraryView(items, {
    kind: ALL_FILTER,
    query: '',
    site: ALL_FILTER,
    account: ALL_FILTER,
  });
  const group = view.groups.find((candidate) => candidate.items.includes(item));
  const label = formatSavedLibraryAccount(t, group?.accountNumber ?? 0);
  const answer = await askConfirm({
    message: t('savedLibraryChatGptSwitchAccount').replace('{account}', label),
    tone: 'neutral',
    cancelLabel: t('pm_cancel'),
    choices: [{ id: 'open', label: t('savedLibraryOpenAnyway') }],
    signal,
  });
  return answer === 'open' && !signal?.aborted;
}
