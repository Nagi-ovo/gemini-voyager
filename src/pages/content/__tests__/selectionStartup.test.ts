/**
 * The Gemini selection start point wired as `index.tsx` wires it: a cleanup
 * manager that page teardown runs, a page lifetime, and a storage router
 * feeding the start point. The toolbar host, the Quote action and the
 * Highlight action are the real modules; only the highlight store is stubbed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CleanupPositions } from '@/core/types/cleanupPositions';
import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import {
  FEATURE_OWNERS,
  type FeatureOwner,
  OFFICIAL_PLUGIN_IDS,
} from '@/features/plugins/sites/featureOwners';

import type { NativeFeature } from '../featureLifecycle';
import { HighlightManager } from '../highlight/manager';
import { NATIVE_FEATURES } from '../nativeFeatures';
import { type SelectionStartup, createSelectionStartup } from '../selectionStartup';

vi.mock('../inputCollapse/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../inputCollapse/index')>()),
  expandInputCollapseIfNeeded: vi.fn(),
}));

const RECT = { top: 200, bottom: 210, left: 100, right: 110, width: 10, height: 10 };
const QUOTE = StorageKeys.QUOTE_REPLY_ENABLED;
const HIGHLIGHT = StorageKeys.HIGHLIGHT_ENABLED;

let stored: Record<string, unknown> = {};
let teardowns: Array<() => void> = [];

/** Answer a `storage.sync.get` call (a key, a key list or a defaults object) from `stored`. */
function readStored(keys: unknown): Record<string, unknown> {
  if (typeof keys === 'string') return keys in stored ? { [keys]: stored[keys] } : {};
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.filter((key) => key in stored).map((key) => [key, stored[key]]));
  }
  if (keys && typeof keys === 'object') {
    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [key, key in stored ? stored[key] : fallback]),
    );
  }
  return { ...stored };
}

function installConversation(): void {
  document.body.innerHTML = `
    <main>
      <div class="conversation-container" id="1111111111111111">
        <div class="user-query-bubble-with-background"><p id="user">Question text</p></div>
        <model-response><message-content><p id="assistant">Answer text</p></message-content></model-response>
      </div>
    </main>
    <textarea></textarea>
  `;
}

function select(id: string): void {
  const text = document.getElementById(id)?.firstChild;
  if (!(text instanceof Text)) throw new Error(`Expected text in #${id}`);
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 6);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup'));
  vi.advanceTimersByTime(250);
}

const isShown = (selector: string): boolean => {
  const element = document.querySelector(selector);
  return Boolean(element?.isConnected && !element.classList.contains('gv-hidden'));
};
const quoteShown = () => isShown('.gv-quote-btn');
const highlightShown = () => isShown('.gv-highlight-action');
const toolbarShown = () => isShown('.gv-selection-toolbar');

/** Let queued toggle mounts and storage reads settle. */
async function flushPromises(): Promise<void> {
  for (let round = 0; round < 10; round += 1) await Promise.resolve();
}

interface Page {
  readonly cleanupManager: CleanupManager;
  readonly startup: SelectionStartup;
  readonly admission: ReturnType<typeof createOfficialAdmission>;
  flip(key: string, value: unknown): void;
  unload(): void;
}

function page(quoteOwner: FeatureOwner = 'legacy', highlightOwner: FeatureOwner = 'legacy'): Page {
  const cleanupManager = new CleanupManager();
  const owners = FEATURE_OWNERS.map((entry) =>
    entry.feature === 'quoteReply'
      ? { ...entry, owner: quoteOwner }
      : entry.feature === 'highlight'
        ? { ...entry, owner: highlightOwner }
        : entry,
  );
  const admission = createOfficialAdmission(owners);
  const startup = createSelectionStartup(admission, cleanupManager, undefined, (_site, feature) =>
    feature === 'quoteReply' ? quoteOwner : highlightOwner,
  );
  teardowns.push(() => cleanupManager.executeCleanups());
  return {
    cleanupManager,
    startup,
    admission,
    flip: (key, value) => {
      stored[key] = value;
      startup.handleStorageChange({ [key]: { newValue: value } }, 'sync');
    },
    unload: () => cleanupManager.executeCleanups(),
  };
}

describe('the Gemini selection start point', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stored = {};
    vi.spyOn(HighlightManager.prototype, 'init').mockResolvedValue();
    vi.mocked(chrome.storage.sync.get).mockImplementation((async (keys: unknown) =>
      readStored(keys)) as never);
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...RECT, x: 0, y: 0, toJSON: () => ({}) }),
    });
    installConversation();
  });

  afterEach(() => {
    teardowns.splice(0).forEach((teardown) => teardown());
    teardowns = [];
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    window.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  it('turning quote off live removes only the quote button', async () => {
    stored[HIGHLIGHT] = true;
    const { startup, flip } = page();
    await startup.start();
    select('assistant');
    expect(quoteShown()).toBe(true);
    expect(highlightShown()).toBe(true);

    flip(QUOTE, false);
    await flushPromises();
    select('assistant');

    expect(quoteShown()).toBe(false);
    expect(highlightShown()).toBe(true);
  });

  it('turning quote on live adds the button without a reload', async () => {
    stored[QUOTE] = false;
    const { startup, flip } = page();
    await startup.start();
    select('assistant');
    expect(toolbarShown()).toBe(false);

    flip(QUOTE, true);
    await flushPromises();
    select('user');

    expect(quoteShown()).toBe(true);
  });

  it('startup cleanup runs before the features it started', async () => {
    stored[HIGHLIGHT] = true;
    const { cleanupManager, startup } = page();
    await startup.start();

    const positions = cleanupManager.list().map(({ pos }) => pos);
    expect(Math.min(...positions)).toBe(CleanupPositions.CleanupSelectionStartup);
    // The actions stop before the styling and the toolbar host they work with.
    expect(positions).toEqual(
      expect.arrayContaining([
        CleanupPositions.CleanupQuoteReply,
        CleanupPositions.CleanupHighlight,
        CleanupPositions.CleanupRenderedQuoteStyling,
        CleanupPositions.CleanupSelectionToolbarHost,
      ]),
    );
    expect(CleanupPositions.CleanupHighlight).toBeLessThan(
      CleanupPositions.CleanupRenderedQuoteStyling,
    );
    expect(CleanupPositions.CleanupRenderedQuoteStyling).toBeLessThan(
      CleanupPositions.CleanupSelectionToolbarHost,
    );
  });

  it('a startup read that resolves after teardown mounts nothing', async () => {
    let answer: () => void = () => {};
    vi.mocked(chrome.storage.sync.get).mockImplementationOnce(
      ((keys: unknown) =>
        new Promise((resolve) => {
          answer = () => resolve(readStored(keys));
        })) as never,
    );
    const { cleanupManager, startup, unload } = page();
    const starting = startup.start();
    await flushPromises();

    unload();
    answer();
    await starting;
    await flushPromises();
    select('assistant');

    expect(toolbarShown()).toBe(false);
    expect(document.querySelector('.gv-quote-btn')).toBeNull();
    expect(cleanupManager.list()).toEqual([]);
  });

  it('admits neither selection plugin when teardown lands during sent-quote styling startup', async () => {
    let finish!: (stop: () => void) => void;
    const pending = new Promise<() => void>((resolve) => {
      finish = resolve;
    });
    const styling: NativeFeature = NATIVE_FEATURES.renderedQuoteStyling;
    vi.spyOn(styling, 'start').mockReturnValue(pending);
    const { startup, admission, unload } = page('plugin', 'plugin');
    const starting = startup.start();
    await flushPromises();
    unload();
    finish(() => {});
    await starting;
    admission.close();
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiQuoteReply)).toBe('denied');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiHighlight)).toBe('denied');
    expect(document.querySelector('.gv-selection-toolbar')).toBeNull();
  });
});
