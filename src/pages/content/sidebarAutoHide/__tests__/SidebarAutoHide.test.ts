import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { confirmDriver } from '@/tests/confirmDriver';

function mockVisibleRect(element: HTMLElement, width: number = 300, height: number = 600): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect);
}

async function installSidebar(
  settings: { autoHide?: boolean; fullHide?: boolean },
  collapsed = true,
) {
  document.body.innerHTML = `
    <bard-sidenav><side-navigation-content><div></div></side-navigation-content></bard-sidenav>
    <button data-test-id="side-nav-menu-button"></button>
  `;
  const sidenav = document.querySelector<HTMLElement>('bard-sidenav')!;
  const content = sidenav.querySelector<HTMLElement>('side-navigation-content > div')!;
  content.classList.toggle('collapsed', collapsed);
  mockVisibleRect(sidenav, 320, 800);
  const toggleButton = document.querySelector('button')!;
  const toggleSpy = vi.fn(() => {
    document
      .querySelector('bard-sidenav side-navigation-content > div')!
      .classList.toggle('collapsed');
  });
  toggleButton.addEventListener('click', toggleSpy);
  (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
      callback({
        gvSidebarAutoHide: settings.autoHide === true,
        gvSidebarFullHide: settings.fullHide === true,
      });
    },
  );
  const api = await import('../index');
  api.startSidebarAutoHide();
  const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.at(-1)![0];
  const changeSettings = (
    changes: Record<string, { newValue: boolean }>,
    area: 'sync' | 'local' = 'sync',
  ) => listener(changes, area);
  return { sidenav, content, toggleButton, toggleSpy, changeSettings, ...api };
}

describe('sidebarAutoHide', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';
    document.body.className = '';
  });

  afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
    vi.useRealTimers();
  });

  it('does not collapse when folder color picker is open', async () => {
    document.body.classList.add('mat-sidenav-opened');

    const sidenav = document.createElement('bard-sidenav');
    mockVisibleRect(sidenav, 320, 800);
    document.body.appendChild(sidenav);

    const toggleButton = document.createElement('button');
    toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
    const toggleSpy = vi.fn();
    toggleButton.addEventListener('click', toggleSpy);
    document.body.appendChild(toggleButton);

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSidebarAutoHide: true });
      },
    );

    const { startSidebarAutoHide } = await import('../index');
    startSidebarAutoHide();

    const colorPicker = document.createElement('div');
    colorPicker.className = 'gv-color-picker-dialog';
    mockVisibleRect(colorPicker, 180, 120);
    document.body.appendChild(colorPicker);

    sidenav.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(600);
    expect(toggleSpy).not.toHaveBeenCalled();

    colorPicker.remove();
    sidenav.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(600);
    expect(toggleSpy).toHaveBeenCalledTimes(1);
  });

  it('does not collapse while a folder removal confirm is open', async () => {
    document.body.classList.add('mat-sidenav-opened');

    const sidenav = document.createElement('bard-sidenav');
    mockVisibleRect(sidenav, 320, 800);
    const deleteButton = document.createElement('button');
    sidenav.appendChild(deleteButton);
    document.body.appendChild(sidenav);

    const toggleButton = document.createElement('button');
    toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
    const toggleSpy = vi.fn();
    toggleButton.addEventListener('click', toggleSpy);
    document.body.appendChild(toggleButton);

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSidebarAutoHide: true });
      },
    );

    const { startSidebarAutoHide } = await import('../index');
    startSidebarAutoHide();

    const { askConfirm } = await import('@/core/ui/confirm');
    const answer = askConfirm({
      message: 'Remove this folder?',
      anchor: deleteButton,
      tone: 'danger',
      choices: [{ id: 'confirm', label: 'Remove' }],
    });
    mockVisibleRect(document.querySelector<HTMLElement>('[data-gv-layer="popover"]')!, 240, 120);

    sidenav.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(600);
    expect(toggleSpy).not.toHaveBeenCalled();

    confirmDriver.pressEscape();
    await expect(answer).resolves.toBeNull();
    sidenav.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(600);
    expect(toggleSpy).toHaveBeenCalledTimes(1);
  });

  it('does not expand on quick sidebar hover pass-through', async () => {
    const sidenav = document.createElement('bard-sidenav');
    mockVisibleRect(sidenav, 320, 800);

    const sideNavigationContent = document.createElement('side-navigation-content');
    const collapsedContainer = document.createElement('div');
    collapsedContainer.className = 'collapsed';
    sideNavigationContent.appendChild(collapsedContainer);
    sidenav.appendChild(sideNavigationContent);
    document.body.appendChild(sidenav);

    const toggleButton = document.createElement('button');
    toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
    const toggleSpy = vi.fn();
    toggleButton.addEventListener('click', toggleSpy);
    document.body.appendChild(toggleButton);

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSidebarAutoHide: true });
      },
    );

    const { startSidebarAutoHide } = await import('../index');
    startSidebarAutoHide();

    sidenav.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(80); // shorter than new ENTER_DELAY_MS (150ms) — timer must not fire
    sidenav.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(400);

    expect(toggleSpy).not.toHaveBeenCalled();
  });

  it('reveals the sidebar after clicking the toggle button in full-hide mode', async () => {
    const sidenav = document.createElement('bard-sidenav');
    mockVisibleRect(sidenav, 320, 800);

    const sideNavigationContent = document.createElement('side-navigation-content');
    const collapsedContainer = document.createElement('div');
    collapsedContainer.className = 'collapsed';
    sideNavigationContent.appendChild(collapsedContainer);
    sidenav.appendChild(sideNavigationContent);
    document.body.appendChild(sidenav);

    const toggleButton = document.createElement('button');
    toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
    toggleButton.addEventListener('click', () => {
      collapsedContainer.classList.remove('collapsed');
    });
    document.body.appendChild(toggleButton);

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSidebarFullHide: true });
      },
    );

    const { startSidebarAutoHide } = await import('../index');
    startSidebarAutoHide();

    vi.advanceTimersByTime(300);
    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsed')).toBe(
      true,
    );

    toggleButton.click();
    vi.advanceTimersByTime(400);

    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsed')).toBe(
      false,
    );

    const edgeTrigger = document.getElementById('gv-sidebar-edge-trigger');
    expect(edgeTrigger).not.toBeNull();
    expect(edgeTrigger?.style.display).toBe('none');
  });

  it('does not reveal from the full-hide edge trigger when auto-hide is disabled', async () => {
    const sidenav = document.createElement('bard-sidenav');
    mockVisibleRect(sidenav, 320, 800);

    const sideNavigationContent = document.createElement('side-navigation-content');
    const collapsedContainer = document.createElement('div');
    collapsedContainer.className = 'collapsed';
    sideNavigationContent.appendChild(collapsedContainer);
    sidenav.appendChild(sideNavigationContent);
    document.body.appendChild(sidenav);

    const toggleButton = document.createElement('button');
    toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
    const toggleSpy = vi.fn(() => {
      collapsedContainer.classList.toggle('collapsed');
    });
    toggleButton.addEventListener('click', toggleSpy);
    document.body.appendChild(toggleButton);

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSidebarAutoHide: false, gvSidebarFullHide: true });
      },
    );

    const { startSidebarAutoHide } = await import('../index');
    startSidebarAutoHide();

    vi.advanceTimersByTime(300);
    const edgeTrigger = document.getElementById('gv-sidebar-edge-trigger');
    expect(edgeTrigger).not.toBeNull();
    expect(edgeTrigger?.style.display).toBe('none');

    edgeTrigger?.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(200);

    expect(toggleSpy).not.toHaveBeenCalled();
    expect(collapsedContainer.classList.contains('collapsed')).toBe(true);
  });

  it('auto-collapses after expanding from the full-hide edge trigger', async () => {
    const sidenav = document.createElement('bard-sidenav');
    mockVisibleRect(sidenav, 320, 800);

    const sideNavigationContent = document.createElement('side-navigation-content');
    const collapsedContainer = document.createElement('div');
    collapsedContainer.className = 'collapsed';
    sideNavigationContent.appendChild(collapsedContainer);
    sidenav.appendChild(sideNavigationContent);
    document.body.appendChild(sidenav);

    const toggleButton = document.createElement('button');
    toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
    const toggleSpy = vi.fn(() => {
      collapsedContainer.classList.toggle('collapsed');
    });
    toggleButton.addEventListener('click', toggleSpy);
    document.body.appendChild(toggleButton);

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSidebarAutoHide: true, gvSidebarFullHide: true });
      },
    );

    const { startSidebarAutoHide } = await import('../index');
    startSidebarAutoHide();

    // Advance past the 500ms initial-collapse timer (enable()) so it fires on an already-collapsed
    // sidebar (no-op). This prevents it from interfering after the edge trigger expand.
    vi.advanceTimersByTime(600);
    const edgeTrigger = document.getElementById('gv-sidebar-edge-trigger');
    expect(edgeTrigger).not.toBeNull();

    edgeTrigger?.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(200); // new ENTER_DELAY_MS is 150ms — timer fires within this window

    expect(toggleSpy).toHaveBeenCalledTimes(1);
    expect(collapsedContainer.classList.contains('collapsed')).toBe(false);

    sidenav.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(500); // new LEAVE_DELAY_MS is 400ms — timer fires within this window

    expect(toggleSpy).toHaveBeenCalledTimes(2);
    expect(collapsedContainer.classList.contains('collapsed')).toBe(true);
  });

  it('keeps the sidebar expanded while a coachmark holds it', async () => {
    const sidenav = document.createElement('bard-sidenav');
    mockVisibleRect(sidenav, 320, 800);

    const sideNavigationContent = document.createElement('side-navigation-content');
    const collapsedContainer = document.createElement('div');
    collapsedContainer.className = 'collapsed';
    sideNavigationContent.appendChild(collapsedContainer);
    sidenav.appendChild(sideNavigationContent);
    document.body.appendChild(sidenav);

    const toggleButton = document.createElement('button');
    toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
    const toggleSpy = vi.fn(() => {
      collapsedContainer.classList.toggle('collapsed');
    });
    toggleButton.addEventListener('click', toggleSpy);
    document.body.appendChild(toggleButton);

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSidebarAutoHide: true, gvSidebarFullHide: true });
      },
    );

    const { keepSidebarExpanded, startSidebarAutoHide } = await import('../index');
    startSidebarAutoHide();

    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsed')).toBe(
      true,
    );

    const release = keepSidebarExpanded();
    expect(toggleSpy).toHaveBeenCalledTimes(1);
    expect(collapsedContainer.classList.contains('collapsed')).toBe(false);
    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsed')).toBe(
      false,
    );

    sidenav.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(600);
    expect(toggleSpy).toHaveBeenCalledTimes(1);
    expect(collapsedContainer.classList.contains('collapsed')).toBe(false);

    release();
    sidenav.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(600);
    expect(toggleSpy).toHaveBeenCalledTimes(2);
    expect(collapsedContainer.classList.contains('collapsed')).toBe(true);
  });

  it('expands when Gemini marks bard-sidenav itself as collapsed', async () => {
    const sidenav = document.createElement('bard-sidenav');
    sidenav.className = 'collapsed';
    mockVisibleRect(sidenav, 56, 800);

    const sideNavigationContent = document.createElement('side-navigation-content');
    sideNavigationContent.appendChild(document.createElement('div'));
    sidenav.appendChild(sideNavigationContent);
    document.body.appendChild(sidenav);

    const toggleButton = document.createElement('button');
    toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
    const toggleSpy = vi.fn(() => {
      sidenav.classList.remove('collapsed');
      mockVisibleRect(sidenav, 320, 800);
    });
    toggleButton.addEventListener('click', toggleSpy);
    document.body.appendChild(toggleButton);

    const { keepSidebarExpanded } = await import('../index');
    keepSidebarExpanded();

    expect(toggleSpy).toHaveBeenCalledTimes(1);
    expect(sidenav.classList.contains('collapsed')).toBe(false);
  });

  it('delays full-hide after auto-collapse so the native close animation can run', async () => {
    const sidenav = document.createElement('bard-sidenav');
    mockVisibleRect(sidenav, 320, 800);

    const sideNavigationContent = document.createElement('side-navigation-content');
    const expandedContainer = document.createElement('div');
    sideNavigationContent.appendChild(expandedContainer);
    sidenav.appendChild(sideNavigationContent);
    document.body.appendChild(sidenav);

    const toggleButton = document.createElement('button');
    toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
    toggleButton.addEventListener('click', () => {
      expandedContainer.classList.toggle('collapsed');
    });
    document.body.appendChild(toggleButton);

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSidebarAutoHide: true, gvSidebarFullHide: true });
      },
    );

    const { startSidebarAutoHide } = await import('../index');
    startSidebarAutoHide();

    expect(document.getElementById('gv-sidebar-full-hide-style')).not.toBeNull();

    vi.advanceTimersByTime(500);

    expect(expandedContainer.classList.contains('collapsed')).toBe(true);
    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsing')).toBe(
      true,
    );
    expect(sidenav.style.getPropertyValue('width')).toBe('0px');
    expect(sidenav.style.getPropertyPriority('width')).toBe('important');
    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsed')).toBe(
      false,
    );

    vi.advanceTimersByTime(260);

    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsed')).toBe(
      true,
    );

    vi.advanceTimersByTime(240);

    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsing')).toBe(
      false,
    );
    expect(sidenav.style.getPropertyValue('width')).toBe('');
  });

  describe('predictive aiming', () => {
    function dispatchMouseMove(x: number): void {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: 400 }));
    }

    it('expands sidebar when mouse approaches left edge at high velocity', async () => {
      const sidenav = document.createElement('bard-sidenav');
      mockVisibleRect(sidenav, 320, 800);

      const sideNavigationContent = document.createElement('side-navigation-content');
      const collapsedContainer = document.createElement('div');
      collapsedContainer.className = 'collapsed';
      sideNavigationContent.appendChild(collapsedContainer);
      sidenav.appendChild(sideNavigationContent);
      document.body.appendChild(sidenav);

      const toggleButton = document.createElement('button');
      toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
      const toggleSpy = vi.fn(() => {
        collapsedContainer.classList.toggle('collapsed');
      });
      toggleButton.addEventListener('click', toggleSpy);
      document.body.appendChild(toggleButton);

      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ gvSidebarAutoHide: true });
        },
      );

      const { startSidebarAutoHide } = await import('../index');
      startSidebarAutoHide();

      // Let initial collapse timer fire (sidebar already collapsed → no-op)
      vi.advanceTimersByTime(600);
      expect(toggleSpy).not.toHaveBeenCalled();

      // Simulate mouse moving fast toward the left edge:
      // Two samples 60ms apart (> 50ms throttle), x drops from 200 to 60.
      // Velocity: (60 - 200) / 60 = -2.33 px/ms — well past -0.5 threshold.
      // Second sample x=60 is inside the 100px predictive zone.
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(1000) // first sample
        .mockReturnValueOnce(1060); // second sample — 60ms later

      dispatchMouseMove(200); // first sample: establishes baseline, no trigger
      dispatchMouseMove(60); // second sample: in zone + fast enough → trigger!

      expect(toggleSpy).toHaveBeenCalledTimes(1);
      expect(collapsedContainer.classList.contains('collapsed')).toBe(false);
    });

    it('does not expand when mouse is slow (below velocity threshold)', async () => {
      const sidenav = document.createElement('bard-sidenav');
      mockVisibleRect(sidenav, 320, 800);

      const sideNavigationContent = document.createElement('side-navigation-content');
      const collapsedContainer = document.createElement('div');
      collapsedContainer.className = 'collapsed';
      sideNavigationContent.appendChild(collapsedContainer);
      sidenav.appendChild(sideNavigationContent);
      document.body.appendChild(sidenav);

      const toggleButton = document.createElement('button');
      toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
      const toggleSpy = vi.fn();
      toggleButton.addEventListener('click', toggleSpy);
      document.body.appendChild(toggleButton);

      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ gvSidebarAutoHide: true });
        },
      );

      const { startSidebarAutoHide } = await import('../index');
      startSidebarAutoHide();

      vi.advanceTimersByTime(600);

      // Slow movement: x drops from 90 to 80 over 60ms.
      // Velocity: (80 - 90) / 60 = -0.17 px/ms — below -0.5 threshold.
      vi.spyOn(performance, 'now').mockReturnValueOnce(2000).mockReturnValueOnce(2060);

      dispatchMouseMove(90);
      dispatchMouseMove(80);

      expect(toggleSpy).not.toHaveBeenCalled();
    });

    it('does not expand when only full-hide is enabled', async () => {
      const sidenav = document.createElement('bard-sidenav');
      mockVisibleRect(sidenav, 320, 800);

      const sideNavigationContent = document.createElement('side-navigation-content');
      const collapsedContainer = document.createElement('div');
      collapsedContainer.className = 'collapsed';
      sideNavigationContent.appendChild(collapsedContainer);
      sidenav.appendChild(sideNavigationContent);
      document.body.appendChild(sidenav);

      const toggleButton = document.createElement('button');
      toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
      const toggleSpy = vi.fn(() => {
        collapsedContainer.classList.toggle('collapsed');
      });
      toggleButton.addEventListener('click', toggleSpy);
      document.body.appendChild(toggleButton);

      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ gvSidebarAutoHide: false, gvSidebarFullHide: true });
        },
      );

      const { startSidebarAutoHide } = await import('../index');
      startSidebarAutoHide();

      vi.advanceTimersByTime(300);
      vi.spyOn(performance, 'now').mockReturnValueOnce(2500).mockReturnValueOnce(2560);

      dispatchMouseMove(200);
      dispatchMouseMove(60);
      vi.advanceTimersByTime(1300);

      expect(toggleSpy).not.toHaveBeenCalled();
      expect(collapsedContainer.classList.contains('collapsed')).toBe(true);
    });

    it('auto-collapses via safety timer when mouse never enters sidebar', async () => {
      const sidenav = document.createElement('bard-sidenav');
      mockVisibleRect(sidenav, 320, 800);

      const sideNavigationContent = document.createElement('side-navigation-content');
      const collapsedContainer = document.createElement('div');
      collapsedContainer.className = 'collapsed';
      sideNavigationContent.appendChild(collapsedContainer);
      sidenav.appendChild(sideNavigationContent);
      document.body.appendChild(sidenav);

      const toggleButton = document.createElement('button');
      toggleButton.setAttribute('data-test-id', 'side-nav-menu-button');
      const toggleSpy = vi.fn(() => {
        collapsedContainer.classList.toggle('collapsed');
      });
      toggleButton.addEventListener('click', toggleSpy);
      document.body.appendChild(toggleButton);

      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ gvSidebarAutoHide: true });
        },
      );

      const { startSidebarAutoHide } = await import('../index');
      startSidebarAutoHide();

      vi.advanceTimersByTime(600);

      // Trigger predictive expand
      vi.spyOn(performance, 'now').mockReturnValueOnce(3000).mockReturnValueOnce(3060);

      dispatchMouseMove(200);
      dispatchMouseMove(60);

      expect(toggleSpy).toHaveBeenCalledTimes(1); // expanded
      expect(collapsedContainer.classList.contains('collapsed')).toBe(false);

      // User never enters the sidebar → safety collapse fires after 1200ms
      vi.advanceTimersByTime(1300);
      expect(toggleSpy).toHaveBeenCalledTimes(2); // collapsed back
      expect(collapsedContainer.classList.contains('collapsed')).toBe(true);
    });
  });

  describe('2026 redesign toggle discovery', () => {
    it('picks the visible Close-sidebar button and skips the 0×0 invisible copy', async () => {
      document.body.classList.add('mat-sidenav-opened');

      const sidenav = document.createElement('bard-sidenav');
      mockVisibleRect(sidenav, 320, 800);
      document.body.appendChild(sidenav);

      // Invisible duplicate that Gemini renders alongside the visible toggle.
      const invisibleBtn = document.createElement('button');
      invisibleBtn.setAttribute('aria-label', 'Open sidebar');
      const invisibleIcon = document.createElement('mat-icon');
      invisibleIcon.setAttribute('fonticon', 'side_nav_expand');
      invisibleBtn.appendChild(invisibleIcon);
      mockVisibleRect(invisibleBtn, 0, 0);
      document.body.appendChild(invisibleBtn);

      // The actually-visible Close-sidebar toggle.
      const visibleBtn = document.createElement('button');
      visibleBtn.setAttribute('aria-label', 'Close sidebar');
      const visibleIcon = document.createElement('mat-icon');
      visibleIcon.setAttribute('fonticon', 'side_nav');
      visibleBtn.appendChild(visibleIcon);
      mockVisibleRect(visibleBtn, 40, 40);
      const visibleSpy = vi.fn();
      visibleBtn.addEventListener('click', visibleSpy);
      document.body.appendChild(visibleBtn);

      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ gvSidebarAutoHide: true });
        },
      );

      const invisibleSpy = vi.fn();
      invisibleBtn.addEventListener('click', invisibleSpy);

      const { startSidebarAutoHide } = await import('../index');
      startSidebarAutoHide();

      // Initial-collapse timer fires at 500ms; that's enough for one click.
      // The crucial assertion is that it lands on the visible button, never
      // on the 0×0 placeholder Gemini renders alongside it.
      vi.advanceTimersByTime(600);

      expect(visibleSpy).toHaveBeenCalled();
      expect(invisibleSpy).not.toHaveBeenCalled();
    });

    it('finds the toggle via mat-icon fonticon when aria-label is localized', async () => {
      document.body.classList.add('mat-sidenav-opened');

      const sidenav = document.createElement('bard-sidenav');
      mockVisibleRect(sidenav, 320, 800);
      document.body.appendChild(sidenav);

      // Mimic a non-English locale: aria-label doesn't contain "sidebar".
      const localizedBtn = document.createElement('button');
      localizedBtn.setAttribute('aria-label', 'サイドバーを閉じる');
      const icon = document.createElement('mat-icon');
      icon.setAttribute('fonticon', 'side_nav');
      localizedBtn.appendChild(icon);
      mockVisibleRect(localizedBtn, 40, 40);
      const spy = vi.fn();
      localizedBtn.addEventListener('click', spy);
      document.body.appendChild(localizedBtn);

      (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (
          _defaults: Record<string, unknown>,
          callback: (result: Record<string, unknown>) => void,
        ) => {
          callback({ gvSidebarAutoHide: true });
        },
      );

      const { startSidebarAutoHide } = await import('../index');
      startSidebarAutoHide();

      vi.advanceTimersByTime(600);

      // Aria-label is in Japanese — discovery must succeed via the
      // fonticon-anchored fallback, not English string matching.
      expect(spy).toHaveBeenCalled();
    });
  });
  it('changes auto-hide and full-hide independently and ignores local settings events', async () => {
    const { sidenav, toggleSpy, changeSettings } = await installSidebar({
      autoHide: true,
      fullHide: true,
    });
    vi.advanceTimersByTime(600);
    const edge = document.getElementById('gv-sidebar-edge-trigger')!;
    expect(edge.style.display).toBe('block');
    changeSettings({ gvSidebarAutoHide: { newValue: false } }, 'local');
    expect(edge.style.display).toBe('block');
    changeSettings({ gvSidebarAutoHide: { newValue: false } });
    expect(edge.style.display).toBe('none');
    expect(document.getElementById('gv-sidebar-full-hide-style')).not.toBeNull();
    edge.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(200);
    expect(toggleSpy).not.toHaveBeenCalled();
    changeSettings({ gvSidebarAutoHide: { newValue: true } });
    expect(edge.style.display).toBe('block');
    changeSettings({ gvSidebarFullHide: { newValue: false } });
    expect(document.getElementById('gv-sidebar-edge-trigger')).toBeNull();
    expect(document.getElementById('gv-sidebar-full-hide-style')).toBeNull();
    expect(document.getElementById('gv-sidebar-auto-hide-style')).not.toBeNull();
    sidenav.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(150);
    expect(toggleSpy).toHaveBeenCalledOnce();
  });

  it('restores only an auto-collapsed sidebar when auto-hide is disabled', async () => {
    const { content, toggleSpy, changeSettings } = await installSidebar({ autoHide: true }, false);
    vi.advanceTimersByTime(500);
    expect(content.classList.contains('collapsed')).toBe(true);
    changeSettings({ gvSidebarAutoHide: { newValue: false } });
    expect(content.classList.contains('collapsed')).toBe(false);
    expect(toggleSpy).toHaveBeenCalledTimes(2);
    content.classList.add('collapsed');
    changeSettings({ gvSidebarAutoHide: { newValue: true } });
    changeSettings({ gvSidebarAutoHide: { newValue: false } });
    expect(content.classList.contains('collapsed')).toBe(true);
    expect(toggleSpy).toHaveBeenCalledTimes(2);
  });

  it('holds expansion until the last coachmark releases and releases each lock only once', async () => {
    const { sidenav, content, toggleSpy, keepSidebarExpanded } = await installSidebar({
      autoHide: true,
      fullHide: true,
    });
    const releaseFirst = keepSidebarExpanded();
    const releaseSecond = keepSidebarExpanded();
    expect(toggleSpy).toHaveBeenCalledOnce();
    releaseFirst();
    releaseFirst();
    sidenav.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(600);
    expect(content.classList.contains('collapsed')).toBe(false);
    releaseSecond();
    sidenav.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(400);
    expect(content.classList.contains('collapsed')).toBe(true);
    expect(toggleSpy).toHaveBeenCalledTimes(2);
  });

  it('moves hover handling from a disconnected sidebar to its replacement', async () => {
    const { sidenav, toggleSpy } = await installSidebar({ autoHide: true });
    vi.advanceTimersByTime(600);
    const replacement = sidenav.cloneNode(true) as HTMLElement;
    mockVisibleRect(replacement, 320, 800);
    sidenav.replaceWith(replacement);
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    sidenav.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(150);
    expect(toggleSpy).not.toHaveBeenCalled();
    replacement.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(150);
    expect(toggleSpy).toHaveBeenCalledOnce();
    expect(replacement.querySelector('.collapsed')).toBeNull();
  });

  it('preserves an edge-enter timer into the sidebar but cancels it when leaving elsewhere', async () => {
    const { content, toggleButton, toggleSpy } = await installSidebar({
      autoHide: true,
      fullHide: true,
    });
    vi.advanceTimersByTime(600);
    const edge = document.getElementById('gv-sidebar-edge-trigger')!;
    edge.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(50);
    edge.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: content }));
    vi.advanceTimersByTime(100);
    expect(content.classList.contains('collapsed')).toBe(false);
    expect(toggleSpy).toHaveBeenCalledOnce();
    toggleButton.click();
    expect(content.classList.contains('collapsed')).toBe(true);
    edge.dispatchEvent(new Event('mouseenter'));
    edge.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(200);
    expect(content.classList.contains('collapsed')).toBe(true);
    expect(toggleSpy).toHaveBeenCalledTimes(2);
  });

  it('cancels the predictive safety collapse when the pointer enters the sidebar', async () => {
    const { sidenav, content, toggleSpy } = await installSidebar({ autoHide: true });
    vi.advanceTimersByTime(600);
    vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1060);
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 60 }));
    expect(toggleSpy).toHaveBeenCalledOnce();
    sidenav.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(1300);
    expect(content.classList.contains('collapsed')).toBe(false);
    expect(toggleSpy).toHaveBeenCalledOnce();
  });
});
