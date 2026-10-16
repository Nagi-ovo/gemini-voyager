import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings } from '@/features/plugins/types';

import { type LifecycleHarness, installLifecycleHarness } from '../../__tests__/lifecycleHarness';
import { activateAIStudioSidebarWidth, updateAIStudioSidebarWidthSettings } from '../pluginHandler';

const WIDTH = StorageKeys.AISTUDIO_SIDEBAR_WIDTH;
const HANDLE = '.gv-sidebar-resize-handle';
let scope: PluginScope;
let harness: LifecycleHarness;
let nav: HTMLElement;

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function activate(widthPx = 280): void {
  activateAIStudioSidebarWidth(scope, { widthPx });
}

function drag(distance: number): void {
  nav.querySelector(HANDLE)!.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 + distance }));
  document.dispatchEvent(new MouseEvent('mouseup'));
}

beforeEach(() => {
  document.body.innerHTML = '<div class="nav-content v3-left-nav expanded"></div>';
  document.body.style.cssText = '';
  localStorage.clear();
  nav = document.querySelector('.nav-content')!;
  harness = installLifecycleHarness();
  scope = new PluginScope();
});

afterEach(async () => {
  await scope.dispose();
  harness.restore();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.body.style.cssText = '';
  localStorage.clear();
});

describe('AI Studio sidebar width plugin handler', () => {
  it('applies all expanded dimensions and updates width without replacing the drag handle', () => {
    activate(420);
    const handle = nav.querySelector(HANDLE);
    expect(handle).not.toBeNull();
    expect(nav.style.width).toBe('420px');
    expect(nav.style.minWidth).toBe('420px');
    expect(nav.style.maxWidth).toBe('420px');
    expect(nav.style.flex).toBe('0 0 420px');
    updateAIStudioSidebarWidthSettings({ widthPx: 431.6 });
    expect(nav.style.width).toBe('432px');
    expect(nav.querySelector(HANDLE)).toBe(handle);
    updateAIStudioSidebarWidthSettings({ widthPx: 900 });
    expect(nav.style.width).toBe('600px');
    updateAIStudioSidebarWidthSettings({ widthPx: 100 });
    expect(nav.style.width).toBe('240px');
    const nonnumericUpdates: PluginSettings[] = [{}, { widthPx: '480' }, { widthPx: false }];
    for (const settings of nonnumericUpdates) {
      updateAIStudioSidebarWidthSettings(settings);
      expect(nav.style.width).toBe('240px');
    }
  });

  it('restores native inline dimensions while collapsed and applies the latest width on expansion', async () => {
    nav.style.cssText =
      'width: 72px; min-width: 64px; max-width: 80px; flex: 1 1 72px; position: sticky;';
    activate(400);
    nav.classList.remove('expanded');
    await flush();
    expect(nav.style.width).toBe('72px');
    expect(nav.style.minWidth).toBe('64px');
    expect(nav.style.maxWidth).toBe('80px');
    expect(nav.style.flex).toBe('1 1 72px');
    expect((nav.querySelector(HANDLE) as HTMLElement).style.display).toBe('none');
    updateAIStudioSidebarWidthSettings({ widthPx: 500 });
    expect(nav.style.width).toBe('72px');
    nav.classList.add('expanded');
    await flush();
    expect(nav.style.width).toBe('500px');
    expect((nav.querySelector(HANDLE) as HTMLElement).style.display).toBe('block');
    await scope.dispose();
    expect(nav.style.position).toBe('sticky');
    expect(nav.style.width).toBe('72px');
  });

  it.each([
    [50, 330],
    [-500, 240],
    [900, 600],
  ])(
    'persists a %s px drag to the existing sync and localStorage width key',
    async (distance, expected) => {
      activate();
      drag(distance);
      await flush();
      expect(nav.style.width).toBe(`${expected}px`);
      expect(harness.storage.sync.get(WIDTH)).toBe(expected);
      expect(localStorage.getItem(WIDTH)).toBe(String(expected));
      expect(document.body.style.cursor).toBe('');
      expect(document.body.style.userSelect).toBe('');
    },
  );

  it('restores native nav and body styles immediately when disabled during a drag', async () => {
    nav.style.cssText =
      'width: 300px !important; min-width: 90px; max-width: 700px; flex: 1 1 auto; position: sticky;';
    document.body.style.cursor = 'crosshair';
    document.body.style.userSelect = 'text';
    activate(420);
    nav.querySelector(HANDLE)!.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 140 }));
    const disposing = scope.dispose();
    expect(nav.querySelector(HANDLE)).toBeNull();
    expect(nav.style.width).toBe('300px');
    expect(nav.style.getPropertyPriority('width')).toBe('important');
    expect(nav.style.minWidth).toBe('90px');
    expect(nav.style.maxWidth).toBe('700px');
    expect(nav.style.flex).toBe('1 1 auto');
    expect(nav.style.position).toBe('sticky');
    expect(document.body.style.cursor).toBe('crosshair');
    expect(document.body.style.userSelect).toBe('text');
    await disposing;
    document.dispatchEvent(new MouseEvent('mouseup'));
    await flush();
    expect(harness.storage.sync.has(WIDTH)).toBe(false);
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(harness.ledger.openListeners()).toEqual([]);
    await expect(scope.dispose()).resolves.toBeUndefined();
    scope = new PluginScope();
    activate(460);
    expect(nav.querySelectorAll(HANDLE)).toHaveLength(1);
  });

  it('keeps a local width copy and warns when sync persistence fails', async () => {
    const error = new Error('Sync storage quota exceeded');
    vi.mocked(chrome.storage.sync.set).mockImplementationOnce(() => {
      throw error;
    });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    activate();
    drag(50);
    await flush();
    expect(localStorage.getItem(WIDTH)).toBe('330');
    expect(warn).toHaveBeenCalledWith('Failed to save AI Studio sidebar width', { error });
  });

  it('keeps a local width copy without warning when the extension context is invalidated', async () => {
    vi.mocked(chrome.storage.sync.set).mockImplementationOnce(() => {
      throw new Error('Extension context invalidated.');
    });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    activate();
    drag(50);
    await flush();
    expect(localStorage.getItem(WIDTH)).toBe('330');
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not rescan the document when unrelated chat content streams or is removed', async () => {
    activate(410);
    await flush();
    const handle = nav.querySelector(HANDLE);
    const query = vi.spyOn(document, 'querySelector');
    const chat = document.createElement('main');
    document.body.append(chat);
    await flush();
    chat.append(document.createElement('p'));
    await flush();
    chat.firstChild!.textContent = 'Streaming response';
    await flush();
    chat.remove();
    await flush();
    expect(query).not.toHaveBeenCalled();
    expect(nav.querySelector(HANDLE)).toBe(handle);
    expect(nav.style.width).toBe('410px');
  });

  it('restores the drag handle when the host removes it', async () => {
    activate(410);
    nav.querySelector(HANDLE)!.remove();
    await flush();
    expect(nav.querySelectorAll(HANDLE)).toHaveLength(1);
    drag(50);
    await flush();
    expect(nav.style.width).toBe('460px');
    expect(harness.storage.sync.get(WIDTH)).toBe(460);
  });

  it('remounts when the host replaces the nav parent', async () => {
    const parent = document.createElement('aside');
    nav.replaceWith(parent);
    parent.append(nav);
    activate(410);
    const oldNav = nav;
    const replacement = document.createElement('aside');
    replacement.innerHTML = '<div class="nav-content v3-left-nav expanded"></div>';
    nav = replacement.firstElementChild as HTMLElement;
    parent.replaceWith(replacement);
    await flush();
    expect(oldNav.querySelector(HANDLE)).toBeNull();
    expect(oldNav.style.width).toBe('');
    expect(nav.querySelectorAll(HANDLE)).toHaveLength(1);
    expect(nav.style.width).toBe('410px');
  });

  it('moves the layout lifecycle to a rebuilt nav and leaves the old nav restored', async () => {
    nav.style.width = '300px';
    activate(410);
    const oldNav = nav;
    nav = document.createElement('div');
    nav.className = 'nav-content v3-left-nav expanded';
    oldNav.replaceWith(nav);
    await flush();
    expect(oldNav.querySelector(HANDLE)).toBeNull();
    expect(oldNav.style.width).toBe('300px');
    expect(nav.style.width).toBe('410px');
    expect(nav.querySelectorAll(HANDLE)).toHaveLength(1);
    await scope.dispose();
    const lateNav = document.createElement('div');
    lateNav.className = nav.className;
    nav.replaceWith(lateNav);
    await flush();
    expect(lateNav.querySelector(HANDLE)).toBeNull();
    expect(lateNav.style.width).toBe('');
  });

  it('removes the handle and restores native width even while an unrelated disposer is pending', async () => {
    nav.style.width = '300px';
    activate(420);
    let finishDisposer: () => void = () => {};
    scope.effect(
      () => () => new Promise<void>((resolve) => (finishDisposer = resolve)),
      'unrelated-pending-cleanup',
    );
    const disposing = scope.dispose();
    try {
      expect(nav.querySelector(HANDLE)).toBeNull();
      expect(nav.style.width).toBe('300px');
    } finally {
      finishDisposer();
      await disposing;
    }
  });
});
