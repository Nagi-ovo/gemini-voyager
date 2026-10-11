/**
 * An extension update leaves the old content script running beside the new
 * one until the new one claims the page (`contentScriptHandoff.ts`). Each copy
 * has its own module state, so its own formula-copy singleton; the page DOM is
 * all they share. A late cleanup from the retiring copy may only undo what
 * that copy did.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { claimContentScript } from '@/pages/content/contentScriptHandoff';

const storageMocks = vi.hoisted(() => ({
  get: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: { get: storageMocks.get },
      onChanged: {
        addListener: storageMocks.addListener,
        removeListener: storageMocks.removeListener,
      },
    },
  },
}));

type FormulaModule = typeof import('./index');

/** A fresh module graph: what a newly injected content script would load. */
async function loadContentScriptCopy(): Promise<FormulaModule> {
  vi.resetModules();
  return import('./index');
}

const ROOT_CLASS = 'gv-formula-copy-enabled';
const IGNORED_CLASS = 'gv-formula-copy-ignored';

/** Every change to the root's class from now on, delivered or not. */
function watchRootClass(): { changes: () => MutationRecord[]; stop: () => void } {
  const seen: MutationRecord[] = [];
  const observer = new MutationObserver((records) => seen.push(...records));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return {
    changes: () => [...seen, ...observer.takeRecords()],
    stop: () => observer.disconnect(),
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('formula copy across a content-script handoff', () => {
  const stopClaims: Array<() => void> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.get.mockResolvedValue({});
  });

  afterEach(() => {
    for (const stop of stopClaims.splice(0)) stop();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-gv-formula-copy-owner');
    document.body.innerHTML = '';
  });

  it("a retired copy's late startup leaves the new copy's root class and listeners alone", async () => {
    let finishOldRead!: (value: Record<string, unknown>) => void;
    storageMocks.get.mockImplementationOnce(
      () => new Promise((resolve) => (finishOldRead = resolve)),
    );

    // Old copy: its formula plugin is still reading the copy format.
    const oldCopy = await loadContentScriptCopy();
    const oldScope = new PluginScope();
    oldCopy.activateFormulaCopy(oldScope);
    let oldDisposal: Promise<void> | null = null;
    stopClaims.push(
      claimContentScript(
        () => {
          oldDisposal = oldScope.dispose();
        },
        () => true,
      ),
    );
    await Promise.resolve();
    expect(storageMocks.addListener).toHaveBeenCalledTimes(1);
    const oldFormatListener = storageMocks.addListener.mock.calls[0]?.[0];

    // New copy claims the page (retiring the old one), then starts its plugin.
    const newCopy = await loadContentScriptCopy();
    stopClaims.push(
      claimContentScript(
        () => {},
        () => false,
      ),
    );
    expect(oldDisposal).not.toBeNull();
    const newService = newCopy.getFormulaCopyService();
    expect(newService).not.toBe(oldCopy.getFormulaCopyService());
    const newScope = new PluginScope();
    newCopy.activateFormulaCopy(newScope);
    await vi.waitFor(() => expect(newService.isServiceInitialized()).toBe(true));
    expect(document.documentElement.classList.contains(ROOT_CLASS)).toBe(true);
    const newFormatListener = storageMocks.addListener.mock.calls[1]?.[0];

    // Watch for any touch of the root class while the old startup lands.
    const rootClass = watchRootClass();
    const removeListener = vi.spyOn(document, 'removeEventListener');

    finishOldRead({});
    await oldDisposal;
    await flush();

    expect(rootClass.changes()).toEqual([]);
    rootClass.stop();
    expect(document.documentElement.classList.contains(ROOT_CLASS)).toBe(true);
    expect(newService.isServiceInitialized()).toBe(true);
    // The old copy removed only its own format listener, and no page listener.
    expect(storageMocks.removeListener.mock.calls).toEqual([[oldFormatListener]]);
    expect(removeListener).not.toHaveBeenCalled();
    removeListener.mockRestore();

    await newScope.dispose();
    expect(document.documentElement.classList.contains(ROOT_CLASS)).toBe(false);
    expect(storageMocks.removeListener).toHaveBeenLastCalledWith(newFormatListener);
  });

  it("a retired copy shutting down after the new copy started keeps the new copy's root class", async () => {
    const oldCopy = await loadContentScriptCopy();
    const oldService = oldCopy.getFormulaCopyService();
    oldService.initialize();

    const newCopy = await loadContentScriptCopy();
    const newService = newCopy.getFormulaCopyService();
    newService.initialize();

    const rootClass = watchRootClass();
    oldService.dispose();
    await flush();

    expect(rootClass.changes()).toEqual([]);
    rootClass.stop();
    expect(document.documentElement.classList.contains(ROOT_CLASS)).toBe(true);

    newService.dispose();
    expect(document.documentElement.classList.contains(ROOT_CLASS)).toBe(false);
  });

  it("a retired copy shutting down after the new copy started keeps the new copy's Gemini arrow markers", async () => {
    document.body.innerHTML =
      '<p>A <span class="math-inline"><span data-math="\\rightarrow">→</span></span> B</p>';
    const marked = (): number => document.querySelectorAll(`.${IGNORED_CLASS}`).length;
    const oldCopy = await loadContentScriptCopy();
    const oldService = oldCopy.getFormulaCopyService({ observeGeminiArrows: true });
    oldService.initialize();

    const newCopy = await loadContentScriptCopy();
    const newService = newCopy.getFormulaCopyService({ observeGeminiArrows: true });
    newService.initialize();
    // The arrow and its inline wrapper: no formula padding or copy cursor.
    expect(marked()).toBe(2);

    oldService.dispose();
    await flush();
    expect(marked()).toBe(2);

    // The old copy stopped observing all the same: once the new copy stops
    // too, an arrow rendered afterwards is marked by nobody.
    newService.dispose();
    expect(marked()).toBe(0);
    const later = document.createElement('p');
    later.innerHTML = '<span class="math-inline"><span data-math="\\to">→</span></span>';
    document.body.append(later);
    await flush();
    expect(marked()).toBe(0);
  });
});
