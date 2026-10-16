import React, { act, useEffect } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { TranslationKey } from '@/utils/translations';

import {
  PROMPT_MANAGER_STORAGE_DEFAULTS,
  type PromptManagerSettings,
  usePromptManagerSettings,
} from '../usePromptManagerSettings';

vi.mock('webextension-polyfill', () => ({
  default: { permissions: { contains: vi.fn(async () => true) } },
}));
const translate = (key: TranslationKey): string => key;

describe('usePromptManagerSettings', () => {
  let root: Root;
  let container: HTMLDivElement;
  let settings: PromptManagerSettings;
  const write = vi.fn(async (_payload: Record<string, unknown>) => {});
  const refresh = vi.fn(async () => {});

  function Harness() {
    const current = usePromptManagerSettings({
      t: translate,
      pluginManifests: [],
      refreshActiveTabContext: refresh,
      writeSyncStorage: write,
    });
    useEffect(() => {
      settings = current;
    }, [current]);
    return null;
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    write.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('hydrates all five flags and website coverage from the popup bulk read', async () => {
    await act(async () =>
      settings.hydrateFromStorage({
        [StorageKeys.HIDE_PROMPT_MANAGER]: 1,
        [StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO]: true,
        [StorageKeys.PROMPT_HISTORY_ENABLED]: true,
        [StorageKeys.SLASH_PROMPT_ENABLED]: false,
        [StorageKeys.PROMPT_INSERT_ON_CLICK]: true,
        [StorageKeys.PROMPT_CUSTOM_WEBSITES]: ['claude.ai'],
      }),
    );
    expect(settings.values).toEqual({
      hidePromptManager: true,
      promptTriggerMascotLogo: true,
      slashPromptEnabled: false,
      promptInsertOnClickEnabled: true,
    });
    expect(settings.customWebsites).toEqual(['claude.ai']);
    expect(write).not.toHaveBeenCalled();
  });

  it('preserves default and strict boolean semantics while patching only the requested flag', () => {
    act(() => settings.hydrateFromStorage(PROMPT_MANAGER_STORAGE_DEFAULTS));
    expect(settings.values).toEqual({
      hidePromptManager: false,
      promptTriggerMascotLogo: false,
      slashPromptEnabled: true,
      promptInsertOnClickEnabled: false,
    });
    act(() => settings.onChange({ promptTriggerMascotLogo: true }));
    expect(settings.values.promptTriggerMascotLogo).toBe(true);
    expect(settings.values.slashPromptEnabled).toBe(true);
    expect(write).toHaveBeenCalledWith({ [StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO]: true });
    act(() =>
      settings.hydrateFromStorage({
        [StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO]: 'true',
        [StorageKeys.PROMPT_INSERT_ON_CLICK]: 1,
      }),
    );
    expect(settings.values.promptTriggerMascotLogo).toBe(false);
    expect(settings.values.promptInsertOnClickEnabled).toBe(false);
  });
});
