import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { showExportNotice } from '@/features/export/ui/exportToasts';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { getTranslation, setCachedLanguage } from '@/utils/i18n';

import { type LifecycleHarness, installLifecycleHarness } from '../../__tests__/lifecycleHarness';
import { CANVAS_MARKDOWN_BUTTON_CLASS } from '../menuInjection';
import { activateGeminiCanvasCopy } from '../pluginHandler';

vi.mock('@/utils/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/i18n')>()),
  getTranslation: vi.fn(async (key: string) => key),
}));
vi.mock('@/features/export/ui/exportToasts', () => ({ showExportNotice: vi.fn() }));

let scope: PluginScope;
let harness: LifecycleHarness;
const selector = `.${CANVAS_MARKDOWN_BUTTON_CLASS}`;
const buttons = () => document.querySelectorAll<HTMLElement>(selector);
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function setup(ready = true): HTMLElement {
  document.body.innerHTML = `
    <immersive-editor><div class="ProseMirror"><h1>Document</h1><p>Hello <strong>world</strong></p></div></immersive-editor>
    <share-button data-test-id="consolidated-share-button">
      <button aria-haspopup="menu" aria-expanded="true" aria-controls="canvas-menu"></button>
    </share-button>
    <div id="canvas-menu" class="mat-mdc-menu-panel" role="menu"></div>`;
  const panel = document.getElementById('canvas-menu')!;
  if (ready) fillMenu(panel);
  return panel;
}

function fillMenu(panel: HTMLElement): void {
  panel.innerHTML =
    '<div class="mat-mdc-menu-content"><button class="mat-mdc-menu-item" role="menuitem"><mat-icon fonticon="share"></mat-icon><span class="mat-mdc-menu-item-text">Share</span></button></div>';
}

async function mount(): Promise<void> {
  activateGeminiCanvasCopy(scope);
  await vi.advanceTimersByTimeAsync(30);
}

beforeEach(() => {
  vi.useFakeTimers();
  setCachedLanguage('en');
  vi.mocked(getTranslation).mockImplementation(async (key) => key);
  vi.mocked(showExportNotice).mockClear();
  vi.stubGlobal(
    'navigator',
    Object.assign(Object.create(navigator), {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    }),
  );
  harness = installLifecycleHarness();
  scope = new PluginScope();
});

afterEach(async () => {
  await scope.dispose();
  vi.unstubAllGlobals();
  harness.restore();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('Canvas copy plugin lifecycle', () => {
  it('copies converted Markdown once and closes the share menu', async () => {
    setup();
    await mount();
    expect(buttons()).toHaveLength(1);
    buttons()[0].click();
    await flush();
    expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(
      '# Document\n\nHello **world**',
    );
    expect(document.getElementById('canvas-menu')).toBeNull();
    expect(showExportNotice).toHaveBeenCalledWith('canvasExportCopied', { tone: 'success' });
  });

  it('warns about empty Canvas content without writing the clipboard', async () => {
    setup();
    document.querySelector('.ProseMirror')!.innerHTML = '';
    await mount();
    buttons()[0].click();
    await flush();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(showExportNotice).toHaveBeenCalledWith('canvasExportEmpty', { tone: 'warning' });
  });

  it('reports a clipboard failure', async () => {
    setup();
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));
    await mount();
    buttons()[0].click();
    await flush();
    expect(showExportNotice).toHaveBeenCalledWith('canvasExportFailed', { tone: 'error' });
  });

  it('retries an unfinished menu and never duplicates a button on DOM changes', async () => {
    const panel = setup(false);
    await mount();
    expect(buttons()).toHaveLength(0);
    fillMenu(panel);
    await vi.advanceTimersByTimeAsync(80);
    expect(buttons()).toHaveLength(1);
    panel.append(document.createElement('span'));
    await vi.advanceTimersByTimeAsync(800);
    expect(buttons()).toHaveLength(1);
  });

  it('finds a menu added after activation and leaves unrelated menus alone', async () => {
    const panel = setup();
    panel.remove();
    await mount();
    document.body.append(panel);
    await vi.advanceTimersByTimeAsync(30);
    expect(buttons()).toHaveLength(1);
    document.body.insertAdjacentHTML(
      'beforeend',
      '<deep-research-immersive-panel></deep-research-immersive-panel>',
    );
    panel.querySelector(selector)!.remove();
    panel.append(document.createElement('span'));
    await vi.advanceTimersByTimeAsync(800);
    expect(buttons()).toHaveLength(0);
  });

  it('disable synchronously removes buttons and releases observers and listeners', async () => {
    setup();
    await mount();
    const retainedButton = buttons()[0];
    const disposal = scope.dispose();
    expect(buttons()).toHaveLength(0);
    await disposal;
    retainedButton.click();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(harness.ledger.openObservers()).toHaveLength(0);
    expect(harness.ledger.openStorageListeners()).toBe(0);
    expect(harness.ledger.openListeners({ includeDetached: true })).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('teardown during a pending retry cannot inject later', async () => {
    const panel = setup(false);
    await mount();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await scope.dispose();
    fillMenu(panel);
    await vi.advanceTimersByTimeAsync(1000);
    expect(buttons()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('detaching a menu releases its button listener and reopening injects just once', async () => {
    const panel = setup();
    await mount();
    const oldButton = buttons()[0];
    panel.remove();
    await flush();
    expect(panel.querySelector(selector)).toBeNull();
    oldButton.click();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    document.body.append(panel);
    await vi.advanceTimersByTimeAsync(30);
    expect(buttons()).toHaveLength(1);
  });

  it('an already open menu has the cached language on its first injection', () => {
    setCachedLanguage('fr');
    setup();
    activateGeminiCanvasCopy(scope);
    // Do not flush promises: the first visible label must already be translated.
    vi.advanceTimersByTime(30);
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0].textContent).toContain('Copier en Markdown');
    expect(buttons()[0].getAttribute('aria-label')).toBe(
      'Copier le contenu du Canvas au format Markdown',
    );
  });

  it('open menu labels follow cached language changes and stop after teardown', async () => {
    setup();
    await mount();
    const oldButton = buttons()[0];
    setCachedLanguage('fr');
    expect(oldButton.textContent).toContain('Copier en Markdown');
    expect(oldButton.getAttribute('aria-label')).toBe(
      'Copier le contenu du Canvas au format Markdown',
    );
    await scope.dispose();
    setCachedLanguage('ja');
    expect(oldButton.textContent).toContain('Copier en Markdown');
    scope = new PluginScope();
    await mount();
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0].textContent).toContain('Markdown としてコピー');
  });

  it.each([undefined, {}])(
    'activation tolerates an unavailable storage API (%s)',
    async (storage) => {
      setup();
      vi.stubGlobal('chrome', { ...chrome, storage });
      await mount();
      expect(buttons()).toHaveLength(1);
      setCachedLanguage('fr');
      expect(buttons()[0].textContent).toContain('Copier en Markdown');
    },
  );

  it('a remount while the old scope drains still shows one button', async () => {
    setup();
    await mount();
    const oldButton = buttons()[0];
    let finishCleanup!: () => void;
    const cleanupBarrier = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    scope.effect(() => () => cleanupBarrier, 'delayed sibling cleanup');
    const disposal = scope.dispose();
    scope = new PluginScope();
    try {
      // Mount before the old ledger settles, as the host does on remount.
      await mount();
    } finally {
      finishCleanup();
      await disposal;
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0]).not.toBe(oldButton);
    buttons()[0].click();
    await flush();
    expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(
      '# Document\n\nHello **world**',
    );
  });

  it('late clipboard completion after disable does not show a notice', async () => {
    let finish!: () => void;
    vi.mocked(navigator.clipboard.writeText).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    setup();
    await mount();
    buttons()[0].click();
    await scope.dispose();
    finish();
    await flush();
    expect(showExportNotice).not.toHaveBeenCalled();
  });
});
