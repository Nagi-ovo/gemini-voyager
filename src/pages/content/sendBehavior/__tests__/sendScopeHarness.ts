import { vi } from 'vitest';

import * as sendKeys from '@/core/services/composer/sendKeys/sendKeyCoordinator';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { sendShortcutPrimitive } from '@/features/plugins/verbs/sendShortcut';

import { activateGeminiSafariEnterFix } from '../pluginHandler';

/** Actual primitive scopes on the page coordinator, without the retired switch wrapper. */
export async function startSendScope(
  site: 'gemini' | 'aistudio' = 'gemini',
  options: { main?: boolean; safari?: boolean; coordinator?: sendKeys.SendKeyCoordinator } = {},
) {
  const url = new URL(
    site === 'gemini'
      ? 'https://gemini.google.com/app'
      : 'https://aistudio.google.com/prompts/new_chat',
  );
  const doc = new Proxy(document, {
    get(target, key) {
      if (key === 'location') return url;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const coordinator = options.coordinator ?? sendKeys.createSendKeyCoordinator(site, { doc });
  const getter = vi.spyOn(sendKeys, 'getSendKeyCoordinator').mockReturnValue(coordinator);
  const main = new PluginScope();
  const fallback = new PluginScope();
  if (options.main !== false)
    sendShortcutPrimitive.activate(
      main,
      { mode: site === 'gemini' ? 'ctrlEnterSends' : 'enterSends' },
      {
        doc,
        adapter: null,
        pluginId: 'test.send-scope',
        settings: {},
        setTargetCounter: () => {},
      },
    );
  if (options.safari) activateGeminiSafariEnterFix(fallback);
  return {
    stopMain: () => main.dispose(),
    stop() {
      void main.dispose();
      void fallback.dispose();
      if (!options.coordinator) coordinator.stop();
      getter.mockRestore();
    },
  };
}
