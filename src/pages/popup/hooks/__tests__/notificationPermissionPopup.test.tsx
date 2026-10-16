import React, { act, useEffect, useState } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { NotificationEnablementPayload } from '@/core/utils/notificationEnablement';
import { createNotificationEnablement } from '@/pages/background/notificationEnablement';

import { type GeneralPopupSettings, useGeneralPopupSettings } from '../useGeneralPopupSettings';

const api = vi.hoisted(() => ({
  runtime: {
    id: 'test-extension-id',
    getURL: (path: string) => `chrome-extension://test-extension-id/${path}`,
    sendMessage: vi.fn(),
  },
  permissions: {
    contains: vi.fn(),
    request: vi.fn(),
    onAdded: { addListener: vi.fn() },
  },
  storage: {
    local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    sync: { get: vi.fn(), set: vi.fn() },
    onChanged: { addListener: vi.fn() },
  },
}));
vi.mock('webextension-polyfill', () => ({ default: api }));

const NOTIFICATION_KEY = StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED;

function Harness({
  capture,
  storedRead,
}: {
  capture: (settings: GeneralPopupSettings) => void;
  /** The popup snapshot's first reading of the switch. */
  storedRead?: Promise<Record<string, unknown>>;
}) {
  const [stored, setStored] = useState<boolean | undefined>(undefined);
  const settings = useGeneralPopupSettings({
    isSafariBrowser: false,
    canUseSystemNotifications: true,
    writeSyncStorage: (payload) => api.storage.sync.set(payload),
    storedResponseNotification: stored,
  });
  useEffect(() => {
    capture(settings);
  }, [capture, settings]);
  useEffect(() => {
    let active = true;
    void (storedRead ?? api.storage.sync.get([NOTIFICATION_KEY])).then(
      (raw: Record<string, unknown>) => {
        if (active) setStored(raw[NOTIFICATION_KEY] === true);
      },
    );
    return () => {
      active = false;
    };
  }, [storedRead]);
  return null;
}

let root: Root | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root?.unmount());
  container.remove();
});

it('enables completion notifications after Allow closes the popup without a second click', async () => {
  const events: string[] = [];
  const local: Record<string, unknown> = {};
  const sync: Record<string, unknown> = {
    [StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED]: false,
  };
  const grantListeners = new Set<(grant: { permissions: string[] }) => void>();
  const storageListeners = new Set<Parameters<typeof chrome.storage.onChanged.addListener>[0]>();
  let permissionGranted = false;
  let resolvePermission!: (granted: boolean) => void;
  const read = (items: Record<string, unknown>, keys: unknown) => {
    if (typeof keys === 'string') return { [keys]: items[keys] };
    if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, items[key]]));
    return { ...(keys && typeof keys === 'object' ? keys : {}), ...items };
  };
  api.storage.local.get.mockImplementation(async (keys: unknown) => read(local, keys));
  api.storage.sync.get.mockImplementation(async (keys: unknown) => read(sync, keys));
  for (const [area, items] of [
    ['local', local],
    ['sync', sync],
  ] as const) {
    api.storage[area].set.mockImplementation(async (payload: Record<string, unknown>) => {
      const changes = Object.fromEntries(
        Object.entries(payload)
          .filter(([key, newValue]) => JSON.stringify(items[key]) !== JSON.stringify(newValue))
          .map(([key, newValue]) => [key, { oldValue: items[key], newValue }]),
      );
      Object.assign(items, payload);
      if (area === 'sync')
        events.push(`sync:${String(payload[StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED])}`);
      if (Object.keys(changes).length > 0) {
        for (const listener of storageListeners) listener(changes, area);
      }
    });
  }
  api.storage.local.remove.mockImplementation(async (key: string) => {
    if (!Object.hasOwn(local, key)) return;
    const changes = { [key]: { oldValue: local[key] } };
    delete local[key];
    for (const listener of storageListeners) listener(changes, 'local');
  });
  api.storage.onChanged.addListener.mockImplementation((listener) =>
    storageListeners.add(listener),
  );
  vi.mocked(chrome.storage.onChanged.addListener).mockImplementation((listener) => {
    storageListeners.add(listener);
  });
  vi.mocked(chrome.storage.onChanged.removeListener).mockImplementation((listener) => {
    storageListeners.delete(listener);
  });
  api.permissions.onAdded.addListener.mockImplementation((listener) =>
    grantListeners.add(listener),
  );
  api.permissions.contains.mockImplementation(async () => permissionGranted);
  // The permission response belongs to the destroyed popup context; only onAdded reaches the worker.
  api.permissions.request.mockImplementation(() => {
    events.push('permission-request');
    return new Promise<boolean>((resolve) => {
      resolvePermission = resolve;
    });
  });
  const owner = createNotificationEnablement();
  owner.registerListeners();
  const dispatch = (message: { type: string; payload: NotificationEnablementPayload }) => {
    events.push(`message:${message.payload.action}`);
    return owner.handle(message, {
      id: api.runtime.id,
      url: api.runtime.getURL('popup.html'),
    });
  };
  api.runtime.sendMessage.mockImplementation(dispatch);
  const settle = async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  };
  let settings!: GeneralPopupSettings;
  await act(async () => root!.render(<Harness capture={(value) => (settings = value)} />));
  await act(async () => {
    settings.responseNotification.setEnabled(true);
    await settle();
  });
  expect(api.permissions.request).toHaveBeenCalledOnce();
  expect(sync[StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED]).toBe(false);
  events.push('popup-unmount');
  act(() => root!.unmount());
  root = undefined;
  // The reopening popup starts its read before the worker observes Allow.
  const olderBulkSnapshot = await api.storage.sync.get([NOTIFICATION_KEY]);
  events.push(
    `bulk-read:${String(olderBulkSnapshot[StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED])}`,
  );
  let deliverBulk!: () => void;
  const heldBulk = new Promise<Record<string, unknown>>((resolve) => {
    deliverBulk = () => resolve(olderBulkSnapshot);
  });
  permissionGranted = true;
  events.push('permission-grant');
  for (const listener of grantListeners) listener({ permissions: ['notifications'] });
  await settle();

  expect(sync[StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED], events.join(' → ')).toBe(true);
  expect(api.storage.sync.set).toHaveBeenCalledExactlyOnceWith({
    [StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED]: true,
  });
  // A promise that does survive teardown must not send a second completion from the old UI.
  await act(async () => resolvePermission(true));
  expect(events).not.toContain('message:finish');
  root = createRoot(container);
  await act(async () =>
    root!.render(<Harness storedRead={heldBulk} capture={(value) => (settings = value)} />),
  );
  events.push('bulk-delivery:false');
  await act(async () => deliverBulk());
  expect(settings.responseNotification.enabled, events.join(' → ')).toBe(true);
  expect(api.permissions.request).toHaveBeenCalledOnce();

  act(() => root!.unmount());
  root = undefined;
  expect(storageListeners.size).toBe(1); // Only the persistent background owner remains.
});
