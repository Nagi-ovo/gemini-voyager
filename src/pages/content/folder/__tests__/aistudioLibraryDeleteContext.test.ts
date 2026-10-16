import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createToaster } from '@/core/ui/toast/toaster';

import { LibraryBatchDeleter } from '../aistudioLibraryBatchDelete';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function () {
    return document.body;
  });
  document.body.innerHTML =
    '<table><tr class="mat-mdc-row"><td><a href="/prompts/p1">One</a><button aria-label="More options">More</button></td></tr></table><div class="cdk-overlay-container"></div>';
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('AI Studio destructive click context', () => {
  it('never clicks the delete menu after the account context changes', async () => {
    let current = true;
    const menuClick = vi.fn();
    document.querySelector('button')!.addEventListener('click', () => {
      const button = document.createElement('button');
      button.dataset.testId = 'delete-button';
      button.addEventListener('click', menuClick);
      document.querySelector('.cdk-overlay-container')!.append(button);
      current = false;
    });
    const toaster = createToaster();
    const run = new LibraryBatchDeleter(() => 'delete', toaster).run(['p1'], () => current);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await run).toEqual({ successCount: 0, failedCount: 1 });
    expect(menuClick).not.toHaveBeenCalled();
    toaster.destroy();
  });

  it('never confirms a native delete after the account context changes', async () => {
    let current = true;
    const confirmClick = vi.fn();
    document.querySelector('button')!.addEventListener('click', () => {
      const button = document.createElement('button');
      button.dataset.testId = 'delete-button';
      button.addEventListener('click', () => {
        button.remove();
        const confirm = document.createElement('button');
        confirm.dataset.testId = 'confirm-delete';
        confirm.addEventListener('click', confirmClick);
        document.querySelector('.cdk-overlay-container')!.append(confirm);
        current = false;
      });
      document.querySelector('.cdk-overlay-container')!.append(button);
    });
    const toaster = createToaster();
    const run = new LibraryBatchDeleter(() => 'delete', toaster).run(['p1'], () => current);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await run).toEqual({ successCount: 0, failedCount: 1 });
    expect(confirmClick).not.toHaveBeenCalled();
    toaster.destroy();
  });
});
