import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createStatusToastManager } from '../statusToast';

describe('StatusToastManager', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a toast with level styling', () => {
    const manager = createStatusToastManager();

    manager.addToast('Hello', 'info');
    vi.runAllTimers();

    const toasts = manager.getToastElements();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toBe('Hello');
    expect(toasts[0].classList.contains('gv-status-toast--info')).toBe(true);
  });

  it('updates the latest pending toast', () => {
    const manager = createStatusToastManager();

    manager.addToast('Starting', 'info', { pending: true });
    const updated = manager.updateLatestPending('Done', 'success', { markFinal: true });
    vi.runAllTimers();

    expect(updated).toBe(true);
    const toasts = manager.getToastElements();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toBe('Done');
    expect(toasts[0].classList.contains('gv-status-toast--success')).toBe(true);
  });

  it('returns false when no pending toast exists', () => {
    const manager = createStatusToastManager();

    const updated = manager.updateLatestPending('No pending', 'warning');

    expect(updated).toBe(false);
  });

  it('auto-dismisses a toast after the configured time', () => {
    const manager = createStatusToastManager();

    manager.addToast('Bye', 'info', { autoDismissMs: 1000 });
    vi.advanceTimersByTime(999);
    expect(manager.getToastElements()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(manager.getToastElements()).toHaveLength(0);
  });

  it('dismisses a toast when clicked', () => {
    const manager = createStatusToastManager();

    manager.addToast('Click me', 'warning');
    const [toast] = manager.getToastElements();
    expect(toast).toBeDefined();

    toast.click();
    expect(manager.getToastElements()).toHaveLength(0);
  });

  it('positions the container near the anchor element', () => {
    const manager = createStatusToastManager();
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    anchor.getBoundingClientRect = () =>
      ({
        left: 100,
        right: 120,
        top: 200,
        bottom: 220,
        width: 20,
        height: 20,
        x: 100,
        y: 200,
        toJSON: () => {},
      }) as DOMRect;

    manager.setAnchorElement(anchor);
    manager.addToast('Anchor', 'info');
    vi.runAllTimers();

    const container = document.getElementById('gv-status-toast-container');
    expect(container).not.toBeNull();
    if (container) {
      expect(container.style.left).not.toBe('');
      expect(container.style.top).not.toBe('');
      expect(container.style.right).toBe('auto');
    }
  });
});
