/** Shared setup of the owner tests: an owner over in-memory storage, tabs and a scripted serve. */
import { vi } from 'vitest';

import type { HostCatalogRefreshResult } from '@/features/plugins/remote/hostCatalogRefresh';

import { createBridgeOwner } from '../bridgeOwner';
import { fakeTabs, testArea } from './bridgeTestKit';

export const TOKEN = 'A'.repeat(43);
export const PAIRING = { serverId: 'srv1', port: 47321, token: TOKEN, pairedAt: 1, protocol: 1 };
export const READ = { markdown: 'OK', turnKey: 't-8', textSha256: '0'.repeat(64), files: [] };

export const popup = {
  id: chrome.runtime.id,
  url: chrome.runtime.getURL('src/pages/popup/index.html'),
} as chrome.runtime.MessageSender;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function setup(
  options: {
    session?: Record<string, unknown>;
    local?: Record<string, unknown>;
    onlineUpdatesEnabled?: boolean;
  } = {},
) {
  const session = testArea(options.session);
  const local = testArea(options.local);
  const page = fakeTabs();
  const origins = new Set<string>(['https://chatgpt.com/*']);
  const routes: Record<string, (body: unknown) => Response | Promise<Response>> = {
    '/v1/hello': () =>
      json({
        ok: true,
        data: {
          serverId: 'srv1',
          serverVersion: '0.1.0',
          protocol: { min: 1, max: 1, selected: 1 },
          paired: false,
        },
      }),
    '/v1/pair': () => json({ ok: true, data: { token: TOKEN, serverId: 'srv1' } }),
  };
  const requests: {
    path: string;
    port: number;
    body: unknown;
    headers: Record<string, string>;
  }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    const path = parsed.pathname;
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    requests.push({
      path,
      port: Number(parsed.port),
      body,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const route = routes[path];
    return route ? route(body) : json({ ok: true, data: {} });
  });
  const settings = { onlineUpdatesEnabled: options.onlineUpdatesEnabled ?? true };
  /** What the online-update switch read when each catalog check ran. */
  const refreshes: boolean[] = [];
  const catalog = {
    refreshNow: vi.fn(async (_host: string): Promise<HostCatalogRefreshResult> => ({
      ok: true,
      status: 'unchanged',
      checkedAt: 5,
    })),
  };
  const owner = createBridgeOwner({
    session,
    local,
    tabs: page.api,
    fetch: fetchImpl as unknown as typeof fetch,
    hasOrigin: async (pattern) => origins.has(pattern),
    refreshCatalog: async () => {
      refreshes.push(settings.onlineUpdatesEnabled);
    },
    refreshCatalogNow: (host) => catalog.refreshNow(host),
    loadOnlineUpdatesEnabled: async () => settings.onlineUpdatesEnabled,
    saveOnlineUpdatesEnabled: async (enabled) => {
      settings.onlineUpdatesEnabled = enabled;
    },
    alarms: { get: async () => undefined, create: vi.fn(), clear: vi.fn(async () => true) },
    browser: 'chrome',
    sleep: async () => {},
  });
  const send = async (message: Record<string, unknown>, sender = popup) =>
    (await owner.handleMessage(message, sender)) as Record<string, unknown>;
  return {
    session,
    local,
    page,
    origins,
    routes,
    requests,
    owner,
    send,
    settings,
    refreshes,
    catalog,
  };
}
