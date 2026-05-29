import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FolderManager } from '../manager';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

type TestableManager = {
  lastInputModality: 'pointer' | 'keyboard';
  releaseTriggerFocusAfterPointerClose: () => void;
  destroy: () => void;
};

/**
 * After a conversation ⋮ menu we injected into closes, mat-menu restores focus
 * to the trigger, keeping the row highlighted via :focus-within. We drop that
 * focus only for pointer dismissals, and never when a dialog/overlay is present.
 */
describe('menu close focus release', () => {
  let manager: FolderManager | null = null;
  let trigger: HTMLButtonElement;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new FolderManager();
    trigger = document.createElement('button');
    trigger.setAttribute('data-test-id', 'actions-menu-button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
  });

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function run() {
    (manager as unknown as TestableManager).releaseTriggerFocusAfterPointerClose();
    vi.runAllTimers();
  }

  it('blurs the trigger after a pointer-driven close', () => {
    (manager as unknown as TestableManager).lastInputModality = 'pointer';
    run();
    expect(document.activeElement).not.toBe(trigger);
  });

  it('keeps focus on the trigger after a keyboard-driven close (a11y)', () => {
    (manager as unknown as TestableManager).lastInputModality = 'keyboard';
    run();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not blur when a CDK overlay/backdrop is open', () => {
    (manager as unknown as TestableManager).lastInputModality = 'pointer';
    const backdrop = document.createElement('div');
    backdrop.className = 'cdk-overlay-backdrop';
    document.body.appendChild(backdrop);
    run();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not blur when our move-to-folder dialog is open', () => {
    (manager as unknown as TestableManager).lastInputModality = 'pointer';
    const dialog = document.createElement('div');
    dialog.className = 'gv-folder-dialog-overlay';
    document.body.appendChild(dialog);
    run();
    expect(document.activeElement).toBe(trigger);
  });

  it('leaves focus alone when the active element is not a conversation trigger', () => {
    (manager as unknown as TestableManager).lastInputModality = 'pointer';
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
    run();
    expect(document.activeElement).toBe(other);
  });
});
