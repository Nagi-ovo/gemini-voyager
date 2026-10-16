/** Page-owned services and the original admission points after legacy startup retirement. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CleanupPositions } from '@/core/types/cleanupPositions';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';

import { claimContentScript } from '../contentScriptHandoff';
import {
  type NativeFeature,
  createNativeFeatureToggle,
  mountNativeFeature,
} from '../featureLifecycle';
import { ForkNodesService } from '../fork/ForkNodesService';
import { handoffPendingForkLink } from '../fork/linkFinisher';
import { captureForkReceiver } from '../fork/receiverIdentity';
import { createGeminiBuiltinStartup } from '../geminiBuiltinStartup';
import { NATIVE_FEATURES } from '../nativeFeatures';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

interface Page {
  readonly cleanupManager: CleanupManager;
  readonly lifetime: AbortController;
  unload(): void;
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

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  document.body.innerHTML = '';
  harness = installLifecycleHarness();
});

afterEach(() => {
  for (const teardown of teardowns.splice(0)) teardown();
  harness.restore();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the page lifetime of native features', () => {
  function probe(start: NativeFeature['start']): NativeFeature {
    return { id: 'probe', position: CleanupPositions.CleanupGemsHider, start };
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

describe('official plugins at their Gemini start points', () => {
  it.each([
    ['startTimeline', OFFICIAL_PLUGIN_IDS.geminiTimeline],
    ['startMarkdownFix', OFFICIAL_PLUGIN_IDS.geminiMarkdownFix],
    ['startCanvasCopy', OFFICIAL_PLUGIN_IDS.geminiCanvasCopy],
    ['startDeepResearchExport', OFFICIAL_PLUGIN_IDS.geminiDeepResearchExport],
    ['startGemsSidebar', OFFICIAL_PLUGIN_IDS.geminiGemsSidebar],
    ['startContextSync', OFFICIAL_PLUGIN_IDS.geminiContextSync],
    ['startDefaultModel', OFFICIAL_PLUGIN_IDS.geminiDefaultModel],
    ['startResponseNotification', OFFICIAL_PLUGIN_IDS.geminiResponseNotification],
    ['startUsageStatus', OFFICIAL_PLUGIN_IDS.geminiUsageStatus],
  ] as const)(
    'admits %s only at its original start point and never after teardown',
    async (method, id) => {
      const current = page();
      const admission = createOfficialAdmission();
      const startup = createGeminiBuiltinStartup(
        admission,
        current.cleanupManager,
        current.lifetime.signal,
      );
      expect(admission.stateOf(id)).toBe('pending');
      await startup[method]();
      expect(admission.stateOf(id)).toBe('admitted');

      const late = page();
      const lateAdmission = createOfficialAdmission();
      const lateStartup = createGeminiBuiltinStartup(
        lateAdmission,
        late.cleanupManager,
        late.lifetime.signal,
      );
      late.unload();
      await lateStartup[method]();
      lateAdmission.close();
      expect(lateAdmission.stateOf(id)).toBe('denied');
    },
  );

  it('admits no builtin after the lifetime aborts even before cleanup runs', async () => {
    const current = page();
    const admission = createOfficialAdmission();
    const startup = createGeminiBuiltinStartup(
      admission,
      current.cleanupManager,
      current.lifetime.signal,
    );
    current.lifetime.abort();
    await startup.startTimeline();
    await startup.startMarkdownFix();
    await startup.startCanvasCopy();
    await startup.startDeepResearchExport();
    await startup.startGemsSidebar();
    await startup.startContextSync();
    await startup.startDefaultModel();
    await startup.startResponseNotification();
    await startup.startUsageStatus();
    await startup.startPreventAutoScroll();
    await startup.startForkAndResearchPack();
    admission.close();
    for (const id of [
      OFFICIAL_PLUGIN_IDS.geminiTimeline,
      OFFICIAL_PLUGIN_IDS.geminiMarkdownFix,
      OFFICIAL_PLUGIN_IDS.geminiCanvasCopy,
      OFFICIAL_PLUGIN_IDS.geminiDeepResearchExport,
      OFFICIAL_PLUGIN_IDS.geminiGemsSidebar,
      OFFICIAL_PLUGIN_IDS.geminiContextSync,
      OFFICIAL_PLUGIN_IDS.geminiDefaultModel,
      OFFICIAL_PLUGIN_IDS.geminiResponseNotification,
      OFFICIAL_PLUGIN_IDS.geminiUsageStatus,
      OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll,
      OFFICIAL_PLUGIN_IDS.geminiFork,
      OFFICIAL_PLUGIN_IDS.geminiResearchPack,
    ])
      expect(admission.stateOf(id)).toBe('denied');
    expect(document.getElementById('gv-prevent-auto-scroll-bridge')).toBeNull();
  });
});

describe('permanent services before their plugin consumers', () => {
  it.each([
    [
      'preventAutoScrollBridge',
      'startPreventAutoScroll',
      [OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll],
    ],
    [
      'forkLinkFinisher',
      'startForkAndResearchPack',
      [OFFICIAL_PLUGIN_IDS.geminiFork, OFFICIAL_PLUGIN_IDS.geminiResearchPack],
    ],
  ] as const)('%s finishes before its plugins are admitted', async (service, method, ids) => {
    const current = page();
    const admission = createOfficialAdmission();
    const startup = createGeminiBuiltinStartup(
      admission,
      current.cleanupManager,
      current.lifetime.signal,
    );
    const pending = deferred<() => void>();
    const stop = vi.fn();
    const feature: NativeFeature = NATIVE_FEATURES[service];
    vi.spyOn(feature, 'start').mockReturnValue(pending.promise);
    const admitted: string[] = [];
    admission.subscribe(() => {
      const latest = ids.find(
        (id) => admission.stateOf(id) === 'admitted' && !admitted.includes(id),
      );
      if (latest) admitted.push(latest);
    });
    const started = startup[method]();
    expect(ids.map((id) => admission.stateOf(id))).toEqual(ids.map(() => 'pending'));
    pending.resolve(stop);
    await started;
    expect(admitted).toEqual([...ids]);
    current.unload();
    expect(stop).toHaveBeenCalledOnce();
  });

  it.each([
    [
      'preventAutoScrollBridge',
      'startPreventAutoScroll',
      [OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll],
    ],
    [
      'forkLinkFinisher',
      'startForkAndResearchPack',
      [OFFICIAL_PLUGIN_IDS.geminiFork, OFFICIAL_PLUGIN_IDS.geminiResearchPack],
    ],
  ] as const)(
    'admits no plugin when %s startup finishes after retirement',
    async (service, method, ids) => {
      const current = page();
      const admission = createOfficialAdmission();
      const startup = createGeminiBuiltinStartup(
        admission,
        current.cleanupManager,
        current.lifetime.signal,
      );
      const pending = deferred<() => void>();
      const stop = vi.fn();
      const feature: NativeFeature = NATIVE_FEATURES[service];
      vi.spyOn(feature, 'start').mockReturnValue(pending.promise);
      const started = startup[method]();
      current.retire();
      pending.resolve(stop);
      await started;
      admission.close();
      expect(ids.map((id) => admission.stateOf(id))).toEqual(ids.map(() => 'denied'));
      expect(stop).toHaveBeenCalledOnce();
      expect(current.cleanupManager.list()).toEqual([]);
    },
  );

  it('links a handed-off first message without a Fork UI owner, until page teardown', async () => {
    const originalUrl = location.href;
    history.replaceState({}, '', '/app');
    const current = page();
    const admission = createOfficialAdmission();
    const startup = createGeminiBuiltinStartup(
      admission,
      current.cleanupManager,
      current.lifetime.signal,
    );
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
      receipt!.hideUi();

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
      current.unload();
      expect(handoffPendingForkLink(options)).toBeNull();
    } finally {
      addNode.mockRestore();
      history.replaceState({}, '', originalUrl);
    }
  });
});
