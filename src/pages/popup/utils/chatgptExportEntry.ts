import browser from 'webextension-polyfill';

import {
  CHATGPT_EXPORT_OPEN_MESSAGE,
  type ChatGptExportOpenResponse,
} from '@/features/plugins/builtin/chatgptExport/openMessage';

/**
 * `opened`: the tab opened its export dialog. `no-conversation`: the exporter
 * runs but the page holds nothing to export. `unreachable`: no exporter
 * answered (the tab predates the grant, or the plugin has not mounted yet).
 */
export type ChatGptExportOpenResult = 'opened' | 'no-conversation' | 'unreachable';

/** Ask the ChatGPT tab's top frame to open the existing export dialog. */
export async function openChatGptExportInTab(tabId: number): Promise<ChatGptExportOpenResult> {
  try {
    // Only the top frame owns the export toolbar; a subframe must not answer first.
    const response = (await browser.tabs.sendMessage(
      tabId,
      { type: CHATGPT_EXPORT_OPEN_MESSAGE },
      { frameId: 0 },
    )) as ChatGptExportOpenResponse | undefined;
    if (response?.ok === true) return 'opened';
    if (response?.ok === false && response.reason === 'no-conversation') return 'no-conversation';
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
}
