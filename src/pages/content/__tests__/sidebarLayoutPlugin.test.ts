// @vitest-environment-options { "url": "https://gemini.google.com/u/0/app/test" }
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';

import { startGeminiChatAppearance } from '../appearanceStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { keepSidebarExpanded } from '../sidebarAutoHide';
import { SIDEBAR_WIDTH_STYLE_ID } from '../sidebarWidth/pluginHandler';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

const WIDTH = StorageKeys.SIDEBAR_WIDTH;
const FEATURES = [
  {
    name: 'sidebar width',
    id: OFFICIAL_PLUGIN_IDS.geminiSidebarWidth,
    key: StorageKeys.SIDEBAR_WIDTH_ENABLED,
  },
  {
    name: 'auto-hide sidebar',
    id: OFFICIAL_PLUGIN_IDS.geminiSidebarAutoHide,
    key: StorageKeys.GV_SIDEBAR_AUTO_HIDE,
  },
  {
    name: 'fully hide sidebar',
    id: OFFICIAL_PLUGIN_IDS.geminiSidebarFullHide,
    key: StorageKeys.GV_SIDEBAR_FULL_HIDE,
  },
] as const;
const [width, auto, full] = FEATURES;
let harness: LifecycleHarness;
let host: PluginHost | null;
let content: HTMLElement;
let sidenav: HTMLElement;
let toggle: HTMLButtonElement;
const releases: (() => void)[] = [];

async function flush(): Promise<void> {
  for (let i = 0; i < 80; i++) await Promise.resolve();
}
async function tick(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}
async function start(admit = true): Promise<void> {
  const admission = createOfficialAdmission();
  if (admit) await startGeminiChatAppearance(admission);
  admission.close();
  host = new PluginHost({
    url: location.href,
    sources: [new BuiltinPluginSource()],
    doc: document,
    admission,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
  await host.start();
  await flush();
}
function popupWrites(values: Record<string, unknown>): void {
  const changes: Record<string, { newValue?: unknown }> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) harness.storage.sync.delete(key);
    else harness.storage.sync.set(key, value);
    changes[key] = { newValue: value };
  }
  harness.emitStorageChange(changes, 'sync');
}
const mounted = (id: string) =>
  host?.getStatuses().find((entry) => entry.id === id)?.kind === 'mounted';
const sheet = () => document.getElementById(SIDEBAR_WIDTH_STYLE_ID);
const hideSheet = () => document.getElementById('gv-sidebar-auto-hide-style');
const collapsed = () => content.classList.contains('collapsed');
const listenerShape = () =>
  harness.ledger
    .openListeners()
    .map((entry) => entry.replace(/:#\d+$/, ''))
    .sort();

beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = '';
  document.body.className = '';
  document.body.innerHTML =
    '<main></main><bard-sidenav><side-navigation-content><div></div></side-navigation-content></bard-sidenav><button data-test-id="side-nav-menu-button"></button>';
  sidenav = document.querySelector('bard-sidenav')!;
  content = sidenav.querySelector('side-navigation-content > div')!;
  toggle = document.querySelector('button')!;
  vi.spyOn(sidenav, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 320,
    bottom: 800,
    width: 320,
    height: 800,
    toJSON: () => ({}),
  });
  toggle.addEventListener('click', () => content.classList.toggle('collapsed'));
  harness = installLifecycleHarness();
  host = null;
  harness.storage.local.set(
    StorageKeys.PLUGINS_STATE,
    Object.fromEntries(
      FEATURES.map(({ id }) => [id, { enabled: true, installedAt: 1, settings: { widthPx: 500 } }]),
    ),
  );
});
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  host?.stop();
  await flush();
  harness.restore();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('sidebar layout through the real builtin source and plugin host', () => {
  describe.each(FEATURES)('$name', ({ id, key }) => {
    it.each([undefined, false, true])(
      'keeps the native switch reading for %s despite stale plugin state',
      async (stored) => {
        if (stored !== undefined) harness.storage.sync.set(key, stored);
        await start();
        expect(mounted(id)).toBe(stored === true);
        if (stored !== true) {
          expect(sheet()).toBeNull();
          expect(hideSheet()).toBeNull();
          expect(harness.ledger.openObservers()).toEqual([]);
        }
      },
    );
    it('follows live on, off, on and removal without accumulating listeners', async () => {
      await start();
      popupWrites({ [key]: true });
      await flush();
      expect(mounted(id)).toBe(true);
      const listeners = listenerShape();
      const observers = harness.ledger.openObservers();
      const storage = harness.ledger.openStorageListeners();
      // Arm the page-mutation debounce before tearing down.
      document.querySelector('main')!.append(document.createElement('div'));
      await flush();
      popupWrites({ [key]: false });
      await flush();
      await tick(500);
      expect(mounted(id)).toBe(false);
      expect(sheet()).toBeNull();
      expect(hideSheet()).toBeNull();
      expect(harness.ledger.openObservers()).toEqual([]);
      popupWrites({ [key]: true });
      await flush();
      expect(mounted(id)).toBe(true);
      expect(listenerShape()).toEqual(listeners);
      expect(harness.ledger.openObservers()).toEqual(observers);
      expect(harness.ledger.openStorageListeners()).toBe(storage);
      popupWrites({ [key]: undefined });
      await flush();
      expect(mounted(id)).toBe(false);
      expect(harness.storage.sync.has(key)).toBe(false);
    });
    it('does nothing when the native start point did not admit it', async () => {
      harness.storage.sync.set(key, true);
      await start(false);
      expect(mounted(id)).toBe(false);
      expect(sheet()).toBeNull();
      expect(hideSheet()).toBeNull();
      expect(harness.ledger.openObservers()).toEqual([]);
    });
  });

  it.each([
    [390, '390px'],
    [26, '26vw'],
    [700, '540px'],
  ])('derives a missing width switch from %s and preserves its unit', async (stored, css) => {
    harness.storage.sync.set(WIDTH, stored);
    await start();
    expect(mounted(width.id)).toBe(true);
    expect(sheet()?.textContent).toContain(css);
    expect(harness.storage.sync.get(width.key)).toBe(true);
    popupWrites({ [width.key]: undefined });
    await flush();
    expect(mounted(width.id)).toBe(false);
    expect(harness.storage.sync.has(width.key)).toBe(false);
  });

  it('keeps explicit width off despite customization, and applies live widths in place only when on', async () => {
    harness.storage.sync.set(WIDTH, 420);
    harness.storage.sync.set(width.key, false);
    await start();
    expect(sheet()).toBeNull();
    popupWrites({ [width.key]: true });
    await flush();
    const style = sheet();
    expect(style?.textContent).toContain('420px');
    popupWrites({ [WIDTH]: 260 });
    await flush();
    expect(sheet()).toBe(style);
    expect(style?.textContent).toContain('260px');
    popupWrites({ [WIDTH]: undefined });
    await flush();
    expect(style?.textContent).toContain('260px');
    popupWrites({ [WIDTH]: '400' });
    await flush();
    expect(sheet()).toBe(style);
    expect(style?.textContent).toContain('400px');
    popupWrites({ [WIDTH]: null });
    await flush();
    expect(style?.textContent).toContain('15vw');
  });

  it.each([
    [auto, full],
    [full, auto],
  ])(
    'releasing $0.name keeps $1.name and the shared controller alive',
    async (released, retained) => {
      harness.storage.sync.set(auto.key, true);
      harness.storage.sync.set(full.key, true);
      await start();
      const style = hideSheet();
      const observers = harness.ledger.openObservers();
      popupWrites({ [released.key]: false });
      await flush();
      expect(mounted(released.id)).toBe(false);
      expect(mounted(retained.id)).toBe(true);
      expect(hideSheet()).toBe(style);
      expect(harness.ledger.openObservers()).toEqual(observers);
      // The surviving controller still honors the same public coachmark API.
      content.classList.add('collapsed');
      const release = keepSidebarExpanded();
      releases.push(release);
      expect(collapsed()).toBe(false);
      sidenav.dispatchEvent(new Event('mouseleave'));
      await tick(2000);
      expect(collapsed()).toBe(false);
      popupWrites({ [retained.key]: false });
      await flush();
      expect(hideSheet()).toBeNull();
      expect(harness.ledger.openObservers()).toEqual([]);
    },
  );

  it.each([auto, full])(
    'a coachmark lease works with only $name and survives off/on',
    async ({ key }) => {
      harness.storage.sync.set(key, true);
      content.classList.add('collapsed');
      const release = keepSidebarExpanded();
      releases.push(release);
      await start();
      expect(collapsed()).toBe(false);
      sidenav.dispatchEvent(new Event('mouseleave'));
      await tick(2000);
      expect(collapsed()).toBe(false);
      popupWrites({ [key]: false });
      await flush();
      content.classList.add('collapsed');
      popupWrites({ [key]: true });
      await flush();
      expect(collapsed()).toBe(false);
      release();
      if (key === auto.key) {
        sidenav.dispatchEvent(new Event('mouseleave'));
        await tick(600);
        expect(collapsed()).toBe(true);
      } else {
        toggle.click();
        await tick(500);
        expect(collapsed()).toBe(true);
        expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsed')).toBe(
          true,
        );
      }
    },
  );

  it('the layout start point only admits; it installs no styles or listeners itself', async () => {
    for (const { key } of FEATURES) harness.storage.sync.set(key, true);
    const admission = createOfficialAdmission();
    await startGeminiChatAppearance(admission);
    admission.close();
    for (const { id } of FEATURES) expect(admission.stateOf(id)).toBe('admitted');
    expect(document.querySelectorAll('style')).toHaveLength(0);
    expect(harness.ledger.activity()).toBe(0);
  });
});
