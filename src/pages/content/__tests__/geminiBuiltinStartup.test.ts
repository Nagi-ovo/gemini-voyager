/**
 * The content script's page lifetime and the Gemini builtin start point, wired
 * as `index.tsx` wires them: a cleanup manager that page teardown runs, a page
 * lifetime that only retirement by a newer copy aborts, and a storage router
 * feeding the start point. Fork and the research pack are counters behind the
 * real toggle controllers; the markdown patcher is the real module.
 */
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CleanupPositions } from '@/core/types/cleanupPositions';
import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import {
  FEATURE_OWNERS,
  type FeatureOwner,
  OFFICIAL_PLUGIN_IDS,
  type OwnedFeatureId,
} from '@/features/plugins/sites/featureOwners';

import { claimContentScript } from '../contentScriptHandoff';
import {
  type NativeFeature,
  createNativeFeatureToggle,
  mountNativeFeature,
} from '../featureLifecycle';
import { ForkNodesService } from '../fork/ForkNodesService';
import { handoffPendingForkLink } from '../fork/linkFinisher';
import { captureForkReceiver } from '../fork/receiverIdentity';
import { type GeminiBuiltinStartup, createGeminiBuiltinStartup } from '../geminiBuiltinStartup';
import { NATIVE_FEATURES } from '../nativeFeatures';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

const native = vi.hoisted(() => ({
  starts: {} as Record<string, number>,
  live: {} as Record<string, number>,
}));

function counter(name: string): () => () => void {
  return () => {
    native.starts[name] = (native.starts[name] ?? 0) + 1;
    native.live[name] = (native.live[name] ?? 0) + 1;
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      native.live[name] -= 1;
    };
  };
}

vi.mock('../fork/index', () => ({ startFork: () => counter('fork')() }));
vi.mock('../defaultModel/modelLocker', () => ({
  startDefaultModelNative: () => counter('defaultModel')(),
}));
vi.mock('../responseNotification/index', () => ({
  createResponseNotificationRun: () => ({
    stop: counter('responseNotification')(),
    ready: Promise.resolve(),
  }),
}));
vi.mock('../researchPack/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../researchPack/index')>()),
  startResearchPack: () => counter('researchPack')(),
}));

/** The shipped owner table with the given Gemini features moved to `owner`, and its reader. */
function ownedBy(
  owner: FeatureOwner,
  features: readonly OwnedFeatureId[],
  nativeFeatures: readonly OwnedFeatureId[] = [],
) {
  const owners = FEATURE_OWNERS.map((entry) =>
    entry.site === 'gemini' && nativeFeatures.includes(entry.feature)
      ? { ...entry, owner: 'legacy' as const }
      : entry.site === 'gemini' && features.includes(entry.feature)
        ? { ...entry, owner }
        : entry,
  );
  return {
    admission: createOfficialAdmission(owners),
    ownerOf: (_site: string, feature: OwnedFeatureId): FeatureOwner =>
      owners.find((entry) => entry.site === 'gemini' && entry.feature === feature)?.owner ??
      'legacy',
  };
}

const FORK = StorageKeys.FORK_ENABLED;
const RESEARCH_PACK = StorageKeys.RESEARCH_PACK_ENABLED;

type Changes = Record<string, { newValue?: unknown }>;

interface Page {
  readonly cleanupManager: CleanupManager;
  readonly lifetime: AbortController;
  /** What `beforeunload` runs: the cleanups, without retiring the page. */
  unload(): void;
  /** A re-injected copy claims the page and retires this one, as `index.tsx` retires. */
  retire(): void;
}

let harness: LifecycleHarness;
let teardowns: Array<() => void> = [];

function page(): Page {
  const cleanupManager = new CleanupManager();
  const lifetime = new AbortController();
  teardowns.push(() => cleanupManager.executeCleanups());
  teardowns.push(
    claimContentScript(
      () => {
        lifetime.abort();
        cleanupManager.executeCleanups();
      },
      () => true,
    ),
  );
  return {
    cleanupManager,
    lifetime,
    unload: () => cleanupManager.executeCleanups(),
    retire: () =>
      claimContentScript(
        () => {},
        () => false,
      )(),
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Hold the next `chrome.storage.sync.get` until `answer` is called with the stored values. */
function holdNextSyncRead(): { answer: () => void } {
  const syncGet = vi.mocked(chrome.storage.sync.get);
  const read = syncGet.getMockImplementation() as (...args: unknown[]) => unknown;
  let answer: () => void = () => {};
  syncGet.mockImplementationOnce(
    ((...args: unknown[]) =>
      new Promise((resolve) => {
        answer = () => resolve(read(...args));
      })) as never,
  );
  return { answer: () => answer() };
}

function readKeysAskedFor(): string[] {
  return (chrome.storage.sync.get as unknown as Mock).mock.calls.flatMap(([keys]) =>
    keys && typeof keys === 'object' && !Array.isArray(keys) ? Object.keys(keys) : [],
  );
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  native.starts = {};
  native.live = {};
  document.body.innerHTML = '';
  harness = installLifecycleHarness();
});

afterEach(() => {
  for (const teardown of teardowns.splice(0)) teardown();
  harness.restore();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the page lifetime of native features', () => {
  function probe(start: NativeFeature['start']): NativeFeature {
    return { id: 'probe', position: CleanupPositions.CleanupFork, start };
  }

  it('stops a native feature whose start finishes after the content script retired', async () => {
    const { cleanupManager, lifetime, retire } = page();
    const pending = deferred<() => void>();
    const stop = vi.fn();
    const start = vi.fn(() => pending.promise);

    const inFlight = mountNativeFeature(cleanupManager, probe(start), lifetime.signal);
    retire();
    pending.resolve(stop);
    await inFlight;

    expect(stop).toHaveBeenCalledOnce();
    expect(cleanupManager.list()).toEqual([]);

    // Asked for only after retirement, it does not start at all.
    const late = vi.fn(() => vi.fn());
    await mountNativeFeature(cleanupManager, probe(late), lifetime.signal);
    expect(late).not.toHaveBeenCalled();
    expect(cleanupManager.list()).toEqual([]);
  });

  it('keeps mounting features normally after a beforeunload cleanup that the page survives', async () => {
    const { cleanupManager, lifetime, unload } = page();
    const pending = deferred<() => void>();
    const stop = vi.fn();

    const inFlight = mountNativeFeature(
      cleanupManager,
      probe(() => pending.promise),
      lifetime.signal,
    );
    unload();
    pending.resolve(stop);
    await inFlight;
    const later = vi.fn();
    await mountNativeFeature(
      cleanupManager,
      probe(() => later),
      lifetime.signal,
    );

    // The user stayed: both run and wait for the next teardown.
    expect(stop).not.toHaveBeenCalled();
    expect(later).not.toHaveBeenCalled();
    expect(cleanupManager.list().map(({ func }) => func)).toEqual([stop, later]);
  });

  it('stops a toggled feature whose start finishes after the content script retired, once', async () => {
    const { cleanupManager, lifetime, retire } = page();
    const pending = deferred<() => void>();
    const stop = vi.fn();
    const start = vi.fn(() => pending.promise);
    const toggle = createNativeFeatureToggle(
      cleanupManager,
      { ...probe(start), toggle: { key: 'gvProbe', isEnabled: (value) => value === true } },
      lifetime.signal,
    );

    const initial = toggle.applyInitial(true);
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    retire();
    pending.resolve(stop);
    await initial;

    expect(stop).toHaveBeenCalledOnce();
    expect(toggle.isMounted()).toBe(false);
    expect(cleanupManager.list()).toEqual([]);
    toggle.handleChange({ gvProbe: { newValue: true } }, 'sync');
    await flush();
    expect(start).toHaveBeenCalledOnce();
  });
});

describe('fork and research pack at the Gemini builtin start point', () => {
  function startNative(stored: Record<string, unknown>): {
    page: Page;
    startup: GeminiBuiltinStartup;
    flip: (changes: Changes, areaName?: string) => void;
  } {
    for (const [key, value] of Object.entries(stored)) harness.storage.sync.set(key, value);
    const current = page();
    const { admission, ownerOf } = ownedBy('legacy', ['fork', 'researchPack']);
    const startup = createGeminiBuiltinStartup(
      admission,
      current.cleanupManager,
      current.lifetime.signal,
      ownerOf,
    );
    return {
      page: current,
      startup,
      flip: (changes, areaName = 'sync') => startup.handleStorageChange(changes, areaName),
    };
  }

  it('turns fork off and on live from the popup switch while the native module owns it', async () => {
    const { page, startup, flip } = startNative({ [FORK]: true });
    await startup.startForkAndResearchPack();
    expect(native.live.fork).toBe(1);

    flip({ [FORK]: { newValue: false } });
    await flush();
    expect(native.live.fork).toBe(0);

    // The legacy switch also follows the local area.
    flip({ [FORK]: { newValue: true } }, 'local');
    await flush();
    expect(native.live.fork).toBe(1);
    expect(native.starts.fork).toBe(2);
    expect(native.starts.researchPack ?? 0).toBe(0);

    page.unload();
    expect(native.live.fork).toBe(0);
  });

  it('links a handed-off first message after the popup turns fork off, until page teardown', async () => {
    const originalUrl = location.href;
    history.replaceState({}, '', '/app');
    const { page, startup, flip } = startNative({ [FORK]: true });
    const addNode = vi.spyOn(ForkNodesService, 'addForkNode').mockResolvedValue(true);
    try {
      await startup.startForkAndResearchPack();
      const receiver = captureForkReceiver()!;
      const options = {
        receiver,
        deadline: Date.now() + 60_000,
        pendingFork: {
          sourceConversationId: 'source',
          sourceTurnId: 's-aabbccdd',
          sourceUrl: `${location.origin}/app/source`,
          sourceTitle: 'Source',
          forkGroupId: 'handoff',
          sourceForkIndex: 0,
          nextForkIndex: 1,
          markdown: 'A first message',
          mode: 'paste' as const,
        },
        getConversationTitle: () => 'Branch',
        onLinked: vi.fn(async () => {}),
        onFinished: vi.fn(),
      };
      const receipt = handoffPendingForkLink(options);
      expect(receipt).not.toBeNull();
      flip({ [FORK]: { newValue: false } });
      await flush();
      receipt!.hideUi();
      expect(native.live.fork).toBe(0);

      document.body.innerHTML =
        '<div class="text-input-field"><rich-textarea><div contenteditable="true">A first message</div></rich-textarea><button aria-label="Send message">Send</button></div>';
      const input = document.querySelector<HTMLElement>('[contenteditable]')!;
      Object.defineProperty(input, 'getBoundingClientRect', { value: () => ({ height: 32 }) });
      const button = document.querySelector('button')!;
      Object.defineProperty(button, 'offsetParent', { value: document.body });
      button.click();
      history.pushState({}, '', '/app/branch');
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div class="conversation-container" id="11223344"><user-query>A first message</user-query></div>',
      );
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flush();

      expect(addNode.mock.calls.map(([node]) => [node.conversationId, node.turnId])).toEqual([
        ['source', 's-aabbccdd'],
        ['branch', 's-11223344'],
      ]);
      expect(options.onLinked).not.toHaveBeenCalled();
      history.replaceState({}, '', '/app');
      page.unload();
      expect(handoffPendingForkLink(options)).toBeNull();
    } finally {
      addNode.mockRestore();
      history.replaceState({}, '', originalUrl);
    }
  });

  it('turns the research pack off and on live from the popup switch while the native module owns it', async () => {
    const { page, startup, flip } = startNative({ [RESEARCH_PACK]: true });
    await startup.startForkAndResearchPack();
    expect(native.live.researchPack).toBe(1);

    flip({ [RESEARCH_PACK]: { newValue: false } });
    await flush();
    expect(native.live.researchPack).toBe(0);

    flip({ [RESEARCH_PACK]: { newValue: true } });
    await flush();
    expect(native.live.researchPack).toBe(1);
    expect(native.starts.researchPack).toBe(2);
    expect(native.starts.fork ?? 0).toBe(0);

    page.unload();
    expect(native.live.researchPack).toBe(0);
  });

  it.each([
    ['never stored', {}],
    ['stored off', { [FORK]: false, [RESEARCH_PACK]: false }],
    ['stored as anything but true', { [FORK]: 'true', [RESEARCH_PACK]: 1 }],
  ])('starts neither while both switches are %s', async (_label, stored) => {
    const { startup } = startNative(stored);
    await startup.startForkAndResearchPack();
    expect(native.starts).toEqual({});
  });

  it('keeps the switch flipped during the startup read instead of the late initial value', async () => {
    const { startup, flip } = startNative({ [FORK]: false });
    const forkRead = holdNextSyncRead();

    const started = startup.startForkAndResearchPack();
    await flush();
    flip({ [FORK]: { newValue: true } });
    forkRead.answer();
    await started;
    await flush();

    expect(native.live.fork).toBe(1);
  });

  it('creates no research pack toggle when teardown lands during the fork startup read', async () => {
    const { page, startup, flip } = startNative({ [FORK]: true, [RESEARCH_PACK]: true });
    const forkRead = holdNextSyncRead();

    const started = startup.startForkAndResearchPack();
    await flush();
    page.unload();
    forkRead.answer();
    await started;
    await flush();

    expect(native.starts).toEqual({});
    expect(readKeysAskedFor()).toEqual([FORK]);
    flip({ [RESEARCH_PACK]: { newValue: true } });
    flip({ [FORK]: { newValue: true } });
    await flush();
    expect(native.starts).toEqual({});
  });

  it('stops fork and the research pack before page teardown reaches them, once each', async () => {
    const { page, startup } = startNative({ [FORK]: true, [RESEARCH_PACK]: true });
    await startup.startForkAndResearchPack();
    expect(native.live).toEqual({ fork: 1, researchPack: 1 });

    page.retire();
    await flush();
    expect(native.live).toEqual({ fork: 0, researchPack: 0 });
    expect(page.cleanupManager.list()).toEqual([]);
  });
});

describe('the default model at the Gemini builtin start point', () => {
  function startup(owner: FeatureOwner) {
    const current = page();
    const { admission, ownerOf } = ownedBy(owner, ['defaultModel']);
    const builtins = createGeminiBuiltinStartup(
      admission,
      current.cleanupManager,
      current.lifetime.signal,
      ownerOf,
    );
    return { ...current, admission, builtins };
  }

  it('starts the native default model once while the native module owns it, and stops it on teardown', async () => {
    const { admission, builtins, unload } = startup('legacy');
    await builtins.startDefaultModel();
    admission.close();

    expect(native.live.defaultModel).toBe(1);
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiDefaultModel)).toBe('denied');
    unload();
    expect(native.live.defaultModel).toBe(0);
  });

  it('starts no native default model once page teardown began', async () => {
    const { builtins, unload } = startup('legacy');
    unload();
    await builtins.startDefaultModel();
    expect(native.starts.defaultModel ?? 0).toBe(0);
  });

  it('stops the native default model when the content script retired during its start', async () => {
    const { builtins, retire, cleanupManager } = startup('legacy');
    const started = builtins.startDefaultModel();
    retire();
    await started;
    expect(native.live.defaultModel ?? 0).toBe(0);
    expect(cleanupManager.list()).toEqual([]);
  });

  it('admits the default model plugin and starts no native default model', async () => {
    const { admission, builtins } = startup('plugin');
    await builtins.startDefaultModel();
    admission.close();

    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiDefaultModel)).toBe('admitted');
    expect(native.starts.defaultModel ?? 0).toBe(0);
  });
});

describe('the response notification at the Gemini builtin start point', () => {
  function startup() {
    const current = page();
    const { admission, ownerOf } = ownedBy('legacy', []);
    const builtins = createGeminiBuiltinStartup(
      admission,
      current.cleanupManager,
      current.lifetime.signal,
      ownerOf,
    );
    return { ...current, builtins };
  }

  it('starts one notification run while the native module owns it, and stops it on teardown', async () => {
    const { builtins, unload } = startup();
    await builtins.startResponseNotification();

    expect(native.live.responseNotification).toBe(1);
    unload();
    expect(native.live.responseNotification).toBe(0);
  });

  it('starts no notification run once page teardown began', async () => {
    const { builtins, unload } = startup();
    unload();
    await builtins.startResponseNotification();
    expect(native.starts.responseNotification ?? 0).toBe(0);
  });
});

describe('fork at its Gemini owner start point', () => {
  it.each(['plugin', 'legacy'] as const)(
    'starts only the %s owner and stops native fork on teardown',
    async (owner) => {
      harness.storage.sync.set(FORK, true);
      const { cleanupManager, lifetime, unload } = page();
      const { admission, ownerOf } = ownedBy(owner, ['fork']);
      const builtins = createGeminiBuiltinStartup(
        admission,
        cleanupManager,
        lifetime.signal,
        ownerOf,
      );
      await builtins.startForkAndResearchPack();
      admission.close();

      expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiFork)).toBe(
        owner === 'plugin' ? 'admitted' : 'denied',
      );
      expect(native.starts.fork ?? 0).toBe(owner === 'legacy' ? 1 : 0);
      expect(native.live.fork ?? 0).toBe(owner === 'legacy' ? 1 : 0);
      unload();
      expect(native.live.fork ?? 0).toBe(0);
    },
  );
});

describe('the research pack owned by its official plugin', () => {
  it('admits the research pack plugin and starts no native research pack, while fork stays native', async () => {
    harness.storage.sync.set(FORK, true);
    harness.storage.sync.set(RESEARCH_PACK, true);
    const { cleanupManager, lifetime } = page();
    const { admission, ownerOf } = ownedBy('plugin', ['researchPack'], ['fork']);
    const builtins = createGeminiBuiltinStartup(
      admission,
      cleanupManager,
      lifetime.signal,
      ownerOf,
    );

    await builtins.startForkAndResearchPack();
    admission.close();

    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiResearchPack)).toBe('admitted');
    expect(native.live).toEqual({ fork: 1 });
    // The content script's router no longer turns the native module on: the plugin owns its switch.
    builtins.handleStorageChange({ [RESEARCH_PACK]: { newValue: true } }, 'sync');
    await flush();
    expect(native.starts.researchPack ?? 0).toBe(0);
    expect(readKeysAskedFor()).toEqual([FORK]);
  });

  it('admits no research pack plugin when teardown lands during the fork startup read', async () => {
    const { cleanupManager, lifetime, unload } = page();
    const { admission, ownerOf } = ownedBy('plugin', ['researchPack'], ['fork']);
    const builtins = createGeminiBuiltinStartup(
      admission,
      cleanupManager,
      lifetime.signal,
      ownerOf,
    );
    const forkRead = holdNextSyncRead();

    const started = builtins.startForkAndResearchPack();
    await flush();
    unload();
    forkRead.answer();
    await started;
    admission.close();

    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiResearchPack)).toBe('denied');
  });
});

describe('the markdown patcher on the page lifetime', () => {
  function reply(text: string): HTMLElement {
    const response = document.createElement('model-response');
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    response.appendChild(paragraph);
    document.body.appendChild(response);
    return response;
  }

  it('stops patching new replies after a content-script handoff', async () => {
    vi.useFakeTimers();
    const { cleanupManager, lifetime, retire } = page();
    await mountNativeFeature(cleanupManager, NATIVE_FEATURES.markdownPatcher, lifetime.signal);

    const patched = reply('before **bold** after');
    await vi.advanceTimersByTimeAsync(150);
    expect(patched.querySelector('strong')?.textContent).toBe('bold');

    retire();
    const unpatched = reply('before **bold** after');
    await vi.advanceTimersByTimeAsync(150);

    expect(unpatched.querySelector('strong')).toBeNull();
    expect(unpatched.textContent).toBe('before **bold** after');
    // A reply it already fixed stays fixed: the rewrite is not undone.
    expect(patched.querySelector('strong')?.textContent).toBe('bold');
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
