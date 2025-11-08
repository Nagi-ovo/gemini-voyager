/* Background service worker - handles cross-origin image fetch for packaging and popup opening */
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
