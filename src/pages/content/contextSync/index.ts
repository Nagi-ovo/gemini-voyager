import { SyncService } from '@/features/contextSync/services/SyncService';

import { ContextCaptureService } from './capture';

export function startContextSync() {
  console.log('🚀 AI Context Sync Feature Initialized');

  // Listen for messages from Popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sync_to_ide') {
      handleSyncRequest(sendResponse);
      return true; // Keep channel open
    }
  });
}

async function handleSyncRequest(sendResponse: (response: unknown) => void) {
  try {
    const captureService = ContextCaptureService.getInstance();
    const syncService = SyncService.getInstance();

    const data = await captureService.captureDialogue();
    const result = await syncService.syncToIDE(data);

    sendResponse({ status: 'success', data: result });
  } catch (err) {
    console.error('Sync failed', err);
    sendResponse({ status: 'error', message: (err as Error).message });
  }
}
