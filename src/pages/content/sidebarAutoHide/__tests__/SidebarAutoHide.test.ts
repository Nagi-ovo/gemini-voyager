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
    vi.advanceTimersByTime(150);
    sidenav.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(400);

    expect(toggleSpy).not.toHaveBeenCalled();
  });
});
