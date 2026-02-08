import { afterEach, describe, expect, it, vi } from 'vitest';

import { showExportToast } from '../ExportToast';

describe('ExportToast', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.gv-export-toast').forEach((node) => node.remove());
  });

  it('creates toast and auto-dismisses it', async () => {
    vi.useFakeTimers();

    showExportToast('Safari tip');

    const toast = document.querySelector('.gv-export-toast') as HTMLElement | null;
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toBe('Safari tip');
    expect(toast?.classList.contains('show')).toBe(true);

    await vi.advanceTimersByTimeAsync(2500);
    expect(document.querySelector('.gv-export-toast')).toBeNull();
  });

  it('is idempotent and reuses one toast element', async () => {
    vi.useFakeTimers();

    showExportToast('first');
    showExportToast('second');

    const toasts = document.querySelectorAll('.gv-export-toast');
    expect(toasts).toHaveLength(1);
    expect((toasts[0] as HTMLElement).textContent).toBe('second');

    await vi.advanceTimersByTimeAsync(1000);
    expect(document.querySelector('.gv-export-toast')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelector('.gv-export-toast')).toBeNull();
  });
});
