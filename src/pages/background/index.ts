/* Background service worker - handles cross-origin image fetch for packaging, popup opening, and backups */
import { backupScheduler } from '@/features/backup/services/BackupScheduler';
import { backupService } from '@/features/backup/services/BackupService';

// Initialize backup scheduler on startup
backupScheduler.initialize().catch(console.error);

// Listen for config changes to update schedule
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.gvBackupConfig) {
    backupScheduler.updateSchedule().catch(console.error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      // Handle popup opening request
      if (message && message.type === 'gv.openPopup') {
        try {
          await chrome.action.openPopup();
          sendResponse({ ok: true });
        } catch (e: any) {
          // Fallback: If openPopup fails, user can click the extension icon
          console.warn('[GV] Failed to open popup programmatically:', e);
          sendResponse({ ok: false, error: String(e?.message || e) });
        }
        return;
      }

      // Handle manual backup request
      if (message && message.type === 'gv.createBackup') {
        try {
          // Prompts must be provided from popup since service worker cannot access localStorage
          const prompts = message.payload?.prompts || [];
          const result = await backupService.createBackup(prompts);
          sendResponse(result);
        } catch (e: any) {
          console.error('[GV] Backup failed:', e);
          sendResponse({ success: false, error: String(e?.message || e) });
        }
        return;
      }

      // Note: Backup restoration is handled directly in popup (Popup.tsx)
      // because it requires access to localStorage which is not available in service workers

      // Handle image fetch
      if (!message || message.type !== 'gv.fetchImage') return;
      const url = String(message.url || '');
      if (!/^https?:\/\//i.test(url)) {
        sendResponse({ ok: false, error: 'invalid_url' });
        return;
      }
      const resp = await fetch(url, { credentials: 'include', mode: 'cors' as RequestMode });
      if (!resp.ok) {
        sendResponse({ ok: false, status: resp.status });
        return;
      }
      const contentType = resp.headers.get('Content-Type') || '';
      const ab = await resp.arrayBuffer();
      // Convert to base64
      const b64 = arrayBufferToBase64(ab);
      sendResponse({ ok: true, contentType, base64: b64 });
    } catch (e: any) {
      try { sendResponse({ ok: false, error: String(e?.message || e) }); } catch {}
    }
  })();
  return true; // keep channel open for async sendResponse
});

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // btoa on service worker context is available
  return btoa(binary);
}
