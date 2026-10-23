import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TranslationKey } from '@/utils/translations';

import { usePromptDataTransfer } from '../../hooks/usePromptDataTransfer';
import { PromptDataTransfer } from '../PromptDataTransfer';

const translate = (key: TranslationKey): string => key;

function Harness() {
  return <PromptDataTransfer t={translate} transfer={usePromptDataTransfer(translate)} />;
}

describe('PromptDataTransfer on Firefox for Android', () => {
  let container: HTMLDivElement;
  let root: Root;
  const sendMessage = vi.fn(async () => ({ ok: true }));

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const runtime = chrome.runtime as unknown as Record<string, unknown>;
    runtime.sendMessage = sendMessage;
    runtime.getPlatformInfo = async () => ({ os: 'android' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sendMessage.mockClear();
  });

  it('turns off the cloud pull and push, says why, and keeps file export and import', async () => {
    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const button = (label: string) =>
      [...container.querySelectorAll('button')].find((item) => item.textContent === label)!;
    expect(container.textContent).toContain('syncGoogleDriveUnavailableAndroid');
    expect(button('promptCloudPull').disabled).toBe(true);
    expect(button('promptCloudPush').disabled).toBe(true);
    expect(button('pm_export').disabled).toBe(false);
    expect(button('pm_import').disabled).toBe(false);

    act(() => {
      button('promptCloudPull').click();
      button('promptCloudPush').click();
    });
    // No Drive merge is asked for, so no Google sign-in can open.
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
