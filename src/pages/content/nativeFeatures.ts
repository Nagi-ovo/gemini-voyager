import { CleanupPositions } from '@/core/types/cleanupPositions';
import { StorageKeys } from '@/core/types/common';

import { startAccountContextBridge } from './accountContext';
import { startChatGptJump } from './chatGptJump';
import { startInputVimMode } from './chatInput/vimMode';
import { CODE_BLOCK_COLLAPSE_TOGGLE, startCodeBlockCollapse } from './codeBlockCollapse';
import { startDefaultModelNative } from './defaultModel/modelLocker';
import { startDraftSave } from './draftSave/index';
import { startEdgeFinalVersionNotice } from './edgeFinalVersionNotice';
import type { NativeFeature } from './featureLifecycle';
import { isForkFeatureEnabledValue } from './fork/featureFlag';
import { startFork } from './fork/index';
import { startGemsHider } from './gemsHider/index';
import { startGemsSidebar } from './gemsSidebar/index';
import { HIGHLIGHT_TOGGLE, startHighlightAction } from './highlight/highlightAction';
import { INPUT_COLLAPSE_TOGGLE, startInputCollapse } from './inputCollapse/index';
import { startInputHaloHider } from './inputHaloHider/index';
import { startMarkdownPatcher } from './markdownPatcher/index';
import { startNativeHealth } from './nativeHealth/index';
import { startBrandTheme } from './platformTheme';
import {
  PREVENT_AUTO_SCROLL_TOGGLE,
  claimPreventAutoScroll,
  startPreventAutoScrollBridge,
} from './preventAutoScroll/index';
import { startPromptHistory } from './promptHistory/index';
import { QUOTE_REPLY_TOGGLE, startQuoteAction } from './quoteReply/quoteAction';
import { startRenderedQuoteStyling } from './quoteReply/renderedQuotes';
import { startRemoteAnnouncements } from './remoteAnnouncements/index';
import { isResearchPackEnabledValue, startResearchPack } from './researchPack/index';
import { startResearchPackReceiver } from './researchPack/receiver';
import { createResponseNotificationRun } from './responseNotification/index';
import { startSelectionToolbarHost } from './selectionToolbar/host';
import { startSendBehavior } from './sendBehavior/index';
import { startStorageQuotaWarningToast } from './storageQuotaWarning';
import { startTimeline } from './timeline/index';
import { startHistoryTimestampPageService } from './timestamp/historyTimestampPageService';
import { startUsageStatus } from './usageStatus/index';
import { USER_LATEX_TOGGLE, startUserLatex } from './userLatex/index';
import { startVisualEffects } from './visualEffects';
import { startWatermarkRemoverFeature } from './watermarkRemover/feature';

/**
 * Native content modules that follow the lifecycle contract in
 * `featureLifecycle.ts`. `index.tsx` starts them from here (so a module cannot
 * be started without being registered) and the parametric lifecycle test
 * walks `NATIVE_FEATURE_LIST`.
 *
 * Start order, host gating and idle yields stay in `index.tsx`; this table
 * only says what a feature is, not when it runs. Keep entries to data — a
 * start that needs logic belongs in the module.
 */
export const NATIVE_FEATURES = {
  accountContextBridge: {
    id: 'account-context-bridge',
    position: CleanupPositions.CleanupAccountContextBridge,
    start: startAccountContextBridge,
  },
  chatGptJump: {
    id: 'chatgpt-jump',
    position: CleanupPositions.CleanupChatGptJump,
    start: startChatGptJump,
    inertReason:
      'Only top-level ChatGPT pages answer account checks and show inaccessible-star hints.',
  },
  brandTheme: {
    id: 'brand-theme',
    position: CleanupPositions.CleanupBrandTheme,
    start: () => startBrandTheme(),
    inertReason:
      'Brand accent is inert where no adapter declares one; the light/dark bridge always runs.',
  },
  edgeFinalVersionNotice: {
    id: 'edge-final-version-notice',
    position: CleanupPositions.CleanupEdgeFinalVersionNotice,
    start: () => startEdgeFinalVersionNotice(),
    inertReason: 'Only the Edge release channel schedules the notice.',
  },
  remoteAnnouncements: {
    id: 'remote-announcements',
    position: CleanupPositions.CleanupRemoteAnnouncements,
    start: startRemoteAnnouncements,
  },
  storageQuotaWarning: {
    id: 'storage-quota-warning',
    position: CleanupPositions.CleanupStorageQuotaWarning,
    start: startStorageQuotaWarningToast,
  },
  inputCollapse: {
    id: 'input-collapse',
    position: CleanupPositions.CleanupInputCollapse,
    start: startInputCollapse,
    toggle: INPUT_COLLAPSE_TOGGLE,
  },
  inputVimMode: {
    id: 'input-vim-mode',
    position: CleanupPositions.CleanupInputVimMode,
    start: () => startInputVimMode(),
  },
  inputHaloHider: {
    id: 'input-halo-hider',
    position: CleanupPositions.CleanupInputHaloHider,
    start: startInputHaloHider,
  },
  sendBehaviorGemini: {
    id: 'send-behavior:gemini',
    position: CleanupPositions.CleanupSendBehavior,
    start: () => startSendBehavior('gemini'),
  },
  /** Page-resident: the MAIN script cannot be uninstalled, so the claim below only flips its flag. */
  preventAutoScrollBridge: {
    id: 'prevent-auto-scroll-bridge',
    position: CleanupPositions.CleanupPreventAutoScrollBridge,
    start: startPreventAutoScrollBridge,
  },
  preventAutoScroll: {
    id: 'prevent-auto-scroll',
    position: CleanupPositions.CleanupPreventAutoScroll,
    start: claimPreventAutoScroll,
    toggle: PREVENT_AUTO_SCROLL_TOGGLE,
    inertReason: 'Only flips the flag on the bridge element its page service owns.',
  },
  /** The one selection toolbar Quote and Highlight register with; it stops after them. */
  selectionToolbarHost: {
    id: 'selection-toolbar-host',
    position: CleanupPositions.CleanupSelectionToolbarHost,
    start: startSelectionToolbarHost,
  },
  /** Styles quotes already sent, whether or not Quote or Highlight runs. */
  renderedQuoteStyling: {
    id: 'rendered-quote-styling',
    position: CleanupPositions.CleanupRenderedQuoteStyling,
    start: startRenderedQuoteStyling,
  },
  quoteReply: {
    id: 'quote-reply',
    position: CleanupPositions.CleanupQuoteReply,
    start: startQuoteAction,
    toggle: QUOTE_REPLY_TOGGLE,
    inertReason: 'Registers an action with the selection toolbar host, which owns the DOM.',
  },
  highlight: {
    id: 'highlight',
    position: CleanupPositions.CleanupHighlight,
    start: () => startHighlightAction(),
    toggle: HIGHLIGHT_TOGGLE,
  },
  sendBehaviorAiStudio: {
    id: 'send-behavior:aistudio',
    position: CleanupPositions.CleanupSendBehavior,
    start: () => startSendBehavior('aistudio'),
  },
  responseCompleteNotification: {
    id: 'response-complete-notification',
    position: CleanupPositions.CleanupResponseCompleteNotification,
    // Follows its own switch live; the initial read continues after the stop exists.
    start: () => createResponseNotificationRun().stop,
  },
  draftSave: {
    id: 'draft-save',
    position: CleanupPositions.CleanupDraftSave,
    start: startDraftSave,
  },
  gemsSidebar: {
    id: 'gems-sidebar',
    position: CleanupPositions.CleanupGemsSidebar,
    start: startGemsSidebar,
  },
  usageStatus: {
    id: 'usage-status',
    position: CleanupPositions.CleanupUsageStatus,
    start: startUsageStatus,
  },
  promptHistory: {
    id: 'prompt-history',
    position: CleanupPositions.CleanupPromptHistory,
    start: startPromptHistory,
  },
  codeBlockCollapse: {
    id: 'code-block-collapse',
    position: CleanupPositions.CleanupCodeBlockCollapse,
    start: startCodeBlockCollapse,
    toggle: CODE_BLOCK_COLLAPSE_TOGGLE,
  },
  userLatex: {
    id: 'user-latex',
    position: CleanupPositions.CleanupUserLatex,
    start: startUserLatex,
    toggle: USER_LATEX_TOGGLE,
  },
  markdownPatcher: {
    id: 'markdown-patcher',
    position: CleanupPositions.CleanupMarkdownPatcher,
    start: startMarkdownPatcher,
  },
  /** Follows its own switch: off removes the stars at once but keeps a sweeper for reattached panes. */
  defaultModel: {
    id: 'default-model',
    position: CleanupPositions.CleanupDefaultModel,
    start: startDefaultModelNative,
  },
  /**
   * No `toggle`: turning an effect off in the popup lets it drain on screen,
   * which only the module does; a toggle stop would remove it at once.
   */
  visualEffects: {
    id: 'visual-effects',
    position: CleanupPositions.CleanupVisualEffects,
    start: startVisualEffects,
  },
  /**
   * No `toggle`: three keys decide the mode, and a settings change must keep an
   * in-flight download, so `index.tsx` routes those changes to a restart.
   */
  watermarkRemover: {
    id: 'watermark-remover',
    position: CleanupPositions.StopWatermarkRemover,
    start: startWatermarkRemoverFeature,
  },
  gemsHider: {
    id: 'gems-hider',
    position: CleanupPositions.CleanupGemsHider,
    start: startGemsHider,
  },
  timeline: {
    id: 'timeline',
    position: CleanupPositions.CleanupTimeline,
    start: startTimeline,
  },
  nativeHealth: {
    id: 'native-health',
    position: CleanupPositions.CleanupNativeHealth,
    start: startNativeHealth,
  },
  /** The only page owner of the history timestamp store; timeline, folders and highlights read it. */
  historyTimestampPageService: {
    id: 'history-timestamp-page-service',
    position: CleanupPositions.CleanupHistoryTimestampPageService,
    start: startHistoryTimestampPageService,
  },
  fork: {
    id: 'fork',
    position: CleanupPositions.CleanupFork,
    start: startFork,
    toggle: { key: StorageKeys.FORK_ENABLED, isEnabled: isForkFeatureEnabledValue },
  },
  researchPack: {
    id: 'research-pack',
    position: CleanupPositions.CleanupResearchPack,
    start: () => startResearchPack(),
    toggle: { key: StorageKeys.RESEARCH_PACK_ENABLED, isEnabled: isResearchPackEnabledValue },
  },
  researchPackReceiver: {
    id: 'research-pack-receiver',
    position: CleanupPositions.CleanupResearchPackReceiver,
    start: () => startResearchPackReceiver(),
    inertReason: 'Receives a research pack only on ChatGPT and Claude, never on Gemini.',
  },
} as const satisfies Record<string, NativeFeature>;

export const NATIVE_FEATURE_LIST: readonly NativeFeature[] = Object.values(NATIVE_FEATURES);
