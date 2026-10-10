import { afterEach, describe, expect, it, vi } from 'vitest';

// Keep the real startup owners; only browser I/O is replaced.
vi.mock('webextension-polyfill', () => ({ default: chrome }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('MV3 background startup', () => {
  it.each([false, true])(
    'registers every browser event before pending startup I/O completes (dev auto-reload: %s)',
    async (devAutoReload) => {
      vi.resetModules();
      vi.stubEnv('VOYAGER_BUILD_TARGET', 'chrome');
      vi.stubEnv('VOYAGER_DEV_AUTO_RELOAD', devAutoReload ? 'true' : '');
      let release!: () => void;
      const startup = new Promise<void>((resolve) => {
        release = resolve;
      });
      let pendingReads = 0;
      let completedReads = 0;
      const read = vi.fn(async (keys: unknown) => {
        pendingReads++;
        await startup;
        pendingReads--;
        completedReads++;
        return keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
      });
      const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
      const events = {
        message: event(),
        installed: event(),
        browserStartup: event(),
        storage: event(),
        permissionAdded: event(),
        permissionRemoved: event(),
        notificationClick: event(),
        alarm: event(),
        tabRemoved: event(),
      };
      vi.stubGlobal('chrome', {
        ...chrome,
        runtime: {
          ...chrome.runtime,
          getManifest: () => ({ permissions: [], host_permissions: [], content_scripts: [] }),
          onMessage: events.message,
          onInstalled: events.installed,
          onStartup: events.browserStartup,
        },
        storage: {
          ...chrome.storage,
          local: { ...chrome.storage.local, get: read },
          sync: { ...chrome.storage.sync, get: read },
          session: { get: read, set: vi.fn(), remove: vi.fn() },
          onChanged: events.storage,
        },
        permissions: {
          contains: vi.fn(async () => false),
          getAll: vi.fn(async () => ({ origins: [] })),
          onAdded: events.permissionAdded,
          onRemoved: events.permissionRemoved,
        },
        notifications: { ...chrome.notifications, onClicked: events.notificationClick },
        alarms: {
          ...chrome.alarms,
          create: vi.fn(async () => {
            await startup;
          }),
          onAlarm: events.alarm,
        },
        tabs: { ...chrome.tabs, onRemoved: events.tabRemoved },
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          await startup;
          return new Response('', { status: 404 });
        }),
      );

      try {
        await import('../index');
        expect(pendingReads).toBeGreaterThan(0);
        expect(completedReads).toBe(0);
        const registrations = Object.values(events).map(({ addListener }) => {
          expect(addListener).toHaveBeenCalledWith(expect.any(Function));
          return [...addListener.mock.calls];
        });

        release();
        await vi.waitFor(() => expect(pendingReads).toBe(0));
        // Let continuations behind the held reads run, including a mistakenly deferred listener.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(completedReads).toBeGreaterThan(0);
        expect(Object.values(events).map(({ addListener }) => addListener.mock.calls)).toEqual(
          registrations,
        );
      } finally {
        release();
      }
    },
  );
});
