import { logger } from '@/core/services/LoggerService';
import { SyncService } from '@/features/contextSync/services/SyncService';
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { getTranslationSync } from '@/utils/i18n';

import { ContextCaptureService } from './capture';

/** The scope owns request admission; accepted transfers finish independently. */
export function activateGeminiContextSync(scope: PluginScope): void {
  scope.onChromeEvent(
    chrome.runtime.onMessage,
    (request: unknown, _sender: chrome.runtime.MessageSender, sendResponse) => {
      if (
        !request ||
        typeof request !== 'object' ||
        !('action' in request) ||
        request.action !== 'sync_to_ide'
      ) {
        return;
      }
      // A queued callback from a removed listener must not start another capture.
      if (scope.isDisposed) {
        // The popup displays this message verbatim, so use the current app language.
        sendResponse({ status: 'error', message: getTranslationSync('contextSyncDisabled') });
        return;
      }
      // Disabling removes admission, but must not strand an already accepted popup request.
      void handleSyncRequest(sendResponse);
      return true;
    },
  );
}

async function handleSyncRequest(sendResponse: (response: unknown) => void): Promise<void> {
  try {
    const captureService = ContextCaptureService.getInstance();
    const syncService = SyncService.getInstance();
    const data = await captureService.captureDialogue();
    const result = await syncService.syncToIDE(data);
    sendResponse({ status: 'success', data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Context Sync failed', { error: message });
    sendResponse({ status: 'error', message });
  }
}
