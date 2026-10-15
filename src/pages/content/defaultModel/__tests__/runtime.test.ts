import { describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import { setupModelLockerTests } from './modelLockerHarness';

type StorageCallback = (items: Record<string, unknown>) => void;
type Spy = ReturnType<typeof vi.fn>;

const syncGet = () => chrome.storage.sync.get as unknown as Spy;
const syncSet = () => chrome.storage.sync.set as unknown as Spy;
const syncRemove = () => chrome.storage.sync.remove as unknown as Spy;

/**
 * An in-memory sync area. `holdFrom(n)` parks every read after the first `n`
 * until `release()`, to stop a run in the middle of its storage reads.
 */
function useSyncStore(initial: Record<string, unknown>) {
  const store: Record<string, unknown> = { ...initial };
  const parked: Array<() => void> = [];
  let served = 0;
  let holdAfter = Number.POSITIVE_INFINITY;
  syncGet().mockImplementation((keys: string[], callback: StorageCallback) => {
    const answer = () =>
      callback(Object.fromEntries(keys.filter((key) => key in store).map((k) => [k, store[k]])));
    if (served >= holdAfter) {
      parked.push(answer);
      return;
    }
    served += 1;
    answer();
  });
  syncSet().mockImplementation((items: Record<string, unknown>, callback?: () => void) => {
    Object.assign(store, items);
    callback?.();
  });
  syncRemove().mockImplementation((key: string | string[], callback?: () => void) => {
    for (const k of Array.isArray(key) ? key : [key]) delete store[k];
    callback?.();
  });
  return {
    store,
    holdFrom(reads: number) {
      holdAfter = served + reads;
    },
    release() {
      holdAfter = Number.POSITIVE_INFINITY;
      for (const answer of parked.splice(0)) answer();
    },
  };
}

async function startRuntime() {
  const { startDefaultModelRuntime } = await import('../runtime');
  const controller = new AbortController();
  const started = startDefaultModelRuntime({ signal: controller.signal });
  return { started, stop: () => controller.abort() };
}

function mountTrigger(pill = 'Flash') {
  const trigger = document.createElement('button');
  trigger.setAttribute('data-test-id', 'bard-mode-menu-button');
  trigger.textContent = pill;
  const click = vi.spyOn(trigger, 'click').mockImplementation(() => {});
  document.body.appendChild(trigger);
  return { trigger, click };
}

/** The classic model menu: one row per model. */
function buildModelMenu(rows: Array<{ name: string; id: string; selected?: boolean }>) {
  const panel = document.createElement('div');
  panel.className = 'mat-mdc-menu-panel gds-mode-switch-menu';
  panel.setAttribute('role', 'menu');
  const items = rows.map(({ name, id, selected }) => {
    const item = document.createElement('button');
    item.setAttribute('role', 'menuitemradio');
    item.setAttribute('data-mode-id', id);
    if (selected) item.setAttribute('aria-checked', 'true');
    item.innerHTML = `<div class="title-and-description"><div class="mode-title">${name}</div></div>`;
    panel.appendChild(item);
    return { item, click: vi.spyOn(item, 'click').mockImplementation(() => {}) };
  });
  return { panel, items };
}

/** The 2026 overlay layout, where a star needs a `.gv-title-wrapper` around the label. */
function buildOverlayMenu() {
  const pane = document.createElement('div');
  pane.className = 'cdk-overlay-pane';
  const item = document.createElement('gem-menu-item');
  item.setAttribute('role', 'menuitem');
  item.setAttribute('data-mode-id', 'pro-id');
  item.innerHTML =
    '<gem-menu-item-content><div class="label-container"><span class="label">Pro</span></div></gem-menu-item-content>';
  pane.appendChild(item);
  return { pane, item };
}

function mountComposer() {
  const main = document.createElement('main');
  const richTextarea = document.createElement('rich-textarea');
  const input = document.createElement('div');
  input.setAttribute('contenteditable', 'true');
  input.setAttribute('role', 'textbox');
  richTextarea.appendChild(input);
  main.appendChild(richTextarea);
  document.body.appendChild(main);
  return { focus: vi.spyOn(input, 'focus').mockImplementation(() => {}) };
}

function buildThinkingMenu() {
  const mainPane = document.createElement('div');
  mainPane.className = 'cdk-overlay-pane';
  const modelItem = document.createElement('gem-menu-item');
  modelItem.setAttribute('role', 'menuitem');
  modelItem.setAttribute('data-mode-id', '56fdd199312815e2');
  modelItem.innerHTML =
    '<gem-menu-item-content><div class="label-container"><span class="label">3 Flash</span></div></gem-menu-item-content>';
  const thinkingRow = document.createElement('gem-menu-item');
  thinkingRow.setAttribute('role', 'menuitem');
  thinkingRow.setAttribute('value', 'thinking_level');
  thinkingRow.setAttribute('aria-haspopup', 'true');
  thinkingRow.setAttribute('aria-controls', 'ng-menu-thinking-stop');
  thinkingRow.innerHTML =
    '<gem-menu-item-content><div class="label-container"><span class="label">Thinking level</span></div></gem-menu-item-content>';
  const rowClick = vi.spyOn(thinkingRow, 'click').mockImplementation(() => {});
  mainPane.append(modelItem, thinkingRow);

  const submenuPane = document.createElement('div');
  submenuPane.className = 'cdk-overlay-pane';
  const submenuList = document.createElement('div');
  submenuList.id = 'ng-menu-thinking-stop';
  const level = (label: string, selected: boolean) => {
    const item = document.createElement('gem-menu-item');
    item.setAttribute('role', 'menuitem');
    if (selected) item.classList.add('selected');
    item.innerHTML = `<gem-menu-item-content><div class="label-container"><span class="label">${label}</span></div></gem-menu-item-content>`;
    submenuList.appendChild(item);
    return vi.spyOn(item, 'click').mockImplementation(() => {});
  };
  const standardClick = level('Standard', true);
  const extendedClick = level('Extended', false);
  submenuPane.appendChild(submenuList);
  return { mainPane, submenuPane, rowClick, standardClick, extendedClick };
}

describe('default model runtime lifecycle', () => {
  setupModelLockerTests();

  it('does not click a model or write the default when the runtime stops while waiting for the model menu', async () => {
    // Unselected: the pick would click the row. Selected: it would close the
    // menu and learn the pill label into storage.
    for (const selected of [false, true]) {
      document.body.innerHTML = '';
      useSyncStore({ gvDefaultModel: { id: 'flash-38', name: '3.8 Flash' } });
      history.replaceState({}, '', '/app');
      const trigger = mountTrigger('Flash');
      const runtime = await startRuntime();
      await runtime.started;

      await vi.advanceTimersByTimeAsync(1000);
      expect(trigger.click).toHaveBeenCalledTimes(1);
      runtime.stop();

      syncSet().mockClear();
      const bodyClick = vi.spyOn(document.body, 'click');
      const { panel, items } = buildModelMenu([{ name: '3.8 Flash', id: 'flash-38', selected }]);
      document.body.appendChild(panel);
      await vi.advanceTimersByTimeAsync(3000);

      expect(items[0].click).not.toHaveBeenCalled();
      expect(bodyClick).not.toHaveBeenCalled();
      expect(syncSet()).not.toHaveBeenCalled();
      bodyClick.mockRestore();
    }
  });

  it('does not open the thinking submenu or write the level when the runtime stops while waiting for it', async () => {
    for (const stopPoint of ['model menu', 'thinking submenu'] as const) {
      document.body.innerHTML = '';
      useSyncStore({ gvDefaultThinkingLevel: { index: 1, label: 'Extended' } });
      history.replaceState({}, '', '/app');
      const trigger = mountTrigger('Flash');
      const menu = buildThinkingMenu();
      if (stopPoint === 'thinking submenu') document.body.appendChild(menu.mainPane);
      const runtime = await startRuntime();
      await runtime.started;

      await vi.advanceTimersByTimeAsync(1000);
      expect(trigger.click).toHaveBeenCalledTimes(1);
      expect(menu.rowClick).toHaveBeenCalledTimes(stopPoint === 'thinking submenu' ? 1 : 0);
      runtime.stop();

      syncSet().mockClear();
      const bodyClick = vi.spyOn(document.body, 'click');
      if (stopPoint === 'model menu') document.body.appendChild(menu.mainPane);
      document.body.appendChild(menu.submenuPane);
      await vi.advanceTimersByTimeAsync(3000);

      expect(menu.rowClick).toHaveBeenCalledTimes(stopPoint === 'thinking submenu' ? 1 : 0);
      expect(menu.extendedClick).not.toHaveBeenCalled();
      expect(menu.standardClick).not.toHaveBeenCalled();
      expect(bodyClick).not.toHaveBeenCalled();
      expect(syncSet()).not.toHaveBeenCalled();
      bodyClick.mockRestore();
    }
  });

  it('does not focus the composer when the runtime stops inside the refocus delay', async () => {
    useSyncStore({ gvDefaultModel: { id: 'pro-id', name: 'Pro' } });
    history.replaceState({}, '', '/app');
    mountTrigger('Flash');
    const { panel, items } = buildModelMenu([{ name: 'Pro', id: 'pro-id' }]);
    document.body.appendChild(panel);
    const { focus } = mountComposer();
    const runtime = await startRuntime();
    await runtime.started;

    await vi.advanceTimersByTimeAsync(1000);
    expect(items[0].click).toHaveBeenCalledTimes(1);
    runtime.stop();
    await vi.advanceTimersByTimeAsync(1000);

    expect(focus).not.toHaveBeenCalled();
  });

  it('does not focus the next page composer when the route changes inside the refocus delay', async () => {
    useSyncStore({ gvDefaultModel: { id: 'pro-id', name: 'Pro' } });
    history.replaceState({}, '', '/app');
    mountTrigger('Flash');
    const { panel, items } = buildModelMenu([{ name: 'Pro', id: 'pro-id' }]);
    document.body.appendChild(panel);
    const { focus } = mountComposer();
    const runtime = await startRuntime();
    await runtime.started;

    await vi.advanceTimersByTimeAsync(1000);
    expect(items[0].click).toHaveBeenCalledTimes(1);
    // The user opens a conversation before the 120ms refocus fires.
    history.pushState({}, '', '/app/0123456789abcdef');
    await vi.advanceTimersByTimeAsync(1000);
    runtime.stop();

    expect(focus).not.toHaveBeenCalled();
  });

  it('keeps the lock loop of a newer chat running when an older pick finishes its label write late', async () => {
    const storage = useSyncStore({ gvDefaultModel: { id: 'flash-38', name: '3.8 Flash' } });
    // Writes wait until released, as a slow sync write would.
    const parkedWrites: Array<() => void> = [];
    syncSet().mockImplementation((items: Record<string, unknown>, callback?: () => void) => {
      parkedWrites.push(() => {
        Object.assign(storage.store, items);
        callback?.();
      });
    });
    history.replaceState({}, '', '/app');
    const trigger = mountTrigger('Flash');
    // Already on the starred model: the pick closes the menu and learns the pill label.
    const { panel } = buildModelMenu([{ name: '3.8 Flash', id: 'flash-38', selected: true }]);
    document.body.appendChild(panel);
    const runtime = await startRuntime();
    await runtime.started;

    await vi.advanceTimersByTimeAsync(1000);
    expect(trigger.click).toHaveBeenCalledTimes(1);
    expect(parkedWrites).toHaveLength(1);

    // Another new chat starts its own lock loop while that write is in flight.
    history.pushState({}, '', '/u/1/app');
    await vi.advanceTimersByTimeAsync(600);
    for (const write of parkedWrites.splice(0)) write();
    await vi.advanceTimersByTimeAsync(0);
    trigger.click.mockClear();

    await vi.advanceTimersByTimeAsync(1000);
    runtime.stop();
    expect(trigger.click).toHaveBeenCalledTimes(1);
  });

  it('reports a pick cancelled when its lock loop ended during the label write', async () => {
    const storage = useSyncStore({ gvDefaultModel: { id: 'flash-38', name: '3.8 Flash' } });
    const parkedWrites: Array<() => void> = [];
    syncSet().mockImplementation((items: Record<string, unknown>, callback?: () => void) => {
      parkedWrites.push(() => {
        Object.assign(storage.store, items);
        callback?.();
      });
    });
    mountTrigger('Flash');
    const { panel } = buildModelMenu([{ name: '3.8 Flash', id: 'flash-38', selected: true }]);
    document.body.appendChild(panel);
    const { DefaultModelPreferences } = await import('../preferences');
    const { ModelPicker } = await import('../modelPicker');
    const preferences = new DefaultModelPreferences();
    await preferences.reloadDefaults();
    let current = true;
    const stop = vi.fn();

    const picked = new ModelPicker(preferences).selectModel(preferences.model!, {
      isCurrent: () => current,
      shouldYield: () => false,
      stop,
      failed: vi.fn(),
      resetFailures: vi.fn(),
      focusInput: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(parkedWrites).toHaveLength(1);
    current = false;
    for (const write of parkedWrites.splice(0)) write();

    await expect(picked).resolves.toBe('cancelled');
  });

  it('ignores a pick result that arrives after a newer chat started its own lock loop', async () => {
    useSyncStore({ gvDefaultModel: { id: 'pro-id', name: 'Pro' } });
    history.replaceState({}, '', '/app');
    mountTrigger('Flash');
    const { DefaultModelPreferences } = await import('../preferences');
    const { ModelPicker } = await import('../modelPicker');
    const { DefaultModelAutoApply } = await import('../autoApply');
    const { createToaster } = await import('@/core/ui/toast/toaster');
    const preferences = new DefaultModelPreferences();
    const picker = new ModelPicker(preferences);
    // A pick that answers whenever the test says so.
    const answers: Array<(result: 'already-selected' | 'switched') => void> = [];
    const selectModel = vi
      .spyOn(picker, 'selectModel')
      .mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    const toaster = createToaster();
    const autoApply = new DefaultModelAutoApply(preferences, picker, toaster);
    autoApply.start();

    await vi.advanceTimersByTimeAsync(1000);
    expect(selectModel).toHaveBeenCalledTimes(1);
    history.pushState({}, '', '/u/1/app');
    await vi.advanceTimersByTimeAsync(1600);
    expect(selectModel).toHaveBeenCalledTimes(2);

    answers[0]('already-selected');
    // The newer loop ticks again only once its own pick settles; ticks never overlap.
    answers[1]('switched');
    await vi.advanceTimersByTimeAsync(1000);
    autoApply.stop();
    toaster.destroy();
    expect(selectModel).toHaveBeenCalledTimes(3);
  });

  it('starts no lock loop after the runtime stops during the preferences load', async () => {
    // The runtime's own load, then the read each new-chat check makes.
    for (const readsBeforeStop of [0, 2]) {
      document.body.innerHTML = '';
      const storage = useSyncStore({ gvDefaultModel: { id: 'pro-id', name: 'Pro' } });
      history.replaceState({}, '', '/app');
      const trigger = mountTrigger('Flash');
      storage.holdFrom(readsBeforeStop);
      const runtime = await startRuntime();
      await vi.advanceTimersByTimeAsync(0);
      runtime.stop();
      storage.release();
      await runtime.started;

      await vi.advanceTimersByTimeAsync(5000);
      expect(trigger.click).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('stops retrying star injection after the runtime stops', async () => {
    useSyncStore({});
    history.replaceState({}, '', '/app/0123456789abcdef');
    const runtime = await startRuntime();
    await runtime.started;
    // A model menu whose rows have not rendered yet keeps the injection retrying.
    const { panel } = buildModelMenu([]);
    panel.innerHTML = '<div class="mode-title"></div>';
    document.body.appendChild(panel);
    await vi.advanceTimersByTimeAsync(120);

    runtime.stop();

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes every star it injected on stop, including stars in a detached menu pane that comes back', async () => {
    useSyncStore({});
    history.replaceState({}, '', '/app/0123456789abcdef');
    const runtime = await startRuntime();
    await runtime.started;
    const open = buildModelMenu([{ name: 'Pro', id: 'pro-id' }]);
    const detached = buildModelMenu([{ name: 'Flash', id: 'flash-id' }]);
    document.body.append(open.panel, detached.panel);
    await vi.advanceTimersByTimeAsync(200);
    expect(document.querySelectorAll('.gv-default-star-btn')).toHaveLength(2);

    detached.panel.remove();
    runtime.stop();
    document.body.appendChild(detached.panel);
    await vi.advanceTimersByTimeAsync(200);

    expect(document.querySelectorAll('.gv-default-star-btn')).toHaveLength(0);
  });

  it('restores the model title markup it wrapped when the runtime stops', async () => {
    useSyncStore({});
    history.replaceState({}, '', '/app/0123456789abcdef');
    const runtime = await startRuntime();
    await runtime.started;
    const { pane, item } = buildOverlayMenu();
    const original = pane.innerHTML;
    document.body.appendChild(pane);
    await vi.advanceTimersByTimeAsync(200);
    expect(item.querySelector('.gv-title-wrapper .gv-default-star-btn')).not.toBeNull();

    runtime.stop();

    expect(pane.innerHTML).toBe(original);
  });

  it('leaves no hover or focus listener on host menu items after five on and off cycles', async () => {
    useSyncStore({});
    history.replaceState({}, '', '/app/0123456789abcdef');
    const { pane, item } = buildOverlayMenu();
    const added: Array<{ type: string; signal?: AbortSignal }> = [];
    const addEventListener = item.addEventListener.bind(item);
    item.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      added.push({ type, signal: typeof options === 'object' ? options.signal : undefined });
      addEventListener(type, listener, options);
    }) as typeof item.addEventListener;
    const hoverTypes = ['mouseenter', 'mouseleave', 'focusin', 'focusout'];
    const openHoverListeners = () =>
      added.filter(({ type, signal }) => hoverTypes.includes(type) && !signal?.aborted).length;

    for (let cycle = 0; cycle < 5; cycle += 1) {
      const runtime = await startRuntime();
      await runtime.started;
      document.body.appendChild(pane);
      await vi.advanceTimersByTimeAsync(200);
      expect(openHoverListeners()).toBe(4);
      pane.remove();
      runtime.stop();
    }

    expect(openHoverListeners()).toBe(0);
  });

  it('ignores a click on a star left from a stopped runtime without writing the default', async () => {
    useSyncStore({});
    history.replaceState({}, '', '/app/0123456789abcdef');
    const runtime = await startRuntime();
    await runtime.started;
    const { panel, items } = buildModelMenu([{ name: 'Pro', id: 'pro-id' }]);
    document.body.appendChild(panel);
    await vi.advanceTimersByTimeAsync(200);
    const star = items[0].item.querySelector<HTMLButtonElement>('.gv-default-star-btn')!;
    expect(star).not.toBeNull();

    runtime.stop();
    star.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(syncSet()).not.toHaveBeenCalled();
    expect(syncRemove()).not.toHaveBeenCalled();
    expect(toastDriver.all()).toEqual([]);
  });

  it('keeps the starred default model and thinking level stored when the runtime stops', async () => {
    const stored = {
      gvDefaultModel: { id: 'pro-id', name: 'Pro' },
      gvDefaultThinkingLevel: { index: 1, label: 'Extended' },
    };
    const storage = useSyncStore(stored);
    history.replaceState({}, '', '/app/0123456789abcdef');
    const runtime = await startRuntime();
    await runtime.started;
    const { panel } = buildModelMenu([{ name: 'Pro', id: 'pro-id' }]);
    document.body.appendChild(panel);
    await vi.advanceTimersByTimeAsync(200);
    expect(panel.querySelector('.gv-default-star-btn.is-default')).not.toBeNull();

    runtime.stop();
    await vi.advanceTimersByTimeAsync(1000);

    expect(storage.store).toEqual(stored);
  });

  it('starts the runtime again when it is turned off and on before the first start finished', async () => {
    const storage = useSyncStore({ gvDefaultModel: { id: 'pro-id', name: 'Pro' } });
    history.replaceState({}, '', '/app');
    const trigger = mountTrigger('Flash');
    storage.holdFrom(0);
    const first = await startRuntime();
    first.stop();
    const second = await startRuntime();
    storage.release();
    await Promise.all([first.started, second.started]);

    const { panel, items } = buildModelMenu([{ name: 'Pro', id: 'pro-id' }]);
    document.body.appendChild(panel);
    await vi.advanceTimersByTimeAsync(1000);

    expect(trigger.click).toHaveBeenCalledTimes(1);
    expect(items[0].click).toHaveBeenCalledTimes(1);
    expect(items[0].item.querySelectorAll('.gv-default-star-btn')).toHaveLength(1);
    second.stop();
  });

  it('scope teardown restores menu markup and prevents stars in a later pane', async () => {
    useSyncStore({});
    history.replaceState({}, '', '/app/0123456789abcdef');
    const { PluginScope } = await import('@/features/plugins/runtime/pluginScope');
    const { activateGeminiDefaultModel } = await import('../pluginHandler');
    const scope = new PluginScope();
    await activateGeminiDefaultModel(scope);
    const { pane, item } = buildOverlayMenu();
    const original = pane.innerHTML;
    document.body.appendChild(pane);
    await vi.advanceTimersByTimeAsync(200);
    expect(item.querySelector('.gv-default-star-btn')).not.toBeNull();
    await scope.dispose();

    expect(pane.innerHTML).toBe(original);
    expect(vi.getTimerCount()).toBe(0);
    const next = buildModelMenu([{ name: 'Flash', id: 'flash-id' }]);
    document.body.appendChild(next.panel);
    await vi.advanceTimersByTimeAsync(200);
    expect(document.querySelectorAll('.gv-default-star-btn')).toHaveLength(0);
  });
});
