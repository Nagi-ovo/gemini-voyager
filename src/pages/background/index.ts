/* Background service worker - handles cross-origin image fetch, popup opening, and sync */
import browser from 'webextension-polyfill';

import { googleDriveSyncService } from '@/core/services/GoogleDriveSyncService';
import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import type { PromptItem, SyncMode } from '@/core/types/sync';
import type { StarredMessage, StarredMessagesData } from '@/pages/content/timeline/starredTypes';

const CUSTOM_CONTENT_SCRIPT_ID = 'gv-custom-content-script';
const CUSTOM_WEBSITE_KEY = 'gvPromptCustomWebsites';
const FETCH_INTERCEPTOR_SCRIPT_ID = 'gv-fetch-interceptor';

// Gemini domains where the fetch interceptor should run
const GEMINI_MATCHES = [
  'https://gemini.google.com/*',
  'https://aistudio.google.com/*',
  'https://aistudio.google.cn/*',
];

/**
 * Register the fetch interceptor script into MAIN world
 * This allows intercepting fetch calls made by the page itself
 */
async function registerFetchInterceptor(): Promise<void> {
  if (!chrome.scripting?.registerContentScripts) return;

  // Check if watermark remover feature is enabled
  const result = await chrome.storage.sync.get({ geminiWatermarkRemoverEnabled: true });
  const isEnabled = result.geminiWatermarkRemoverEnabled !== false;

  try {
    // Always unregister first to update settings
    await chrome.scripting.unregisterContentScripts({ ids: [FETCH_INTERCEPTOR_SCRIPT_ID] });
  } catch {
    // No-op if script was not registered
  }

  // Only register if watermark remover is enabled
  if (!isEnabled) {
    console.log('[Background] Fetch interceptor not registered (watermark remover disabled)');
    return;
  }

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: FETCH_INTERCEPTOR_SCRIPT_ID,
        js: ['fetchInterceptor.js'],
        matches: GEMINI_MATCHES,
        world: 'MAIN',
        runAt: 'document_start',
        persistAcrossSessions: true,
      },
    ]);
    console.log('[Background] Fetch interceptor registered for MAIN world');
  } catch (error) {
    console.error('[Background] Failed to register fetch interceptor:', error);
  }
}

const MANIFEST_DEFAULT_DOMAINS = new Set(
  [
    ...(chrome.runtime.getManifest().host_permissions || []),
    ...(chrome.runtime.getManifest().content_scripts?.flatMap((c) => c.matches || []) || []),
  ]
    .map(patternToDomain)
    .filter((d): d is string => !!d),
);

function patternToDomain(pattern: string | undefined): string | null {
  if (!pattern) return null;
  try {
    const withoutScheme = pattern.replace(/^[^:]+:\/\//, '');
    const hostPart = withoutScheme.replace(/\/.*$/, '').replace(/^\*\./, '');
    return hostPart || null;
  } catch {
    return null;
  }
}

function toMatchPatterns(domain: string): string[] {
  const normalized = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/^\*\./, '');

  if (!normalized) return [];
  return [`https://*.${normalized}/*`, `http://*.${normalized}/*`];
}

function extractDomainsFromOrigins(origins?: string[]): string[] {
  if (!Array.isArray(origins)) return [];
  const domains = origins
    .map(patternToDomain)
    .filter((d): d is string => !!d)
    .filter((d) => !MANIFEST_DEFAULT_DOMAINS.has(d));
  return Array.from(new Set(domains));
}

async function filterGrantedOrigins(patterns: string[]): Promise<string[]> {
  const granted: string[] = [];

  for (const origin of patterns) {
    try {
      const hasPermission = await browser.permissions.contains({ origins: [origin] });
      if (hasPermission) {
        granted.push(origin);
      }
    } catch (error) {
      console.warn('[Background] Failed to check permission for', origin, error);
    }
  }

  return granted;
}

async function syncCustomContentScripts(domains?: string[]): Promise<void> {
  if (!chrome.scripting?.registerContentScripts) return;

  const manifestContentScript = chrome.runtime.getManifest().content_scripts?.[0];
  if (!manifestContentScript) return;

  const domainList =
    domains ??
    (
      await chrome.storage.sync.get({
        [CUSTOM_WEBSITE_KEY]: [],
      })
    )[CUSTOM_WEBSITE_KEY];

  const matchPatterns = Array.from(
    new Set((Array.isArray(domainList) ? domainList : []).flatMap(toMatchPatterns).filter(Boolean)),
  );

  const grantedMatches = await filterGrantedOrigins(matchPatterns);

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CUSTOM_CONTENT_SCRIPT_ID] });
  } catch {
    // No-op if script was not registered
  }

  if (!grantedMatches.length) return;

  const runAt =
    manifestContentScript.run_at === 'document_start'
      ? 'document_start'
      : manifestContentScript.run_at === 'document_end'
        ? 'document_end'
        : 'document_idle';

  try {
    await chrome.scripting.registerContentScripts([
      {
        id: CUSTOM_CONTENT_SCRIPT_ID,
        js: manifestContentScript.js || [],
        css: manifestContentScript.css,
        matches: grantedMatches,
        allFrames: manifestContentScript.all_frames,
        runAt,
        persistAcrossSessions: true,
      },
    ]);
    console.log('[Background] Custom content scripts registered for', grantedMatches);
  } catch (error) {
    console.error('[Background] Failed to register custom content scripts:', error);
  }
}

// Initial sync for persisted permissions
void syncCustomContentScripts();

// Initial fetch interceptor registration
void registerFetchInterceptor();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;

  if (Object.prototype.hasOwnProperty.call(changes, CUSTOM_WEBSITE_KEY)) {
    const newValue = changes[CUSTOM_WEBSITE_KEY]?.newValue;
    const domains = Array.isArray(newValue) ? newValue : [];
    void syncCustomContentScripts(domains);
  }

  // Re-register fetch interceptor when watermark remover setting changes
  if (Object.prototype.hasOwnProperty.call(changes, 'geminiWatermarkRemoverEnabled')) {
    void registerFetchInterceptor();
  }
});

chrome.permissions.onAdded.addListener(({ origins }) => {
  const domains = extractDomainsFromOrigins(origins);
  if (domains.length) {
    void browser.storage.sync
      .get({ [CUSTOM_WEBSITE_KEY]: [] })
      .then((current) => {
        const existing = Array.isArray(current[CUSTOM_WEBSITE_KEY])
          ? current[CUSTOM_WEBSITE_KEY]
          : [];
        const merged = Array.from(new Set([...existing, ...domains]));
        if (merged.length !== existing.length) {
          return browser.storage.sync.set({ [CUSTOM_WEBSITE_KEY]: merged });
        }
      })
      .catch((error) => {
        console.warn('[Background] Failed to persist domains from permissions.onAdded:', error);
      });
  }

  void syncCustomContentScripts();
});

chrome.permissions.onRemoved.addListener(() => {
  void syncCustomContentScripts();
});

/**
 * Centralized starred messages management to prevent race conditions.
 * All read-modify-write operations are serialized through this background script.
 */
class StarredMessagesManager {
  private operationQueue: Promise<unknown> = Promise.resolve();

  /**
   * Serialize all operations to prevent race conditions
   */
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const promise = this.operationQueue.then(operation, operation);
    this.operationQueue = promise.catch(() => {}); // Prevent error propagation
    return promise;
  }

  private async getFromStorage(): Promise<StarredMessagesData> {
    try {
      const result = await chrome.storage.local.get([StorageKeys.TIMELINE_STARRED_MESSAGES]);
      return result[StorageKeys.TIMELINE_STARRED_MESSAGES] || { messages: {} };
    } catch (error) {
      console.error('[Background] Failed to get starred messages:', error);
      return { messages: {} };
    }
  }

  private async saveToStorage(data: StarredMessagesData): Promise<void> {
    await chrome.storage.local.set({ [StorageKeys.TIMELINE_STARRED_MESSAGES]: data });
  }

  async addStarredMessage(message: StarredMessage): Promise<boolean> {
    return this.serialize(async () => {
      const data = await this.getFromStorage();

      if (!data.messages[message.conversationId]) {
        data.messages[message.conversationId] = [];
      }

      // Check if message already exists
      const exists = data.messages[message.conversationId].some((m) => m.turnId === message.turnId);

      if (!exists) {
        // Truncate content to save storage space
        // Popup is ~360px wide with line-clamp-2, showing ~50-60 chars max
        const MAX_CONTENT_LENGTH = 60;
        const truncatedMessage: StarredMessage = {
          ...message,
          content:
            message.content.length > MAX_CONTENT_LENGTH
              ? message.content.slice(0, MAX_CONTENT_LENGTH) + '...'
              : message.content,
        };
        data.messages[message.conversationId].push(truncatedMessage);
        await this.saveToStorage(data);
        return true;
      }
      return false;
    });
  }

  async removeStarredMessage(conversationId: string, turnId: string): Promise<boolean> {
    return this.serialize(async () => {
      const data = await this.getFromStorage();

      if (data.messages[conversationId]) {
        const initialLength = data.messages[conversationId].length;
        data.messages[conversationId] = data.messages[conversationId].filter(
          (m) => m.turnId !== turnId,
        );

        if (data.messages[conversationId].length < initialLength) {
          // Remove conversation key if no messages left
          if (data.messages[conversationId].length === 0) {
            delete data.messages[conversationId];
          }

          await this.saveToStorage(data);
          return true;
        }
      }
      return false;
    });
  }

  async getAllStarredMessages(): Promise<StarredMessagesData> {
    return this.getFromStorage();
  }

  async getStarredMessagesForConversation(conversationId: string): Promise<StarredMessage[]> {
    const data = await this.getFromStorage();
    return data.messages[conversationId] || [];
  }

  async isMessageStarred(conversationId: string, turnId: string): Promise<boolean> {
    const messages = await this.getStarredMessagesForConversation(conversationId);
    return messages.some((m) => m.turnId === turnId);
  }
}

const starredMessagesManager = new StarredMessagesManager();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      // Handle starred messages operations
      if (message && message.type && message.type.startsWith('gv.starred.')) {
        switch (message.type) {
          case 'gv.starred.add': {
            const added = await starredMessagesManager.addStarredMessage(message.payload);
            sendResponse({ ok: true, added });
            return;
          }
          case 'gv.starred.remove': {
            const removed = await starredMessagesManager.removeStarredMessage(
              message.payload.conversationId,
              message.payload.turnId,
            );
            sendResponse({ ok: true, removed });
            return;
          }
          case 'gv.starred.getAll': {
            const data = await starredMessagesManager.getAllStarredMessages();
            sendResponse({ ok: true, data });
            return;
          }
          case 'gv.starred.getForConversation': {
            const messages = await starredMessagesManager.getStarredMessagesForConversation(
              message.payload.conversationId,
            );
            sendResponse({ ok: true, messages });
            return;
          }
          case 'gv.starred.isStarred': {
            const isStarred = await starredMessagesManager.isMessageStarred(
              message.payload.conversationId,
              message.payload.turnId,
            );
            sendResponse({ ok: true, isStarred });
            return;
          }
        }
      }

      // Handle sync operations
      if (message && message.type && message.type.startsWith('gv.sync.')) {
        switch (message.type) {
          case 'gv.sync.authenticate': {
            const interactive = message.payload?.interactive !== false;
            const success = await googleDriveSyncService.authenticate(interactive);
            sendResponse({ ok: success, state: await googleDriveSyncService.getState() });
            return;
          }
          case 'gv.sync.signOut': {
            await googleDriveSyncService.signOut();
            sendResponse({ ok: true, state: await googleDriveSyncService.getState() });
            return;
          }
          case 'gv.sync.upload': {
            const { folders, prompts, interactive, platform } = message.payload as {
              folders: FolderData;
              prompts: PromptItem[];
              interactive?: boolean;
              platform?: 'gemini' | 'aistudio';
            };
            // Also get starred messages from local storage (only for Gemini platform)
            const starredData =
              platform !== 'aistudio' ? await starredMessagesManager.getAllStarredMessages() : null;
            const success = await googleDriveSyncService.upload(
              folders,
              prompts,
              starredData,
              interactive !== false,
              platform || 'gemini',
            );
            sendResponse({ ok: success, state: await googleDriveSyncService.getState() });
            return;
          }
          case 'gv.sync.download': {
            const interactive = message.payload?.interactive !== false;
            const platform = (message.payload?.platform as 'gemini' | 'aistudio') || 'gemini';
            const data = await googleDriveSyncService.download(interactive, platform);
            // NOTE: We intentionally do NOT save to storage here.
            // The caller (Popup) is responsible for merging with local data and saving.
            // This prevents data loss from overwriting local changes.
            console.log(
              `[Background] Downloaded data for ${platform}, returning to caller for merge`,
            );
            sendResponse({
              ok: true,
              data,
              state: await googleDriveSyncService.getState(),
            });
            return;
          }
          case 'gv.sync.getState': {
            sendResponse({ ok: true, state: await googleDriveSyncService.getState() });
            return;
          }
          case 'gv.sync.setMode': {
            const mode = message.payload?.mode as SyncMode;
            if (mode) {
              await googleDriveSyncService.setMode(mode);
            }
            sendResponse({ ok: true, state: await googleDriveSyncService.getState() });
            return;
          }
        }
      }

      // Handle popup opening request
      if (message && message.type === 'gv.openPopup') {
        try {
          await chrome.action.openPopup();
          sendResponse({ ok: true });
        } catch (e) {
          // Fallback: If openPopup fails, user can click the extension icon
          console.warn('[GV] Failed to open popup programmatically:', e);
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }

      // Handle sync to IDE (bypasses page CSP)
      if (message?.type === 'gv.syncToIDE') {
        const url = String(message.url || '');
        const data = message.data || [];
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            mode: 'cors',
            body: JSON.stringify(data),
          });

          if (!response.ok) {
            sendResponse({ ok: false, error: `HTTP ${response.status}` });
          } else {
            const result = await response.json();
            sendResponse({ ok: true, data: result });
          }
        } catch (e) {
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }

      // Handle check sync server status (bypasses page CSP)
      if (message?.type === 'gv.checkSyncStatus') {
        const url = String(message.url || '');
        const timeout = Number(message.timeout || 200);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
          });
          sendResponse({ ok: response.ok });
        } catch {
          sendResponse({ ok: false });
        } finally {
          clearTimeout(timeoutId);
        }
        return;
      }

      // Handle image fetch via page context (for Firefox/Safari cookie partitioning)
      // Uses chrome.scripting.executeScript in MAIN world so the page's own fetch is used,
      // which has access to the correct Google authentication cookies.
      if (message?.type === 'gv.fetchImageViaPage') {
        const url = String(message.url || '');
        const tabId = sender?.tab?.id;
        if (!tabId || !/^https?:\/\//i.test(url)) {
          sendResponse({ ok: false, error: 'invalid' });
          return;
        }
        if (!chrome.scripting?.executeScript) {
          sendResponse({ ok: false, error: 'scripting_api_unavailable' });
          return;
        }
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN' as chrome.scripting.ExecutionWorld,
            func: async (imageUrl: string) => {
              const safeFetch = async (credentials: RequestCredentials) => {
                try {
                  console.log(`[PageContext] Fetching with ${credentials}:`, imageUrl);
                  const resp = await fetch(imageUrl, { credentials });
                  if (resp.ok) return await resp.blob();
                  console.warn(`[PageContext] Fetch (${credentials}) HTTP error:`, resp.status);
                } catch (e) {
                  console.warn(`[PageContext] Fetch (${credentials}) error:`, e);
                }
                return null;
              };

              try {
                // Try with credentials first, then without (fix for Firefox CSP/CORS)
                const blob = (await safeFetch('include')) || (await safeFetch('omit'));
                if (!blob) {
                  console.error('[PageContext] All fetch attempts failed');
                  return null;
                }

                return new Promise<{
                  contentType: string;
                  base64: string;
                } | null>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const dataUrl = String(reader.result || '');
                    const commaIdx = dataUrl.indexOf(',');
                    if (commaIdx < 0) {
                      resolve(null);
                      return;
                    }
                    resolve({
                      contentType: blob.type || 'application/octet-stream',
                      base64: dataUrl.substring(commaIdx + 1),
                    });
                  };
                  reader.onerror = () => resolve(null);
                  reader.readAsDataURL(blob);
                });
              } catch {
                return null;
              }
            },
            args: [url],
          });
          const result = results?.[0]?.result as {
            contentType: string;
            base64: string;
          } | null;
          if (result?.base64) {
            sendResponse({
              ok: true,
              contentType: result.contentType,
              base64: result.base64,
              data: `data:${result.contentType};base64,${result.base64}`,
            });
          } else {
            sendResponse({ ok: false, error: 'page_fetch_failed' });
          }
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          sendResponse({ ok: false, error: errMsg });
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

      const fetchWithFallback = async (fetchUrl: string) => {
        try {
          const r1 = await fetch(fetchUrl, { credentials: 'include', redirect: 'follow' });
          if (r1.ok) return r1;
        } catch {
          /* ignore include error */
        }

        try {
          const r2 = await fetch(fetchUrl, { credentials: 'omit', redirect: 'follow' });
          return r2;
        } catch (e) {
          throw e;
        }
      };

      fetchWithFallback(url)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.blob();
        })
        .then((blob) => {
          return blob.arrayBuffer().then((ab) => {
            const b64 = arrayBufferToBase64(ab);
            const contentType = blob.type || 'image/png';
            const dataUrl = `data:${contentType};base64,${b64}`;
            sendResponse({
              ok: true,
              data: dataUrl,
              contentType,
              base64: b64,
            });
          });
        })
        .catch((err) => {
          console.error('[Background] gv.fetchImage Final failure:', err);
          sendResponse({ ok: false, error: err.message });
        });
      return;
    } catch (e) {
      try {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      } catch {}
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
