import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
});
