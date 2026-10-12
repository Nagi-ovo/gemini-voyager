/**
 * The single wiring table between builtin plugin manifests (BUILTIN_PLUGINS)
 * and their first-party native handlers. Kept as data so a test can compare
 * its keys against NATIVE_BUILTIN_PLUGIN_IDS — adding a manifest without a
 * handler (or vice versa) fails the suite instead of shipping a dead toggle.
 */
import { NATIVE_BUILTIN_PLUGIN_IDS } from '@/features/plugins/builtin';
import {
  startChatGptExportPlugin,
  stopChatGptExportPlugin,
} from '@/features/plugins/builtin/chatgptExport/runtime';
import { activateChatGptFolders } from '@/features/plugins/builtin/chatgptFolders';
import { activateChatGptTemporaryHandoff } from '@/features/plugins/builtin/chatgptTemporaryHandoff';
import {
  type NativeHandler,
  registerNativeHandler,
  verifyNativeHandlerBindings,
} from '@/features/plugins/runtime/nativeHandlers';

import { activateGeminiChatWidth, updateGeminiChatWidthSettings } from './chatWidth/pluginHandler';
import { activateGeminiDefaultModel } from './defaultModel/pluginHandler';
import {
  activateGeminiInputCollapse,
  updateGeminiInputCollapseSettings,
} from './inputCollapse/pluginHandler';
import { activateGeminiPromptHistory } from './promptHistory/pluginHandler';
import { activateGeminiResearchPack } from './researchPack/pluginHandler';
import { activateGeminiSafariEnterFix } from './sendBehavior/pluginHandler';

export const NATIVE_HANDLER_BINDINGS: Readonly<Record<string, NativeHandler>> = {
  'voyager.gemini-safari-enter-fix': { activate: activateGeminiSafariEnterFix },
  // formula-copy, input-vim and claude-timeline invoke primitives through a
  // `native` op in their manifests (see verbs/); they need no binding here.
  'voyager.chatgpt-export': {
    start: startChatGptExportPlugin,
    stop: stopChatGptExportPlugin,
  },
  'voyager.chatgpt-temporary-handoff': {
    activate: activateChatGptTemporaryHandoff,
  },
  'voyager.chatgpt-folders': {
    activate: activateChatGptFolders,
  },
  // Owned by `sites/featureOwners.ts`: mounted only once the plugin owns Gemini's chat width.
  'voyager.gemini-chat-width': {
    activate: activateGeminiChatWidth,
    updateSettings: updateGeminiChatWidthSettings,
  },
  // Owned by `sites/featureOwners.ts`: mounted only once the plugin owns Gemini's prompt history.
  'voyager.gemini-prompt-history': {
    activate: activateGeminiPromptHistory,
  },
  // Owned by `sites/featureOwners.ts`: mounted only once the plugin owns Gemini's input collapse.
  'voyager.gemini-input-collapse': {
    activate: activateGeminiInputCollapse,
    updateSettings: updateGeminiInputCollapseSettings,
  },
  // Owned by `sites/featureOwners.ts`: mounted only once the plugin owns Gemini's research pack.
  'voyager.gemini-research-pack': {
    activate: activateGeminiResearchPack,
  },
  // Owned by `sites/featureOwners.ts`: mounted only once the plugin owns Gemini's default model.
  'voyager.gemini-default-model': {
    activate: activateGeminiDefaultModel,
  },
};

/**
 * Register every builtin native handler and verify the two-way manifest ↔
 * handler binding. Must run unconditionally, before `startPluginHost()`.
 */
export function registerBuiltinNativeHandlers(): void {
  for (const [id, handler] of Object.entries(NATIVE_HANDLER_BINDINGS)) {
    registerNativeHandler(id, handler);
  }
  verifyNativeHandlerBindings(NATIVE_BUILTIN_PLUGIN_IDS);
}
