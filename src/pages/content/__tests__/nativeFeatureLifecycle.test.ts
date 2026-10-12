// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app/0123456789abcdef" }
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CleanupManager } from '@/core/utils/cleanupManager';
import { initI18n } from '@/utils/i18n';

import { mountNativeFeature } from '../featureLifecycle';
import { NATIVE_FEATURE_LIST } from '../nativeFeatures';
import { installLifecycleHarness, type LifecycleHarness } from './lifecycleHarness';

/**
 * Every native feature in the registry must start on a Gemini page, do
 * something observable, and stop without leaving a listener, observer, timer,
 * storage subscription or DOM change behind. The checks are generic on
 * purpose: a module is covered the moment it is registered.
 *
 * Only the page-teardown and popup-toggle lifetimes are asserted here.
 * Sidebar remounts and account changes stay with each module's own tests.
 */

const GEMINI_PAGE =
  '<div class="host"><bard-sidenav><div class="sidenav-content"></div></bard-sidenav>' +
  '<main><div id="chat-history"><user-query><div class="query-text-line">hi</div></user-query>' +
  '<model-response><message-content><p>hello</p></message-content></model-response></div>' +
  '<input-area-v2><rich-textarea><div contenteditable="true"></div></rich-textarea></input-area-v2></main></div>';

function snapshotDocument(): { head: string; body: string; html: string } {
  return {
    head: document.head.innerHTML,
    body: document.body.outerHTML,
    html: document.documentElement.getAttribute('class') ?? '',
  };
}

/** Let scheduled work run once, then settle promises; bounded so a retry loop cannot spin forever. */
async function flush(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
  }
}

describe('native feature lifecycle (parametric)', () => {
  let harness: LifecycleHarness;

  // Shared i18n installs its one language listener for the whole page the
  // first time anything initialises it; that is infrastructure, not a feature.
  beforeAll(async () => {
    const bootstrap = installLifecycleHarness();
    try {
      await initI18n();
    } finally {
      bootstrap.restore();
    }
  });

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
      ],
    });
    document.head.innerHTML = '';
    document.body.innerHTML = GEMINI_PAGE;
    harness = installLifecycleHarness();
  });

  afterEach(() => {
    harness.restore();
    vi.useRealTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.body.removeAttribute('class');
    document.body.removeAttribute('style');
    document.documentElement.removeAttribute('class');
    document.documentElement.removeAttribute('style');
  });

  it('gives every registered feature a distinct id', () => {
    const ids = NATIVE_FEATURE_LIST.map((feature) => feature.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const feature of NATIVE_FEATURE_LIST) {
    const rounds = feature.toggle ? 2 : 1;

    it(`${feature.id}: start → stop leaves the page as it found it${
      rounds > 1 ? ' (twice, because the popup can toggle it)' : ''
    }`, async () => {
      const before = snapshotDocument();

      for (let round = 1; round <= rounds; round += 1) {
        harness.ledger.resetActivity();
        const hostNodes = new Set<EventTarget>(document.querySelectorAll('*'));
        const stop = await feature.start();
        await flush();

        if (!feature.inertReason) {
          const changedDocument = JSON.stringify(snapshotDocument()) !== JSON.stringify(before);
          expect(
            harness.ledger.activity() > 0 || changedDocument,
            `${feature.id} registered nothing on round ${round}; if that is expected, say why in inertReason`,
          ).toBe(true);
        }

        stop();
        await flush();

        // Host nodes count even when detached: the host may attach one again later.
        expect(
          harness.ledger.openListeners({ detachedHosts: hostNodes }),
          `listeners after round ${round}`,
        ).toEqual([]);
        expect(harness.ledger.openObservers(), `observers after round ${round}`).toEqual([]);
        expect(
          harness.ledger.openStorageListeners(),
          `storage listeners after round ${round}`,
        ).toBe(0);
        expect(
          harness.ledger.openRuntimeListeners(),
          `runtime listeners after round ${round}`,
        ).toBe(0);
        expect(vi.getTimerCount(), `timers after round ${round}`).toBe(0);
        expect(snapshotDocument(), `document after round ${round}`).toEqual(before);
      }
    });

    it(`${feature.id}: stopping while start is still pending leaves nothing behind`, async () => {
      const before = snapshotDocument();
      const manager = new CleanupManager();
      const lifetime = new AbortController();

      // The page retires before the start settles, as a handoff can land mid-start.
      const mounted = mountNativeFeature(manager, feature, lifetime.signal);
      lifetime.abort();
      manager.executeCleanups();
      await mounted;
      await flush();

      expect(manager.list()).toEqual([]);
      expect(harness.ledger.openListeners(), 'listeners').toEqual([]);
      expect(harness.ledger.openObservers(), 'observers').toEqual([]);
      expect(harness.ledger.openStorageListeners(), 'storage listeners').toBe(0);
      expect(harness.ledger.openRuntimeListeners(), 'runtime listeners').toBe(0);
      expect(vi.getTimerCount(), 'timers').toBe(0);
      expect(snapshotDocument(), 'document').toEqual(before);
    });

    it(`${feature.id}: a feature remounted on a replaced host leaves no listeners on the old host`, async () => {
      const oldHostNodes = new Set<EventTarget>(document.querySelectorAll('*'));
      const stop = await feature.start();
      await flush();

      // Gemini re-renders the page: every host node the feature saw is detached.
      document.body.innerHTML = GEMINI_PAGE;
      await flush();
      stop();
      await flush();

      expect(
        harness.ledger.openListeners({ detachedHosts: oldHostNodes }),
        'listeners on the old or the new host',
      ).toEqual([]);
      expect(harness.ledger.openObservers(), 'observers').toEqual([]);
      expect(harness.ledger.openStorageListeners(), 'storage listeners').toBe(0);
      expect(vi.getTimerCount(), 'timers').toBe(0);
    });
  }
});
