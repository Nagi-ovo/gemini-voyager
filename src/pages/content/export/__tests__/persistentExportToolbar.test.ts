import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  mountPersistentExportToolbar,
  openPersistentExportToolbar,
} from '../persistentExportToolbar';

afterEach(() => {
  document.querySelectorAll('.gv-persistent-export-toolbar').forEach((n) => n.remove());
  document.body
    .querySelectorAll(
      '[data-test-id="upgrade-button"], top-bar-actions, #conversation-header-actions',
    )
    .forEach((n) => n.remove());
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementsFromPoint');
});

function mockRect(element: Element, rect: Partial<DOMRect>): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.left ?? 0,
      y: rect.top ?? 0,
      top: rect.top ?? 0,
      left: rect.left ?? 0,
      right: rect.right ?? 0,
      bottom: rect.bottom ?? 0,
      width: rect.width ?? 0,
      height: rect.height ?? 0,
      toJSON: () => ({}),
    }),
  });
}

function stubElementsFromPoint(hit: (x: number, y: number) => Element[]): void {
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: hit,
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

describe('persistentExportToolbar', () => {
  it('mounts a top-right export button with label and tooltip', () => {
    const onClick = vi.fn();
    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick,
    });
    expect(document.querySelector('.gv-persistent-export-toolbar')).not.toBeNull();
    expect(handle.root.classList.contains('gv-persistent-export-toolbar')).toBe(true);
    expect(handle.button.getAttribute('aria-label')).toBe('Export chat history');
    expect(handle.button.title).toBe('Export chat history');
    expect(handle.button.textContent).toContain('Export');
  });

  it('invokes onClick when the button is clicked', () => {
    const onClick = vi.fn();
    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick,
    });
    handle.button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('opens the export flow through the mounted toolbar from outside the page UI', () => {
    expect(openPersistentExportToolbar()).toBe(false);

    const firstOwner = vi.fn();
    mountPersistentExportToolbar({ label: 'Export', tooltip: 'Export', onClick: firstOwner });
    const currentOwner = vi.fn();
    mountPersistentExportToolbar({ label: 'Export', tooltip: 'Export', onClick: currentOwner });

    expect(openPersistentExportToolbar()).toBe(true);
    expect(currentOwner).toHaveBeenCalledOnce();
    expect(firstOwner).not.toHaveBeenCalled();
  });

  it('cannot open the export flow after the toolbar is removed', () => {
    const onClick = vi.fn();
    const handle = mountPersistentExportToolbar({ label: 'Export', tooltip: 'Export', onClick });
    handle.remove();

    expect(openPersistentExportToolbar()).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("remounts with the latest handler and ignores the previous owner's cleanup", () => {
    const firstClick = vi.fn();
    const secondClick = vi.fn();
    const first = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: firstClick,
    });
    const second = mountPersistentExportToolbar({
      label: '导出',
      tooltip: '导出对话历史',
      onClick: secondClick,
    });
    expect(document.querySelectorAll('.gv-persistent-export-toolbar').length).toBe(1);
    expect(second.root).toBe(first.root);
    expect(first.button.getAttribute('aria-label')).toBe('导出对话历史');
    expect(first.button.textContent).toContain('导出');
    second.button.click();
    expect(firstClick).not.toHaveBeenCalled();
    expect(secondClick).toHaveBeenCalledOnce();

    first.remove();
    expect(document.querySelector('.gv-persistent-export-toolbar')).not.toBeNull();
    second.remove();
    expect(document.querySelector('.gv-persistent-export-toolbar')).toBeNull();
  });

  it('keeps ChatGPT toolbar avoidance and dark-mode styles', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');
    const platformRule = css.match(
      /\.gv-persistent-export-toolbar\[data-gv-platform='chatgpt'\]\s*\{([^}]*)\}/,
    )?.[1];

    expect(platformRule).toContain('top: 12px');
    expect(platformRule).not.toContain('right:');
    expect(css).toContain("html[data-gv-scheme='dark'] .gv-persistent-export-btn");
    expect(css).toContain("html[data-gv-scheme='dark'] .gv-persistent-export-btn:hover");
  });

  it('setText updates label/tooltip after language change', () => {
    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });
    handle.setText('Exporter', 'Exporter la conversation');
    expect(handle.button.title).toBe('Exporter la conversation');
    expect(handle.button.getAttribute('aria-label')).toBe('Exporter la conversation');
    expect(handle.button.textContent).toContain('Exporter');
  });

  it('keeps the default right offset when no top-right controls are present', async () => {
    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });

    await nextFrame();

    expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('84px');
  });

  it('moves left to avoid Gemini top-right upgrade controls', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    const upgradeButton = document.createElement('button');
    upgradeButton.setAttribute('data-test-id', 'upgrade-button');
    mockRect(upgradeButton, {
      top: 8,
      bottom: 44,
      left: 960,
      right: 1130,
      width: 170,
      height: 36,
    });
    document.body.appendChild(upgradeButton);

    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });

    await nextFrame();

    expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('332px');
  });

  it('updates avoidance when Gemini renders top-right controls after mount', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });
    await nextFrame();
    expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('84px');

    const topBarActions = document.createElement('top-bar-actions');
    mockRect(topBarActions, {
      top: 0,
      bottom: 56,
      left: 920,
      right: 1260,
      width: 340,
      height: 56,
    });
    document.body.appendChild(topBarActions);
    await Promise.resolve();
    await nextFrame();

    expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('372px');
  });

  it('moves left to avoid ChatGPT header share actions', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    const headerActions = document.createElement('div');
    headerActions.id = 'conversation-header-actions';
    mockRect(headerActions, {
      top: 8,
      bottom: 48,
      left: 1040,
      right: 1268,
      width: 228,
      height: 40,
    });
    document.body.appendChild(headerActions);

    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });
    handle.root.setAttribute('data-gv-platform', 'chatgpt');

    await nextFrame();

    expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('252px');
  });

  it('moves left of unlabeled header controls rendered under the ChatGPT toolbar', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    const header = document.createElement('header');
    const share = document.createElement('button');
    const shareLabel = document.createElement('span');
    share.appendChild(shareLabel);
    header.appendChild(share);
    document.body.appendChild(header);
    mockRect(share, { top: 4, bottom: 48, left: 1129, right: 1181, width: 52, height: 44 });
    stubElementsFromPoint((x, y) =>
      y >= 4 && y <= 48 && x >= 1129 && x <= 1181 ? [shareLabel] : [header],
    );

    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });
    handle.root.setAttribute('data-gv-platform', 'chatgpt');
    mockRect(handle.root, { top: 12, bottom: 48, width: 82, height: 36 });

    await nextFrame();

    expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('163px');
    header.remove();
  });

  it('moves left of an unlabeled ChatGPT header control rendered after mount', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    const header = document.createElement('header');
    document.body.appendChild(header);
    let share: HTMLButtonElement | null = null;
    stubElementsFromPoint((x, y) =>
      share && y >= 4 && y <= 48 && x >= 1129 && x <= 1181 ? [share] : [header],
    );

    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });
    handle.root.setAttribute('data-gv-platform', 'chatgpt');
    mockRect(handle.root, { top: 12, bottom: 48, width: 82, height: 36 });
    await nextFrame();
    expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('84px');

    share = document.createElement('button');
    mockRect(share, { top: 4, bottom: 48, left: 1129, right: 1181, width: 52, height: 44 });
    header.appendChild(share);
    await Promise.resolve();
    await nextFrame();

    expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('163px');
    header.remove();
  });

  it('leaves the Gemini toolbar on its selector-based offset', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    const control = document.createElement('button');
    document.body.appendChild(control);
    mockRect(control, { top: 4, bottom: 48, left: 1129, right: 1181, width: 52, height: 44 });
    stubElementsFromPoint(() => [control]);

    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });
    mockRect(handle.root, { top: 12, bottom: 48, width: 82, height: 36 });

    await nextFrame();

    expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('84px');
    control.remove();
  });

  it('ignores full-width top-bar containers so the toolbar stays top-right', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    const topBarActions = document.createElement('top-bar-actions');
    mockRect(topBarActions, {
      top: 0,
      bottom: 56,
      left: 0,
      right: 1280,
      width: 1280,
      height: 56,
    });
    document.body.appendChild(topBarActions);

    const handle = mountPersistentExportToolbar({
      label: 'Export',
      tooltip: 'Export chat history',
      onClick: vi.fn(),
    });

    await nextFrame();

    expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('84px');
  });

  describe('bounded avoidance work', () => {
    async function settle(frames = 1): Promise<void> {
      for (let i = 0; i < frames; i++) {
        await Promise.resolve();
        await nextFrame();
      }
    }

    function mountTopBar(left: number): {
      topBar: HTMLElement;
      rectReads: () => number;
      setLeft: (next: number) => void;
    } {
      let reads = 0;
      let currentLeft = left;
      const topBar = document.createElement('top-bar-actions');
      Object.defineProperty(topBar, 'getBoundingClientRect', {
        configurable: true,
        value: () => {
          reads += 1;
          const hidden = topBar.hasAttribute('hidden');
          return {
            top: 0,
            bottom: hidden ? 0 : 56,
            left: currentLeft,
            right: 1260,
            width: hidden ? 0 : 1260 - currentLeft,
            height: hidden ? 0 : 56,
          } as DOMRect;
        },
      });
      document.body.appendChild(topBar);
      return {
        topBar,
        rectReads: () => reads,
        setLeft: (next) => {
          currentLeft = next;
        },
      };
    }

    it('does not query or measure while unrelated content streams into the page', async () => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
      const { rectReads } = mountTopBar(920);
      const handle = mountPersistentExportToolbar({
        label: 'Export',
        tooltip: 'Export chat history',
        onClick: vi.fn(),
      });
      await settle();
      expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('372px');

      const querySpy = vi.spyOn(document, 'querySelectorAll');
      const readsBefore = rectReads();
      const chat = document.createElement('div');
      document.body.appendChild(chat);
      for (let i = 0; i < 40; i++) {
        const turn = document.createElement('div');
        turn.className = 'conversation-turn';
        turn.textContent = `Streamed chunk ${i}`;
        chat.appendChild(turn);
        turn.classList.add('settled');
        await settle();
      }

      expect(querySpy).not.toHaveBeenCalled();
      expect(rectReads()).toBe(readsBefore);
      chat.remove();
    });

    it('settles after one measurement instead of re-triggering itself', async () => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
      const handle = mountPersistentExportToolbar({
        label: 'Export',
        tooltip: 'Export chat history',
        onClick: vi.fn(),
      });
      await settle();
      const querySpy = vi.spyOn(document, 'querySelectorAll');
      const setProperty = vi.spyOn(handle.root.style, 'setProperty');

      mountTopBar(920);
      await settle(6);

      expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('372px');
      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(setProperty).toHaveBeenCalledTimes(1);
    });

    it('follows controls pushed left inside a full-width top-bar host', async () => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
      const host = document.createElement('top-bar-actions');
      mockRect(host, { top: 0, bottom: 56, left: 0, right: 1280, width: 1280, height: 56 });
      let upgradeLeft = 960;
      const upgrade = document.createElement('button');
      upgrade.setAttribute('data-test-id', 'upgrade-button');
      Object.defineProperty(upgrade, 'getBoundingClientRect', {
        configurable: true,
        value: () =>
          ({
            top: 8,
            bottom: 44,
            left: upgradeLeft,
            right: upgradeLeft + 170,
            width: 170,
            height: 36,
          }) as DOMRect,
      });
      host.appendChild(upgrade);
      document.body.appendChild(host);
      const handle = mountPersistentExportToolbar({
        label: 'Export',
        tooltip: 'Export chat history',
        onClick: vi.fn(),
      });
      await settle();
      expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('332px');

      upgradeLeft = 900;
      host.appendChild(document.createElement('button'));
      await settle();

      expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('392px');
    });

    it('follows a top-right control that grows or hides', async () => {
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
      const { topBar, setLeft } = mountTopBar(920);
      const handle = mountPersistentExportToolbar({
        label: 'Export',
        tooltip: 'Export chat history',
        onClick: vi.fn(),
      });
      await settle();
      expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('372px');

      setLeft(820);
      topBar.appendChild(document.createElement('button'));
      await settle();
      expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('472px');

      topBar.setAttribute('hidden', '');
      await settle();
      expect(handle.root.style.getPropertyValue('--gv-persistent-export-right')).toBe('84px');
    });

    describe('a control hidden by an ancestor', () => {
      let header: HTMLElement;
      let rectReads = 0;

      beforeEach(() => {
        vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
        rectReads = 0;
        header = document.createElement('header');
        header.className = 'page-header collapsed';
        const actions = document.createElement('div');
        actions.id = 'conversation-header-actions';
        // Visible only while no ancestor hides it, as `display: none` would.
        Object.defineProperty(actions, 'getBoundingClientRect', {
          configurable: true,
          value: () => {
            rectReads += 1;
            const shown = !header.hasAttribute('hidden') && !header.classList.contains('collapsed');
            return {
              top: shown ? 8 : 0,
              bottom: shown ? 44 : 0,
              left: shown ? 1000 : 0,
              right: shown ? 1240 : 0,
              width: shown ? 240 : 0,
              height: shown ? 36 : 0,
            } as DOMRect;
          },
        });
        header.appendChild(actions);
        document.body.appendChild(header);
      });

      afterEach(() => {
        header.remove();
      });

      async function mountToolbar(): Promise<HTMLDivElement> {
        const handle = mountPersistentExportToolbar({
          label: 'Export',
          tooltip: 'Export chat history',
          onClick: vi.fn(),
        });
        await settle();
        return handle.root;
      }

      it('moves aside when an ancestor class change reveals it, and back when it hides', async () => {
        const root = await mountToolbar();
        expect(root.style.getPropertyValue('--gv-persistent-export-right')).toBe('84px');

        header.classList.remove('collapsed');
        await settle();
        expect(root.style.getPropertyValue('--gv-persistent-export-right')).toBe('292px');

        header.setAttribute('hidden', '');
        await settle();
        expect(root.style.getPropertyValue('--gv-persistent-export-right')).toBe('84px');

        header.removeAttribute('hidden');
        await settle();
        expect(root.style.getPropertyValue('--gv-persistent-export-right')).toBe('292px');
      });

      it('does not measure for attribute churn outside its ancestry', async () => {
        await mountToolbar();
        const chat = document.createElement('div');
        document.body.appendChild(chat);
        const readsBefore = rectReads;

        for (let i = 0; i < 20; i++) {
          chat.classList.toggle('streaming');
          chat.setAttribute('style', `min-height: ${i}px`);
          await settle();
        }

        expect(rectReads).toBe(readsBefore);
        chat.remove();
      });

      it('does not measure when turns with hidden per-message buttons change class', async () => {
        const chat = document.createElement('div');
        const turn = document.createElement('div');
        turn.className = 'conversation-turn';
        const copyPrompt = document.createElement('button');
        // Matches the substring selector `[aria-label*="pro" i]`; zero-size until hovered.
        copyPrompt.setAttribute('aria-label', 'Copy prompt');
        mockRect(copyPrompt, { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
        turn.appendChild(copyPrompt);
        chat.appendChild(turn);
        document.body.appendChild(chat);
        await mountToolbar();
        const querySpy = vi.spyOn(document, 'querySelectorAll');
        const readsBefore = rectReads;

        for (let i = 0; i < 20; i++) {
          turn.classList.toggle('hovered');
          chat.setAttribute('style', `min-height: ${i}px`);
          await settle();
        }

        expect(querySpy).not.toHaveBeenCalled();
        expect(rectReads).toBe(readsBefore);
        chat.remove();
      });
    });
  });
});
