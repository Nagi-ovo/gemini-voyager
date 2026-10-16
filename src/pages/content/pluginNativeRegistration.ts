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
import { activateChatGptResponseNotification } from '@/features/plugins/builtin/chatgptResponseNotification';
import { activateChatGptTemporaryHandoff } from '@/features/plugins/builtin/chatgptTemporaryHandoff';
import {
  type NativeHandler,
  registerNativeHandler,
  verifyNativeHandlerBindings,
} from '@/features/plugins/runtime/nativeHandlers';

import { activateGeminiCanvasCopy } from './canvasExport/pluginHandler';
import { activateGeminiChatWidth, updateGeminiChatWidthSettings } from './chatWidth/pluginHandler';
import { activateGeminiContextSync } from './contextSync/pluginHandler';
import { activateGeminiDeepResearchExport } from './deepResearch/pluginHandler';
import { activateGeminiDefaultModel } from './defaultModel/pluginHandler';
import {
  activateGeminiEditInputWidth,
  updateGeminiEditInputWidthSettings,
} from './editInputWidth/pluginHandler';
import { activateGeminiFork } from './fork/pluginHandler';
import {
  activateGeminiGemsSidebar,
  updateGeminiGemsSidebarSettings,
} from './gemsSidebar/pluginHandler';
import { activateGeminiHighlight } from './highlight/pluginHandler';
import {
  activateGeminiInputCollapse,
  updateGeminiInputCollapseSettings,
} from './inputCollapse/pluginHandler';
import { activateGeminiPreventAutoScroll } from './preventAutoScroll/pluginHandler';
import { activateGeminiPromptHistory } from './promptHistory/pluginHandler';
import { activateGeminiQuoteReply } from './quoteReply/pluginHandler';
import { activateGeminiResearchPack } from './researchPack/pluginHandler';
import { activateGeminiResponseNotification } from './responseNotification/pluginHandler';
import { activateGeminiSafariEnterFix } from './sendBehavior/pluginHandler';
import {
  activateGeminiSidebarAutoHide,
  activateGeminiSidebarFullHide,
} from './sidebarAutoHide/pluginHandler';
import {
  activateGeminiSidebarWidth,
  updateGeminiSidebarWidthSettings,
} from './sidebarWidth/pluginHandler';
import { activateGeminiTimeline } from './timeline/pluginHandler';
import { activateGeminiUsageStatus } from './usageStatus/pluginHandler';

export const NATIVE_HANDLER_BINDINGS: Readonly<Record<string, NativeHandler>> = {
  'voyager.gemini-context-sync': { activate: activateGeminiContextSync },
  'voyager.gemini-gems-sidebar': {
    activate: activateGeminiGemsSidebar,
    updateSettings: updateGeminiGemsSidebarSettings,
  },
  'voyager.gemini-sidebar-width': {
    activate: activateGeminiSidebarWidth,
    updateSettings: updateGeminiSidebarWidthSettings,
  },
  'voyager.gemini-sidebar-auto-hide': { activate: activateGeminiSidebarAutoHide },
  'voyager.gemini-sidebar-full-hide': { activate: activateGeminiSidebarFullHide },
  'voyager.gemini-timeline': { activate: activateGeminiTimeline },
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
  'voyager.chatgpt-response-notification': {
    activate: activateChatGptResponseNotification,
  },
  // Owned by `sites/featureOwners.ts`: mounted only once the plugin owns Gemini's chat width.
  'voyager.gemini-chat-width': {
    activate: activateGeminiChatWidth,
    updateSettings: updateGeminiChatWidthSettings,
  },
  'voyager.gemini-canvas-copy': { activate: activateGeminiCanvasCopy },
  'voyager.gemini-deep-research-export': { activate: activateGeminiDeepResearchExport },
  'voyager.gemini-edit-input-width': {
    activate: activateGeminiEditInputWidth,
    updateSettings: updateGeminiEditInputWidthSettings,
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
  'voyager.gemini-fork': {
    activate: activateGeminiFork,
  },
  'voyager.gemini-usage-status': {
    activate: activateGeminiUsageStatus,
  },
  'voyager.gemini-quote-reply': {
    activate: activateGeminiQuoteReply,
  },
  'voyager.gemini-highlight': {
    activate: activateGeminiHighlight,
  },
  'voyager.gemini-prevent-auto-scroll': {
    activate: activateGeminiPreventAutoScroll,
  },
  'voyager.gemini-response-notification': {
    activate: activateGeminiResponseNotification,
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
