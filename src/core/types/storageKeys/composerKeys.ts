/**
 * Prompt manager, input behavior and default model.
 * Merged into `StorageKeys` by `./index.ts`; keep this file import-free.
 */
export const COMPOSER_STORAGE_KEYS = {
  // Prompt Manager
  PROMPT_ITEMS: 'gvPromptItems',
  PROMPT_PANEL_LOCKED: 'gvPromptPanelLocked',
  PROMPT_PANEL_POSITION: 'gvPromptPanelPosition',
  PROMPT_TRIGGER_POSITION: 'gvPromptTriggerPosition',
  PROMPT_TRIGGER_MASCOT_LOGO: 'gvPromptTriggerMascotLogo',
  PROMPT_CUSTOM_WEBSITES: 'gvPromptCustomWebsites',
  PROMPT_THEME: 'gvPromptTheme',
  PROMPT_INSERT_ON_CLICK: 'gvPromptInsertOnClick',
  PROMPT_VIEW_MODE: 'gvPromptViewMode',
  /** Experiment: drag a row from anywhere instead of from its handle. */
  PROMPT_ROW_DRAG: 'gvPromptRowDrag',
  PROMPT_PANEL_VIEW: 'gvPromptPanelView',
  SLASH_PROMPT_ENABLED: 'gvSlashPromptEnabled',
  // Persisted tag filter for the prompt manager (#729). chrome.storage.local
  // only — the selected tags are a per-device view over this machine's prompt
  // set, not a synced preference; syncing them could restore tags a device
  // hasn't received yet. Shape: string[] of lowercased tag names.
  PROMPT_SELECTED_TAGS: 'gvPromptSelectedTags',

  // Input behavior
  CTRL_ENTER_SEND: 'gvCtrlEnterSend',
  AISTUDIO_ENTER_SEND: 'gvAIStudioEnterSend',
  SAFARI_ENTER_FIX: 'gvSafariEnterFix',
  INPUT_COLLAPSE_ENABLED: 'gvInputCollapseEnabled',
  INPUT_COLLAPSE_WHEN_NOT_EMPTY: 'gvInputCollapseWhenNotEmpty',
  INPUT_VIM_MODE: 'gvInputVimMode',
  DRAFT_AUTO_SAVE: 'gvDraftAutoSave',
  // chrome.storage.local key PREFIX for the draftSave primitive's drafts on catalog sites:
  // `gvDraft:<siteId>:conv:<id>` or `gvDraft:<siteId>:new`. Gemini keeps its own `gvDraft_<path>`.
  SITE_DRAFT_PREFIX: 'gvDraft:',
  PREVENT_AUTO_SCROLL_ENABLED: 'gvPreventAutoScrollEnabled',
  // Prompt history (#923). chrome.storage.local only — a per-device, per-account
  // record of sent/edited prompts so users can recover prompts that Gemini
  // swallowed on error.
  PROMPT_HISTORY_ENABLED: 'gvPromptHistoryEnabled',
  PROMPT_HISTORY_ITEMS: 'gvPromptHistoryItems',

  // Default Model
  DEFAULT_MODEL: 'gvDefaultModel',
  DEFAULT_THINKING_LEVEL: 'gvDefaultThinkingLevel',
  // Master switch for auto-applying the stored default model / thinking level
  // on new conversations. Defaults to enabled; users can flip this off as a
  // kill switch if a Gemini redesign breaks the locker or makes it
  // misbehave. Setting/clearing the default itself (the star buttons inside
  // the model menu) remains available regardless of this flag.
  DEFAULT_MODEL_AUTO_APPLY: 'gvDefaultModelAutoApply',
} as const;
