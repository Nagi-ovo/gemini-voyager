import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { createViewModeToggle } from '../promptViewModeToggle';

vi.mock('webextension-polyfill', () => ({ default: globalThis.chrome }));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(enabled = true) {
  const button = document.createElement('button');
  const panel = document.createElement('div');
  const onChange = vi.fn();
  const toggle = createViewModeToggle({
    button,
    panel,
    t: (key) => key,
    isEnabled: () => enabled,
    onChange,
  });
  return { button, panel, onChange, toggle };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(chrome.storage.sync.get).mockResolvedValue({} as never);
  vi.mocked(chrome.storage.local.get).mockResolvedValue({} as never);
});

describe('prompt view-mode toggle', () => {
  it('starts compact and labels the button with the action it performs', () => {
    const { button, panel, toggle } = setup();

    expect(toggle.mode).toBe('compact');
    expect(panel.getAttribute('data-gv-view')).toBe('compact');
    expect(button.title).toBe('pm_view_comfortable');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('restores a mode saved locally when sync holds none', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({
      [StorageKeys.PROMPT_VIEW_MODE]: 'comfortable',
    } as never);
    const { panel, onChange, toggle } = setup();
    await flush();

    expect(toggle.mode).toBe('comfortable');
    expect(panel.getAttribute('data-gv-view')).toBe('comfortable');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('switches and saves on click, falling back to local storage when sync fails', async () => {
    vi.mocked(chrome.storage.sync.set).mockRejectedValueOnce(new Error('sync unavailable'));
    const { button, onChange, toggle } = setup();

    button.click();
    await flush();

    expect(toggle.mode).toBe('comfortable');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [StorageKeys.PROMPT_VIEW_MODE]: 'comfortable',
    });
  });

  it('ignores clicks while disabled', async () => {
    const { button, onChange, toggle } = setup(false);

    button.click();
    await flush();

    expect(toggle.mode).toBe('compact');
    expect(onChange).not.toHaveBeenCalled();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });

  it('follows a mode chosen in another tab and ignores invalid values', () => {
    const { onChange, toggle } = setup();

    toggle.applyStorageChange('sync', { [StorageKeys.PROMPT_VIEW_MODE]: { newValue: 'grid' } });
    expect(toggle.mode).toBe('compact');

    toggle.applyStorageChange('local', {
      [StorageKeys.PROMPT_VIEW_MODE]: { newValue: 'comfortable' },
    });
    expect(toggle.mode).toBe('comfortable');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
