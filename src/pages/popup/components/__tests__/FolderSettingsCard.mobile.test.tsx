import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TranslationKey } from '@/utils/translations';

import { FolderSettingsCard, type FolderSettingsValues } from '../FolderSettingsCard';

// The popup reads the device once per page, so each test sets it through the reader.
const device = vi.hoisted(() => ({ os: 'mac' }));
vi.mock('@/core/utils/formFactor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/utils/formFactor')>();
  return {
    ...actual,
    readPlatformFormFactor: async () => actual.formFactorFromOs(device.os),
  };
});

const translate = (key: TranslationKey): string => key;

const values: FolderSettingsValues = {
  folderEnabled: true,
  floatingModeEnabled: true,
  floatingOpenOnStart: true,
  hideArchivedConversations: false,
  folderSearchEnabled: true,
  folderProjectEnabled: false,
};

const FOLDER_SWITCHES = [
  'folder-enabled',
  'floating-mode',
  'floating-open-on-start',
  'hide-archived',
  'folder-search-enabled',
  'folder-project-enabled',
];

describe('FolderSettingsCard on a phone', () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderOn = async (os: string) => {
    device.os = os;
    const onChange = vi.fn();
    const onAccountIsolationChange = vi.fn();
    await act(async () => {
      root.render(
        <FolderSettingsCard
          values={values}
          onChange={onChange}
          accountIsolation={{
            enabled: false,
            platformLabel: 'Gemini',
            onChange: onAccountIsolationChange,
          }}
          aiStructureCopy={{ status: 'idle', onCopy: vi.fn() }}
          isVisible={() => true}
          t={translate}
        />,
      );
    });
    // The folder plugins' manifests resolve after the device is read.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const input = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`)!;
    return { onChange, onAccountIsolationChange, input };
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the folder switches with their values but off limits, and says why', async () => {
    const { onChange, onAccountIsolationChange, input } = await renderOn('android');

    expect(container.textContent).toContain('folderUnavailableOnMobile');
    for (const id of FOLDER_SWITCHES) {
      expect(input(id).disabled, id).toBe(true);
    }
    expect(input('folder-enabled').checked).toBe(true);
    const copy = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('aiOrgCopyButton'),
    );
    expect(copy?.disabled).toBe(true);

    act(() => input('folder-enabled').click());
    expect(onChange).not.toHaveBeenCalled();
    // Account isolation scopes more than the folders, so it stays usable.
    expect(input('account-isolation-enabled').disabled).toBe(false);
    act(() => input('account-isolation-enabled').click());
    expect(onAccountIsolationChange).toHaveBeenCalledWith(true);
  });

  it('leaves every switch usable on a desktop', async () => {
    const { input } = await renderOn('mac');

    expect(container.textContent).not.toContain('folderUnavailableOnMobile');
    for (const id of FOLDER_SWITCHES) {
      expect(input(id).disabled, id).toBe(false);
    }
  });
});
