import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { createGeneratedUiCapture } from '../generatedUiCapture';

const permissions = vi.hoisted(() => ({
  contains: vi.fn(),
  request: vi.fn(),
  getAll: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('webextension-polyfill', () => ({ default: { permissions } }));

const query = vi.fn<(query: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>>();
const capture =
  vi.fn<
    (windowId: number, options: { format: string }, callback: (dataUrl: string) => void) => void
  >();
const sender: chrome.runtime.MessageSender = {
  tab: { id: 7, windowId: 3 } as chrome.tabs.Tab,
};
const message = { type: 'gv.generatedUi.captureVisibleTab' };
const screenshot = 'data:image/png;base64,AQID';
const active = { id: 7 } as chrome.tabs.Tab;
const other = { id: 8 } as chrome.tabs.Tab;

beforeEach(() => {
  vi.clearAllMocks();
  query.mockReset();
  capture.mockReset();
  vi.stubGlobal('chrome', {
    ...chrome,
    tabs: { ...chrome.tabs, query, captureVisibleTab: capture },
  });
  capture.mockImplementation((_window, _options, callback) => callback(screenshot));
});
afterEach(() => vi.unstubAllGlobals());

function owner() {
  return createGeneratedUiCapture({ syncCustom: vi.fn(), syncPlugins: vi.fn() });
}

describe('generated UI capture authorization and active-tab ownership', () => {
  it('does not capture an inactive sender', async () => {
    query.mockResolvedValue([other]);
    expect(await owner().handle(message, sender)).toEqual({
      ok: false,
      error: 'sender_not_active',
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it('discards a capture when the active tab changed while capture was in flight', async () => {
    query.mockResolvedValueOnce([active]).mockResolvedValueOnce([other]);
    expect(await owner().handle(message, sender)).toEqual({
      ok: false,
      error: 'sender_not_active',
    });
    expect(capture).toHaveBeenCalledOnce();
    expect(query.mock.calls).toEqual([
      [{ active: true, windowId: 3 }],
      [{ active: true, windowId: 3 }],
    ]);
  });

  it('returns the screenshot only when the sender owns the active tab before and after capture', async () => {
    query.mockResolvedValue([active]);
    expect(await owner().handle(message, sender)).toEqual({ ok: true, dataUrl: screenshot });
    expect(capture).toHaveBeenCalledWith(3, { format: 'png' }, expect.any(Function));
  });

  it('reports capture unavailable when a popup has no source tab', async () => {
    expect(await owner().handle(message, {})).toEqual({ ok: false, error: 'capture_unavailable' });
    expect(query).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it('uses an existing optional grant without prompting again', async () => {
    permissions.contains.mockResolvedValue(true);
    expect(await owner().handle({ type: 'gv.generatedUi.ensureCapturePermission' }, {})).toEqual({
      ok: true,
    });
    expect(permissions.contains).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'reports the actual result of the optional permission prompt: %s',
    async (granted) => {
      permissions.contains.mockResolvedValue(false);
      permissions.request.mockResolvedValue(granted);
      expect(await owner().handle({ type: 'gv.generatedUi.ensureCapturePermission' }, {})).toEqual({
        ok: granted,
      });
      expect(permissions.request).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
    },
  );

  it('removes a legacy broad grant once, marks cleanup, then repairs custom and plugin registrations in order', async () => {
    const key = StorageKeys.GENERATED_UI_CAPTURE_PERMISSION_CLEANUP_DONE;
    const events: string[] = [];
    let done = false;
    vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({ [key]: done }));
    vi.mocked(chrome.storage.local.set).mockImplementation(async (items) => {
      done = (items as Record<string, unknown>)[key] === true;
      events.push('marked');
    });
    permissions.getAll.mockResolvedValue({ origins: ['<all_urls>'] });
    permissions.remove.mockImplementation(async () => {
      events.push('removed');
      return true;
    });
    const service = createGeneratedUiCapture({
      syncCustom: async () => {
        events.push('custom');
      },
      syncPlugins: async () => {
        events.push('plugins');
      },
    });
    await service.cleanupLegacyGeneratedUiCapturePermission();
    await service.cleanupLegacyGeneratedUiCapturePermission();
    expect(events).toEqual(['removed', 'marked', 'custom', 'plugins']);
    expect(permissions.remove).toHaveBeenCalledWith({ origins: ['<all_urls>'] });
    expect(permissions.remove).toHaveBeenCalledOnce();
  });
});
