import { afterEach, expect, it, vi } from 'vitest';

import { createFullHide } from '../fullHide';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

it('interrupts collapse for expansion or a lock and removes animated styles and pending sync on unmount', () => {
  vi.useFakeTimers();
  document.body.innerHTML =
    '<bard-sidenav><side-navigation-content><div></div></side-navigation-content></bard-sidenav>';
  const sidenav = document.querySelector<HTMLElement>('bard-sidenav')!;
  const content = sidenav.querySelector<HTMLElement>('side-navigation-content > div')!;
  const measure = vi
    .spyOn(sidenav, 'getBoundingClientRect')
    .mockReturnValue({ width: 320, height: 800 } as DOMRect);
  const onEdgeEnter = vi.fn();
  const fullHide = createFullHide({
    onEdgeEnter,
    onEdgeLeave: vi.fn(),
    onReconcile: () => fullHide.sync(true, false),
  });
  try {
    fullHide.mount();
    fullHide.sync(true, false);
    const edge = document.getElementById('gv-sidebar-edge-trigger')!;
    expect(edge.style.display).toBe('none');
    fullHide.beforeToggle(false);
    content.classList.add('collapsed');
    fullHide.afterToggle(false);
    fullHide.sync(true, false);
    expect(sidenav.style.width).toBe('0px');
    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsing')).toBe(
      true,
    );
    vi.advanceTimersByTime(259);
    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsed')).toBe(
      false,
    );
    vi.advanceTimersByTime(1);
    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsed')).toBe(
      true,
    );
    expect(edge.style.display).toBe('block');

    // Opening interrupts the animation and reconciles on the next task.
    fullHide.beforeToggle(true);
    content.classList.remove('collapsed');
    fullHide.afterToggle(true);
    vi.advanceTimersByTime(0);
    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsed')).toBe(
      false,
    );
    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsing')).toBe(
      false,
    );
    expect(sidenav.style.width).toBe('');
    expect(edge.style.display).toBe('none');

    fullHide.beforeToggle(false);
    content.classList.add('collapsed');
    fullHide.afterToggle(false);
    fullHide.sync(true, true);
    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsing')).toBe(
      false,
    );
    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsed')).toBe(
      false,
    );
    fullHide.unmount();
    for (const element of document.querySelectorAll<HTMLElement>(
      'bard-sidenav, side-navigation-content, side-navigation-content > div',
    )) {
      expect(element.style.width).toBe('');
      expect(element.style.minWidth).toBe('');
      expect(element.style.overflow).toBe('');
    }
    measure.mockClear();
    vi.advanceTimersByTime(600);
    expect(measure).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains('gv-sidebar-full-hide-collapsed')).toBe(
      false,
    );
    expect(document.getElementById('gv-sidebar-full-hide-style')).toBeNull();
    expect(document.getElementById('gv-sidebar-edge-trigger')).toBeNull();
    edge.dispatchEvent(new Event('mouseenter'));
    expect(onEdgeEnter).not.toHaveBeenCalled();
  } finally {
    fullHide.unmount();
  }
});
