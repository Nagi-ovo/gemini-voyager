import { type Mock, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as sendKeys from '@/core/services/composer/sendKeys/sendKeyCoordinator';
import { StorageKeys } from '@/core/types/common';
import { LocalPluginSource } from '@/features/plugins/local/LocalPluginSource';
import type { LocalPluginRecordMap } from '@/features/plugins/local/localPluginStore';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';
import { documentAt } from '@/tests/documentAt';

import { startGeminiSendKeys } from '../inputStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';

const GEMINI_URL = 'https://gemini.google.com/app/test';
const LOCAL_SEND = 'local.me.send';
const OFFICIAL_SEND = OFFICIAL_PLUGIN_IDS.geminiCtrlEnterSend;
const records: LocalPluginRecordMap = {
  [LOCAL_SEND]: {
    manifest: {
      id: LOCAL_SEND,
      name: 'My send shortcut',
      description: 'Send with Ctrl+Enter',
      author: 'me',
      category: 'productivity',
      license: 'MIT',
      version: '1.0.0',
      engine: '>=1.8.0',
      tier: 'declarative',
      matches: ['https://gemini.google.com/*'],
      contributes: { domOps: [{ op: 'native', handler: 'sendShortcut', params: {} }] },
    },
    importedAt: 1,
    updatedAt: 1,
  },
};

let host: PluginHost | null = null;
let coordinator: sendKeys.SendKeyCoordinator;

function fixture(): { input: HTMLTextAreaElement; clicks: Mock } {
  document.body.innerHTML =
    '<div class="text-input-field"><textarea>draft</textarea>' +
    '<button class="send-button submit" aria-label="Send message">Send</button></div>';
  const input = document.querySelector('textarea')!;
  const button = document.querySelector('button')!;
  Object.defineProperty(button, 'offsetParent', {
    configurable: true,
    get: () => button.parentElement,
  });
  const clicks = vi.fn();
  button.addEventListener('click', clicks);
  return { input, clicks };
}

function enter(input: HTMLTextAreaElement): void {
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function makeHost(
  admission: ReturnType<typeof createOfficialAdmission>,
  enabled: boolean,
): PluginHost {
  return new PluginHost({
    url: GEMINI_URL,
    doc: documentAt(GEMINI_URL),
    sources: [
      new BundledCatalogPluginSource(),
      new BuiltinPluginSource(),
      new LocalPluginSource({ loadRecords: async () => records }),
    ],
    admission,
    legacySettings: {
      load: async () => ({
        [StorageKeys.CTRL_ENTER_SEND]: enabled,
        [StorageKeys.SAFARI_ENTER_FIX]: true,
      }),
      subscribe: () => () => {},
    },
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
}

function mounted(id: string): boolean {
  const kind = host?.getStatuses().find((status) => status.id === id)?.kind;
  return kind === 'mounted' || kind === 'no-effect';
}

beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
    gvPluginsState: { [LOCAL_SEND]: { enabled: true, installedAt: 1 } },
  });
  (chrome.storage.sync.get as unknown as Mock).mockImplementation(
    (keys: unknown, callback?: (value: Record<string, unknown>) => void) => {
      const result = typeof keys === 'object' && keys !== null ? { ...keys } : {};
      callback?.(result);
      return Promise.resolve(result);
    },
  );
  coordinator = sendKeys.createSendKeyCoordinator('gemini', {
    doc: documentAt(GEMINI_URL),
    isSafari: () => false,
  });
  vi.spyOn(sendKeys, 'getSendKeyCoordinator').mockReturnValue(coordinator);
});
afterEach(() => {
  host?.stop();
  host = null;
  coordinator.stop();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('Gemini send keys owned by official plugins', () => {
  it('admits both Gemini send plugins at the native start point and starts no native send behavior', async () => {
    const admission = createOfficialAdmission();
    await startGeminiSendKeys(admission);
    expect(admission.stateOf(OFFICIAL_SEND)).toBe('admitted');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiSafariEnterFix)).toBe('admitted');
  });

  it.each([true, false])(
    'sends once with the official switch %s while the rival is blocked or takes over',
    async (officialEnabled) => {
      const { input, clicks } = fixture();
      const admission = createOfficialAdmission();
      await startGeminiSendKeys(admission);
      admission.close();
      host = makeHost(admission, officialEnabled);
      await host.start();
      const owner = officialEnabled ? OFFICIAL_SEND : LOCAL_SEND;
      await vi.waitFor(() => expect(mounted(owner)).toBe(true));
      if (officialEnabled) {
        expect(host.getStatuses().find((status) => status.id === LOCAL_SEND)).toMatchObject({
          kind: 'blocked',
          blockedReason: 'conflict',
        });
      } else expect(mounted(OFFICIAL_SEND)).toBe(false);
      expect(mounted(OFFICIAL_PLUGIN_IDS.geminiSafariEnterFix)).toBe(false);
      expect(coordinator.effectiveSendKey()).toBe('ctrlEnter');
      enter(input);
      expect(clicks).toHaveBeenCalledTimes(1);
      host.stop();
      await vi.waitFor(() => expect(coordinator.effectiveSendKey()).toBe('host'));
      enter(input);
      expect(clicks).toHaveBeenCalledTimes(1);
    },
  );

  it('reserves the official send key before cold-start admission so a stored local shortcut cannot take it', async () => {
    const { input, clicks } = fixture();
    const admission = createOfficialAdmission();
    host = makeHost(admission, true);
    await host.start();
    await vi.waitFor(() => {
      expect(host?.getStatuses().find((status) => status.id === LOCAL_SEND)).toMatchObject({
        kind: 'blocked',
        blockedReason: 'conflict',
      });
    });
    enter(input);
    expect(clicks).not.toHaveBeenCalled();
    await startGeminiSendKeys(admission);
    await vi.waitFor(() => expect(mounted(OFFICIAL_SEND)).toBe(true));
    enter(input);
    expect(clicks).toHaveBeenCalledTimes(1);
  });
});
