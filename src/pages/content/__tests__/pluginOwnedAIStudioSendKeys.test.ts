import { type Mock, afterEach, beforeEach, expect, it, vi } from 'vitest';

import * as sendKeys from '@/core/services/composer/sendKeys/sendKeyCoordinator';
import { StorageKeys } from '@/core/types/common';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';
import { documentAt } from '@/tests/documentAt';

import { startAIStudioSendKeys } from '../inputStartup';

let host: PluginHost | null = null;
let coordinator: sendKeys.SendKeyCoordinator | null = null;
const official = OFFICIAL_PLUGIN_IDS.aistudioEnterSend;

function fixture(url: string) {
  document.body.innerHTML =
    '<ms-prompt-box><textarea formcontrolname="promptText">draft</textarea>' +
    '<div class="buttons-row"><ms-run-button><button aria-label="Run">Run</button></ms-run-button></div></ms-prompt-box>';
  const input = document.querySelector('textarea')!;
  const button = document.querySelector('button')!;
  Object.defineProperty(button, 'offsetParent', { configurable: true, value: document.body });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
  const clicks = vi.fn();
  button.addEventListener('click', clicks);
  const doc = documentAt(url);
  coordinator = sendKeys.createSendKeyCoordinator('aistudio', { doc });
  vi.spyOn(sendKeys, 'getSendKeyCoordinator').mockReturnValue(coordinator);
  return { doc, input, clicks };
}

function press(input: HTMLTextAreaElement, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  input.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockResolvedValue({});
});
afterEach(() => {
  host?.stop();
  coordinator?.stop();
  host = null;
  coordinator = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it.each(['com', 'cn'])(
  'mounts AI Studio Enter send live when the %s master switch turns back on',
  async (domain) => {
    const url = `https://aistudio.google.${domain}/prompts/new_chat`;
    const { doc, input, clicks } = fixture(url);
    const admission = createOfficialAdmission();
    await startAIStudioSendKeys(admission);
    admission.close();
    let flip: (on: boolean) => void = () => {};
    host = new PluginHost({
      url,
      doc,
      admission,
      sources: [new BundledCatalogPluginSource()],
      legacySettings: {
        load: async () => ({
          [StorageKeys.AISTUDIO_ENTER_SEND]: true,
          [StorageKeys.CTRL_ENTER_SEND]: false,
        }),
        subscribe: () => () => {},
      },
      surfaceSwitch: {
        read: async () => false,
        subscribe(callback) {
          flip = callback;
          return () => {};
        },
      },
      requestCatalogRefresh: () => {},
      isTopFrame: true,
    });
    await host.start();
    press(input);
    expect(clicks).not.toHaveBeenCalled();
    flip(true);
    await vi.waitFor(() =>
      expect(host?.getStatuses().find((s) => s.id === official)?.kind).toBe('mounted'),
    );
    press(input);
    expect(clicks).toHaveBeenCalledOnce();
    input.value = 'draft';
    input.setSelectionRange(5, 5);
    const newline = press(input, { ctrlKey: true });
    expect(newline.defaultPrevented).toBe(true);
    expect(input.value).toBe('draft\n');
    expect(clicks).toHaveBeenCalledOnce();
    flip(false);
    await vi.waitFor(() =>
      expect(host?.getStatuses().find((s) => s.id === official)?.kind).not.toBe('mounted'),
    );
    expect(press(input).defaultPrevented).toBe(false);
    expect(clicks).toHaveBeenCalledOnce();
  },
);

it('does not reuse the Gemini Ctrl+Enter switch on AI Studio', async () => {
  const url = 'https://aistudio.google.com/prompts/new_chat';
  const { doc, input, clicks } = fixture(url);
  const admission = createOfficialAdmission();
  await startAIStudioSendKeys(admission);
  admission.close();
  host = new PluginHost({
    url,
    doc,
    admission,
    sources: [new BundledCatalogPluginSource()],
    legacySettings: {
      load: async () => ({
        [StorageKeys.AISTUDIO_ENTER_SEND]: false,
        [StorageKeys.CTRL_ENTER_SEND]: true,
      }),
      subscribe: () => () => {},
    },
    surfaceSwitch: null,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
  await host.start();
  expect(press(input).defaultPrevented).toBe(false);
  expect(clicks).not.toHaveBeenCalled();
});
