import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { getVoyagerBuildTarget } from '@/core/utils/browser';
import {
  SAFARI_CLIPBOARD_IMAGE_COPY_REQUEST,
  copySafariNativeImagePng,
} from '@/core/utils/safariNativeClipboard';
const GENERATED_UI_CAPTURE_PERMISSION_ORIGINS = ['<all_urls>'];

export function createGeneratedUiCapture(reconcile: {
  syncCustom(): Promise<void>;
  syncPlugins(): Promise<void>;
}) {
  // Generated UI screenshots are best-effort; export continues when Chrome denies capture.
  function captureVisibleTab(windowId: number): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        const error = chrome.runtime.lastError?.message;
        if (error || !dataUrl) {
          reject(new Error(error || 'capture_failed'));
          return;
        }
        resolve(dataUrl);
      });
    });
  }

  async function ensureGeneratedUiCapturePermission(): Promise<boolean> {
    if (!browser.permissions?.contains || !browser.permissions?.request) return false;
    try {
      if (
        await browser.permissions.contains({ origins: GENERATED_UI_CAPTURE_PERMISSION_ORIGINS })
      ) {
        return true;
      }
      return await browser.permissions.request({
        origins: GENERATED_UI_CAPTURE_PERMISSION_ORIGINS,
      });
    } catch (error) {
      console.warn('[Background] Generated UI screenshot permission request failed:', error);
      return false;
    }
  }

  async function cleanupLegacyGeneratedUiCapturePermission(): Promise<void> {
    const key = StorageKeys.GENERATED_UI_CAPTURE_PERMISSION_CLEANUP_DONE;
    try {
      const stored = await chrome.storage.local.get({ [key]: false });
      if (stored[key] === true || !browser.permissions?.getAll || !browser.permissions?.remove) {
        return;
      }

      const current = await browser.permissions.getAll();
      const removed = current.origins?.includes('<all_urls>')
        ? await browser.permissions.remove({ origins: GENERATED_UI_CAPTURE_PERMISSION_ORIGINS })
        : false;
      await chrome.storage.local.set({ [key]: true });

      if (removed) {
        await reconcile.syncCustom();
        await reconcile.syncPlugins();
      }
    } catch (error) {
      console.warn(
        '[Background] Failed to clean up legacy generated UI capture permission:',
        error,
      );
    }
  }

  function handle(
    message: { type: string; payload?: unknown },
    sender: chrome.runtime.MessageSender,
  ): Promise<unknown> | null {
    if (
      message.type !== 'gv.generatedUi.ensureCapturePermission' &&
      message.type !== 'gv.generatedUi.captureVisibleTab' &&
      message.type !== SAFARI_CLIPBOARD_IMAGE_COPY_REQUEST
    )
      return null;
    const payload = message.payload as { pngBase64?: unknown } | undefined;
    return (async () => {
      if (message?.type === 'gv.generatedUi.ensureCapturePermission') {
        return { ok: await ensureGeneratedUiCapturePermission() };
      }

      if (message?.type === 'gv.generatedUi.captureVisibleTab') {
        const windowId = sender.tab?.windowId;
        const senderTabId = sender.tab?.id;
        if (
          typeof windowId !== 'number' ||
          typeof senderTabId !== 'number' ||
          !chrome.tabs?.captureVisibleTab
        ) {
          return { ok: false, error: 'capture_unavailable' };
        }

        try {
          const [activeTab] = await chrome.tabs.query({ active: true, windowId });
          if (activeTab?.id !== senderTabId) {
            return { ok: false, error: 'sender_not_active' };
          }

          const dataUrl = await captureVisibleTab(windowId);
          const [activeTabAfterCapture] = await chrome.tabs.query({ active: true, windowId });
          if (activeTabAfterCapture?.id !== senderTabId) {
            return { ok: false, error: 'sender_not_active' };
          }
          return { ok: true, dataUrl };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      if (message?.type === SAFARI_CLIPBOARD_IMAGE_COPY_REQUEST) {
        const pngBase64 = typeof payload?.pngBase64 === 'string' ? payload.pngBase64 : '';
        const copied =
          getVoyagerBuildTarget() === 'safari' &&
          pngBase64.length > 0 &&
          (await copySafariNativeImagePng(pngBase64));
        return { ok: true, copied };
      }
    })();
  }
  return { handle, cleanupLegacyGeneratedUiCapturePermission };
}
