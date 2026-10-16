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
  /** Before the input collapse it starts: no late start may mount once teardown began. */
  CleanupInputStartup,
  /** Save the unsent tail before the draft plugin owners discard it. */
  FlushDraftsBeforeUnload,
  /** Before the features it starts: no late startup read may mount once teardown began. */
  CleanupGeminiBuiltinStartup,
  CleanupEdgeFinalVersionNotice,
  CleanupPluginHost,
  /** Page services the actions and claims above register with; they stop after them. */
  CleanupRenderedQuoteStyling,
  CleanupSelectionToolbarHost,
  CleanupPreventAutoScrollBridge,
  /** A handed-off fork link outlives the feature, but not its page or send-key coordinator. */
  CleanupForkLinkFinisher,
  /** After every send-key registrant: the send plugins dispose first. */
  CleanupSendKeyCoordinator,
  CleanupBrandTheme,
  CleanupRemoteAnnouncements,
  CleanupStorageQuotaWarning,
  CleanupAccountContextBridge,
  CleanupChatGptJump,
  /** Before the renderers it starts: no late start may mount once teardown began. */
  CleanupRendererStartup,
  CleanupDefaultModel,
  CleanupWatermarkNativeNotice,
  CleanupGemsHider,
  /** Abort pending and shown Gemini timeline guides before retiring their rail. */
  CleanupTimelineCoachmarks,
  CleanupNativeHealth,
  CleanupHistoryTimestampPageService,
  CleanupResearchPackReceiver,
  RemoveStorageOnChangedListener,
  CleanupVisualEffects,
  /** Last: every surface it styles is gone by now. */
  CleanupSchemeBridge,
}
