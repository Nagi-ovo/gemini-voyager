/**
 * Local Bridge owner in the background (spec §2.6, §3.1): wires the pieces,
 * runs the long poll against `voyager serve`, and answers the popup.
 *
 * Listeners are registered synchronously at worker start, as every owner here
 * does. Every handler first awaits `ready` (the session state has been read
 * back), so a message that wakes a fresh worker is judged against the stored
 * task, never against empty memory.
 *
 * The poll loop runs while the builtin is on, a pairing exists and the
 * 127.0.0.1 permission is granted. It keeps polling when the policy denies, so
 * the server can tell `voyager` callers why (`policy-denied` / `policy-stale`)
 * instead of reporting the extension offline; tasks are then refused one by
 * one. The `gv-bridge-wake` alarm restarts the loop after the worker was
 * stopped, and takes over after the unreachable-server backoff reaches 60 s.
 */
import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import { getVoyagerBuildTarget, isEdge } from '@/core/utils/browser';
import { EXTENSION_VERSION } from '@/core/utils/version';
import {
  type BridgeBrowser,
  type ErrorCode,
  OP_VERSIONS,
  bridgeError,
  type OpCapability,
  type PolicyState,
  type UpgradeSide,
} from '@/features/bridge/protocol';
import { BUNDLED_SITE_ADAPTERS } from '@/features/plugins/catalog/sites';
import {
  hostCatalogStorageKey,
  loadHostCatalogCache,
} from '@/features/plugins/remote/hostCatalogCache';
import {
  loadPluginCatalogSettings,
  savePluginCatalogSettings,
} from '@/features/plugins/remote/hostCatalogSettings';
import { isPluginEnabled } from '@/features/plugins/storage/pluginDefaults';

import { createBridgeClient } from './bridgeClient';
import { SUPPORTED_BRIDGE_OPS, createBridgeDispatcher } from './bridgeDispatcher';
import { createBridgePairing } from './bridgePairing';
import {
  BRIDGE_PLUGIN_ID,
  BRIDGE_POLICY_HOST,
  LOOPBACK_ORIGIN_PATTERN,
  type PolicyVerdict,
  createBridgePolicy,
} from './bridgePolicy';
import {
  type BridgeMessageOwner,
  type BridgeStatusData,
  createBridgeRuntimeMessageHandler,
} from './bridgeRuntimeMessages';
import { type TabsApi, createBridgeTabs } from './bridgeTabs';
import { type StorageAreaLike, createBridgeTaskStore, createMemoryArea } from './bridgeTaskStore';
import { type LeaseProbeOutcome, createPageLeaseArbiter } from './pageLease';

export const BRIDGE_WAKE_ALARM = 'gv-bridge-wake';
const BACKOFF_START_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;

export interface BridgeOwnerEnv {
  readonly session: StorageAreaLike;
  readonly local: StorageAreaLike;
  readonly tabs: TabsApi;
  readonly fetch: typeof fetch;
  readonly hasOrigin: (pattern: string) => Promise<boolean>;
  readonly refreshCatalog: () => Promise<unknown>;
  readonly loadOnlineUpdatesEnabled: () => Promise<boolean>;
  /** Write the "plugin online updates" switch the catalog refresher obeys. */
  readonly saveOnlineUpdatesEnabled: (enabled: boolean) => Promise<void>;
  readonly alarms?: {
    get(name: string): Promise<unknown>;
    create(name: string, info: { periodInMinutes: number }): Promise<void> | void;
    clear(name: string): Promise<unknown>;
  };
  readonly browser: BridgeBrowser;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface BridgeOwner {
  readonly handleMessage: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
  ) => Promise<unknown> | null;
  /** Start the poll loop when its conditions hold (alarm, startup, grants). */
  wake(): Promise<void>;
  onAlarm(name: string): void;
  onStorageChanged(changes: Record<string, chrome.storage.StorageChange>, area: string): void;
  onPermissionsAdded(origins: readonly string[] | undefined): void;
  onPermissionsRemoved(): void;
  onTabRemoved(tabId: number): void;
  /** Resolves when the current poll loop has exited (tests). */
  idle(): Promise<void>;
}

const policyLabel = (verdict: PolicyVerdict): PolicyState =>
  verdict.state === 'allowed' ? 'allowed' : verdict.code === 'policy-stale' ? 'stale' : 'denied';

function isUpgradeSide(value: unknown): value is UpgradeSide {
  return value === 'extension' || value === 'cli';
}

export function createBridgeOwner(env: BridgeOwnerEnv): BridgeOwner {
  const now = env.now ?? (() => Date.now());
  const sleep = env.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const store = createBridgeTaskStore({ session: env.session, local: env.local });
  const client = createBridgeClient(env.fetch);
  const tabs = createBridgeTabs({ store, api: env.tabs, now });
  // Hydrate: read the session state back before any handler acts on it.
  const ready = Promise.all([store.getTask(), store.getTab()]).then(
    () => undefined,
    (error: unknown) => logger.warn('Bridge session state unreadable', { error: String(error) }),
  );
  const awaitReady = () => ready;

  const probe = async (lease: { tabId: number; leaseId: string; documentId?: string }) => {
    if (!(await tabs.exists(lease.tabId))) return 'gone' satisfies LeaseProbeOutcome;
    try {
      const reply = await env.tabs.sendMessage(
        lease.tabId,
        { type: 'gv.bridge.lease.probe', leaseId: lease.leaseId },
        lease.documentId ? { documentId: lease.documentId } : undefined,
      );
      const stopped = (reply as { stopped?: unknown } | undefined)?.stopped;
      if (typeof stopped !== 'boolean') return 'no-answer';
      return stopped ? 'stopped' : 'running';
    } catch {
      // No receiver: the document is gone, or its bridge runtime (and every leased op) ended.
      return 'gone';
    }
  };
  const lease = createPageLeaseArbiter({ area: env.session, ready: awaitReady, probe, now });
  const policy = createBridgePolicy({
    local: env.local,
    loadEntry: () => loadHostCatalogCache(BRIDGE_POLICY_HOST),
    packaged: BUNDLED_SITE_ADAPTERS.find((site) => site.id === 'chatgpt') ?? null,
    extensionVersion: EXTENSION_VERSION,
    hasOrigin: env.hasOrigin,
    refreshCatalog: env.refreshCatalog,
    loadOnlineUpdatesEnabled: env.loadOnlineUpdatesEnabled,
    now,
  });

  let server: BridgeStatusData['server'] = 'unknown';
  let lastPollAt: number | undefined;
  let lastError: BridgeStatusData['lastError'];
  const noteError = (error: {
    readonly code: ErrorCode;
    readonly details?: Readonly<Record<string, unknown>>;
  }) => {
    const upgrade = error.details?.upgrade;
    lastError = isUpgradeSide(upgrade) ? { code: error.code, upgrade } : { code: error.code };
  };

  const pairing = createBridgePairing({
    local: env.local,
    session: env.session,
    client,
    browser: env.browser,
    hasLoopbackPermission: () => env.hasOrigin(LOOPBACK_ORIGIN_PATTERN).catch(() => false),
    onPaired: () => {
      lastError = undefined;
      void policy.refresh().then(() => wake());
    },
    now,
  });
  const connection = () => pairing.load();
  const dispatcher = createBridgeDispatcher({
    store,
    lease,
    policy,
    tabs,
    client,
    connection,
    ready: awaitReady,
    now,
  });

  let loopGeneration = 0;
  let loop: Promise<void> | null = null;
  let loopRunsGeneration = -1;
  let pollAbort: AbortController | null = null;

  const ensureAlarm = async () => {
    try {
      if (env.alarms && !(await env.alarms.get(BRIDGE_WAKE_ALARM))) {
        await env.alarms.create(BRIDGE_WAKE_ALARM, { periodInMinutes: 1 });
      }
    } catch {
      // Without the alarm the loop still runs; it only cannot restart a stopped worker.
    }
  };
  const clearAlarm = () => void env.alarms?.clear(BRIDGE_WAKE_ALARM)?.catch(() => undefined);

  const stop = () => {
    loopGeneration += 1;
    pollAbort?.abort();
  };

  const runLoop = async (generation: number): Promise<void> => {
    await ready;
    let backoff = 0;
    while (generation === loopGeneration) {
      const record = await pairing.load();
      if (!record) return;
      const gate = await policy.status();
      if (!gate.enabled || !gate.permissions.loopback) return;
      await ensureAlarm();
      await dispatcher.drainOutbox();
      const verdict = gate.verdict;
      const allowed = verdict.state === 'allowed' ? verdict.allow : [];
      const ops: OpCapability[] = gate.permissions.chatgpt
        ? [...SUPPORTED_BRIDGE_OPS]
            .filter((op) => allowed.includes(op))
            .map((name) => ({ name, v: OP_VERSIONS[name] }))
        : [];
      pollAbort = new AbortController();
      const reply = await client.poll(
        record,
        {
          capabilities: { ops },
          inflight: await dispatcher.inflight(),
          policy: { revision: verdict.revision ?? 0, state: policyLabel(verdict) },
        },
        pollAbort.signal,
      );
      pollAbort = null;
      if (generation !== loopGeneration) return;
      if (!reply.ok) {
        if (reply.error.code === 'cancelled') return;
        noteError(reply.error);
        if (reply.error.code !== 'server-unreachable') {
          server = 'online';
          return; // unauthorized or protocol-mismatch: wait for the person
        }
        server = 'offline';
        backoff = backoff === 0 ? BACKOFF_START_MS : backoff * 2;
        if (backoff > BACKOFF_MAX_MS) return; // the wake alarm takes over
        await sleep(backoff);
        continue;
      }
      server = 'online';
      lastPollAt = now();
      lastError = undefined;
      backoff = 0;
      const message = reply.data;
      if (!message) continue;
      if (message.kind === 'unpaired') {
        await dispatcher.stopCurrent('not-paired', 'voyager serve dropped this pairing.');
        await pairing.forget();
        return;
      }
      if (message.kind === 'abort') await dispatcher.onAbort(message.taskId, message.reason);
      else await dispatcher.onTask(message.task);
    }
  };

  const wake = async (): Promise<void> => {
    // A loop told to stop may still be finishing its poll; start the next one after it.
    if (loop && loopRunsGeneration !== loopGeneration) return loop.then(() => wake());
    if (loop) return loop;
    const generation = loopGeneration;
    loopRunsGeneration = generation;
    loop = runLoop(generation)
      .catch((error: unknown) => logger.warn('Bridge poll loop stopped', { error: String(error) }))
      .finally(() => {
        loop = null;
      });
    return loop;
  };

  const shutDown = async (code: 'bridge-disabled' | 'not-paired', message: string) => {
    stop();
    clearAlarm();
    await dispatcher.stopCurrent(code, message);
  };

  const status = async (): Promise<BridgeStatusData> => {
    const [record, gate, task] = await Promise.all([
      pairing.load(),
      policy.status(),
      dispatcher.current(),
    ]);
    return {
      permission: gate.permissions.loopback,
      paired: record
        ? { serverId: record.serverId, port: record.port, pairedAt: record.pairedAt }
        : null,
      server: record ? server : 'unknown',
      ...(lastPollAt !== undefined ? { lastPollAt } : {}),
      policy: policyLabel(gate.verdict),
      onlineUpdatesEnabled: gate.onlineUpdatesEnabled,
      ...(task ? { activeTask: { jobId: task.jobId, op: task.op } } : {}),
      ...(lastError ? { lastError } : {}),
    };
  };

  const pairReply = (attempt: ReturnType<typeof pairing.lastAttempt>) => {
    if (attempt.state === 'failed') {
      noteError(attempt.error);
      return { ok: false as const, error: attempt.error };
    }
    return { ok: true as const, data: { pending: attempt.state === 'pending' } };
  };

  const messageOwner: BridgeMessageOwner = {
    status: async () => {
      try {
        return { ok: true, data: await status() };
      } catch (error) {
        logger.warn('Bridge status failed', { error: String(error) });
        return {
          ok: true,
          data: {
            permission: false,
            paired: null,
            server: 'unknown',
            policy: 'unknown',
            onlineUpdatesEnabled: true,
          },
        };
      }
    },
    pairIntent: async (port, code) => pairReply(await pairing.recordIntent({ port, code })),
    pair: async (port, code) => {
      const attempt = await pairing.pair({ port, code });
      if (attempt.state !== 'paired') return pairReply(attempt);
      const record = await pairing.load();
      return { ok: true, data: record ? { serverId: record.serverId } : {} };
    },
    unpair: async () => {
      await shutDown('not-paired', 'The bridge was unpaired.');
      await pairing.unpair();
      lastError = undefined;
      return { ok: true, data: { unpaired: true } };
    },
    enableRefresh: async () => {
      // The refresher obeys the switch, so it has to be on before the check can run.
      try {
        await env.saveOnlineUpdatesEnabled(true);
      } catch (error) {
        logger.warn('Bridge could not turn on online plugin updates', { error: String(error) });
        return {
          ok: false,
          error: bridgeError('policy-stale', 'Online plugin updates could not be turned on.'),
        };
      }
      await policy.refresh();
      void wake();
      return { ok: true, data: { policy: policyLabel((await policy.status()).verdict) } };
    },
    hello: (sender, docNonce) => dispatcher.onHello(sender, docNonce),
    progress: (sender, message) => dispatcher.onProgress(sender, message),
    done: (sender, message) => dispatcher.onDone(sender, message),
  };

  const catalogKey = hostCatalogStorageKey(BRIDGE_POLICY_HOST);
  const enabledIn = (value: unknown): boolean =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? isPluginEnabled(value as Record<string, { enabled?: unknown }>, BRIDGE_PLUGIN_ID)
      : isPluginEnabled({}, BRIDGE_PLUGIN_ID);

  return {
    handleMessage: createBridgeRuntimeMessageHandler(messageOwner),
    wake,
    onAlarm: (name) => {
      if (name !== BRIDGE_WAKE_ALARM) return;
      void dispatcher.tick().catch(() => undefined);
      void wake();
    },
    onStorageChanged: (changes, area) => {
      if (area !== 'local') return;
      const state = changes[StorageKeys.PLUGINS_STATE];
      if (state) {
        const was = enabledIn(state.oldValue);
        const is = enabledIn(state.newValue);
        if (!was && is) void policy.refresh().then(() => wake());
        if (was && !is) void shutDown('bridge-disabled', 'The ChatGPT bridge was turned off.');
      }
      const paired = changes[StorageKeys.BRIDGE_PAIRING];
      if (paired && paired.newValue === undefined) {
        void shutDown('not-paired', 'The bridge was unpaired.');
      } else if (paired) {
        void wake();
      }
      if (changes[catalogKey]) void dispatcher.recheckPolicy();
    },
    onPermissionsAdded: (origins) => {
      if (origins?.includes(LOOPBACK_ORIGIN_PATTERN)) {
        void pairing.completeIntent().then(() => wake());
      } else {
        void wake();
      }
    },
    onPermissionsRemoved: () => {
      void dispatcher.recheckPolicy();
      void env.hasOrigin(LOOPBACK_ORIGIN_PATTERN).then((granted) => {
        if (!granted) stop();
      });
    },
    onTabRemoved: (tabId) => void dispatcher.onTabRemoved(tabId),
    idle: async () => {
      await loop;
    },
  };
}

function chromeArea(area: chrome.storage.StorageArea | undefined): StorageAreaLike | null {
  if (!area?.get) return null;
  return {
    get: async (keys) => ((await area.get(keys)) ?? {}) as Record<string, unknown>,
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys),
  };
}

function detectBrowser(): BridgeBrowser {
  if (getVoyagerBuildTarget() === 'firefox') return 'firefox';
  return isEdge() ? 'edge' : 'chrome';
}

/**
 * Register the bridge's listeners synchronously and return its runtime-message
 * handler. Safari has no bridge in v1: the handler then only tells the popup so.
 */
export function startBridgeOwner(options: {
  readonly refreshCatalog: (host: string) => Promise<unknown>;
}): BridgeOwner['handleMessage'] {
  if (getVoyagerBuildTarget() === 'safari') return createBridgeRuntimeMessageHandler(null);
  const local = chromeArea(chrome.storage?.local);
  if (!local) return createBridgeRuntimeMessageHandler(null);
  const owner = createBridgeOwner({
    session: chromeArea(chrome.storage?.session) ?? createMemoryArea(),
    local,
    tabs: {
      create: (props) => chrome.tabs.create(props),
      remove: (tabId) => chrome.tabs.remove(tabId),
      get: (tabId) => chrome.tabs.get(tabId),
      sendMessage: (tabId, message, sendOptions) =>
        sendOptions
          ? chrome.tabs.sendMessage(tabId, message, sendOptions)
          : chrome.tabs.sendMessage(tabId, message),
    },
    fetch: (...args) => fetch(...args),
    hasOrigin: async (pattern) =>
      (await chrome.permissions?.contains({ origins: [pattern] })) === true,
    refreshCatalog: () => options.refreshCatalog(BRIDGE_POLICY_HOST),
    loadOnlineUpdatesEnabled: async () => (await loadPluginCatalogSettings()).onlineUpdatesEnabled,
    saveOnlineUpdatesEnabled: (enabled) =>
      savePluginCatalogSettings({ onlineUpdatesEnabled: enabled }),
    alarms: chrome.alarms
      ? {
          get: (name) => chrome.alarms.get(name),
          create: (name, info) => chrome.alarms.create(name, info),
          clear: (name) => chrome.alarms.clear(name),
        }
      : undefined,
    browser: detectBrowser(),
  });
  chrome.alarms?.onAlarm?.addListener((alarm) => owner.onAlarm(alarm.name));
  chrome.tabs?.onRemoved?.addListener((tabId) => owner.onTabRemoved(tabId));
  chrome.storage?.onChanged?.addListener((changes, area) => owner.onStorageChanged(changes, area));
  chrome.permissions?.onAdded?.addListener((permissions) =>
    owner.onPermissionsAdded(permissions.origins),
  );
  chrome.permissions?.onRemoved?.addListener(() => owner.onPermissionsRemoved());
  chrome.runtime?.onStartup?.addListener(() => void owner.wake());
  chrome.runtime?.onInstalled?.addListener(() => void owner.wake());
  void owner.wake();
  return owner.handleMessage;
}
