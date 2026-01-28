import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastManager } from '../index';

// Mock WatermarkEngine to avoid asset import issues
vi.mock('../watermarkEngine', () => ({
  WatermarkEngine: {
    create: vi.fn(),
  },
}));

// Mock chrome API
global.chrome = {
  i18n: {
    getMessage: vi.fn((key) => key),
  },
} as any;

describe('ToastManager', () => {
  let toastManager: ToastManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    toastManager = new ToastManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create container on initialization', () => {
    expect(document.getElementById('gv-toast-container')).not.toBeNull();
  });

  it('should show a toast message', () => {
    toastManager.show('Hello World', 'info');
    const toast = document.querySelector('#gv-toast-container > div');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('Hello World');
    expect(toast?.textContent).toContain('info'); // icon
  });

  it('should stack multiple toasts', () => {
    toastManager.show('Message 1', 'info', 0, 'key1');
    toastManager.show('Message 2', 'warning', 0, 'key2');

    const toasts = document.querySelectorAll('#gv-toast-container > div');
    expect(toasts.length).toBe(2);
    expect(toasts[0].textContent).toContain('Message 1');
    expect(toasts[1].textContent).toContain('Message 2');
  });

  it('should update existing toast with same key', () => {
    toastManager.show('Processing...', 'info', 0, 'status');
    let toasts = document.querySelectorAll('#gv-toast-container > div');
    expect(toasts.length).toBe(1);
    expect(toasts[0].textContent).toContain('Processing...');

    toastManager.show('Success!', 'success', 3000, 'status');
    toasts = document.querySelectorAll('#gv-toast-container > div');
    expect(toasts.length).toBe(1);
    expect(toasts[0].textContent).toContain('Success!');
    expect(toasts[0].textContent).toContain('check_circle'); // success icon
  });

  it('should auto-hide toast after duration', () => {
    toastManager.show('Auto hide', 'info', 1000);
    expect(document.querySelectorAll('#gv-toast-container > div').length).toBe(1);

    vi.advanceTimersByTime(1500); // 1000 + buffer
    expect(document.querySelectorAll('#gv-toast-container > div').length).toBe(0);
  });

  it('should correctly handle "Large File" warning stacking', () => {
    // 1. Processing starts (status key)
    toastManager.show('Processing...', 'info', 0, 'download-status');

    // 2. Large File warning appears (different key)
    toastManager.show('Large File', 'warning', 4000, 'download-large-file');

    let toasts = document.querySelectorAll('#gv-toast-container > div');
    expect(toasts.length).toBe(2);
    expect(toasts[0].textContent).toContain('Processing...');
    expect(toasts[1].textContent).toContain('Large File');

    // 3. Processing completes (updates status key)
    toastManager.show('Success', 'success', 3000, 'download-status');

    toasts = document.querySelectorAll('#gv-toast-container > div');
    expect(toasts.length).toBe(2);
    expect(toasts[0].textContent).toContain('Success'); // Updated
    expect(toasts[1].textContent).toContain('Large File'); // Still there
  });
});
