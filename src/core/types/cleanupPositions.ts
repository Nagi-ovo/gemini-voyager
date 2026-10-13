export enum CleanupPositions {
  RemoveUnhandledRejectionEventListener,
  RemoveErrorEventListener,
  /** The watermark feature shell (`watermarkRemover/feature.ts`); its stop exists before the engine loads. */
  StopWatermarkRemover,
  DestroyFolderManagerInstance,
  DestroyPromptManagerInstance,
  DestroySlashPromptFeatureInstance,
  DestroySentPromptChips,
  /** Before the Quote and Highlight actions it starts: no late startup read may mount once teardown began. */
  CleanupSelectionStartup,
  CleanupQuoteReply,
  /** Apart from Quote: a toggle withdraws its stop by position. */
  CleanupHighlight,
  /** Before the input collapse it starts: no late start may mount once teardown began. */
  CleanupInputStartup,
  CleanupInputCollapse,
  CleanupInputVimMode,
  CleanupInputHaloHider,
  CleanupSendBehavior,
  /** Save the unsent tail before native or plugin draft owners discard it. */
  FlushDraftsBeforeUnload,
  CleanupDraftSave,
  CleanupPromptHistory,
  /** Before the features it starts: no late startup read may mount once teardown began. */
  CleanupGeminiBuiltinStartup,
  /** The prevent-auto-scroll claim; its bridge stays until `CleanupPreventAutoScrollBridge`. */
  CleanupPreventAutoScroll,
  CleanupFork,
  CleanupGemsSidebar,
  CleanupResponseCompleteNotification,
  CleanupEdgeFinalVersionNotice,
  CleanupFormulaCopy,
  CleanupPluginHost,
  /** Page services the actions and claims above register with; they stop after them. */
  CleanupRenderedQuoteStyling,
  CleanupSelectionToolbarHost,
  CleanupPreventAutoScrollBridge,
  /** A handed-off fork link outlives the feature, but not its page or send-key coordinator. */
  CleanupForkLinkFinisher,
  /** After every send-key registrant (the native send behavior, the plugins): they dispose first. */
  CleanupSendKeyCoordinator,
  CleanupBrandTheme,
  CleanupRemoteAnnouncements,
  CleanupStorageQuotaWarning,
  CleanupAccountContextBridge,
  CleanupChatGptJump,
  /** Before the renderers it starts: no late start may mount once teardown began. */
  CleanupRendererStartup,
  CleanupCodeBlockCollapse,
  CleanupUserLatex,
  CleanupMarkdownPatcher,
  CleanupDefaultModel,
  CleanupUsageStatus,
  CleanupWatermarkNativeNotice,
  CleanupGemsHider,
  CleanupTimeline,
  CleanupNativeHealth,
  CleanupHistoryTimestampPageService,
  CleanupResearchPack,
  CleanupResearchPackReceiver,
  RemoveStorageOnChangedListener,
  CleanupVisualEffects,
  /** Last: every surface it styles is gone by now. */
  CleanupSchemeBridge,
}
