import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import { FolderFeedback } from '../FolderFeedback';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) =>
    key === 'batch_delete_in_progress' ? 'Deleting {current}/{total}' : key,
}));

describe('FolderFeedback', () => {
  let feedback: FolderFeedback;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    feedback = new FolderFeedback();
  });

  afterEach(() => {
    feedback.destroy();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('shows truncated titles after the hover delay and supports forced folder context', () => {
    const title = document.createElement('span');
    document.body.appendChild(title);
    Object.defineProperties(title, { scrollWidth: { value: 80 }, clientWidth: { value: 80 } });

    feedback.showTooltip(title, 'A complete title');
    vi.advanceTimersByTime(200);
    expect(document.querySelector('.gv-tooltip.show')).toBeNull();

    feedback.showTooltip(title, 'Folder / Nested', true);
    vi.advanceTimersByTime(199);
    expect(document.querySelector('.gv-tooltip.show')).toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector('.gv-tooltip.show')?.textContent).toBe('Folder / Nested');
  });

  it('cancels a pending tooltip when its anchor loses hover', () => {
    const title = document.createElement('span');
    feedback.showTooltip(title, 'Hidden title', true);
    feedback.hideTooltip();
    vi.advanceTimersByTime(1000);
    expect(document.querySelector('.gv-tooltip.show')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a warning about the folder data longer than a passing notice', () => {
    feedback.showNotification('Saved', 'success');
    feedback.showNotificationByLevel('Storage warning', 'warning');
    expect(toastDriver.all().map(({ message, tone }) => ({ message, tone }))).toEqual([
      { message: 'Saved', tone: 'success' },
      { message: 'Storage warning', tone: 'warning' },
    ]);
    vi.advanceTimersByTime(3000);
    expect(toastDriver.messages()).toEqual(['Storage warning']);
    vi.advanceTimersByTime(4000);
    expect(toastDriver.messages()).toEqual([]);
  });

  it('replaces a notice on the same channel in place', () => {
    feedback.showNotification('Uploading...', 'info', 'transfer');
    feedback.showNotification('Unrelated', 'info');
    feedback.showNotification('Uploaded', 'success', 'transfer');
    expect(toastDriver.messages()).toEqual(['Uploaded', 'Unrelated']);
  });

  it('shows one pending batch progress, updated in place, until it is hidden', () => {
    feedback.showBatchDeleteProgress(1, 3);
    feedback.updateBatchDeleteProgress(2, 3);
    feedback.showBatchDeleteProgress(1, 4);
    const progress = toastDriver.all();
    expect(progress.map(({ message, pending }) => ({ message, pending }))).toEqual([
      { message: 'Deleting 1/4', pending: true },
    ]);
    vi.advanceTimersByTime(60_000);
    expect(toastDriver.messages()).toEqual(['Deleting 1/4']);

    feedback.hideBatchDeleteProgress();
    feedback.updateBatchDeleteProgress(3, 4);
    expect(toastDriver.all()).toEqual([]);
  });

  it('disposes every pending feedback surface on destruction and shows nothing later', () => {
    feedback.showBatchDeleteProgress(1, 4);
    feedback.showNotification('Pending');
    feedback.showRecoveryNotification('lost');
    feedback.showTooltip(document.createElement('span'), 'Pending title', true);

    feedback.destroy();
    expect(toastDriver.all()).toEqual([]);
    expect(document.querySelector('.gv-tooltip')).toBeNull();
    feedback.showNotification('Late completion');
    feedback.showBatchDeleteProgress(4, 4);
    vi.runAllTimers();
    expect(toastDriver.all()).toEqual([]);
  });
});
