/* Prompt Manager content module
 * - Injects a floating trigger button using the extension icon
 * - Opens a small anchored panel above the trigger (default)
 * - Panel supports: i18n language switch, add prompt, tag chips, search, copy
 * - Optional lock to pin panel position; when locked, panel is draggable and persisted
 *
 * This file assembles the panel and switches between its two views; each part
 * lives in its own module:
 * - promptTrigger.ts: the ball, its position and visibility, the release-notes announcement
 * - promptPanelPlacement.ts: anchoring, lock, drag
 * - promptListView.ts: tag filter and prompt rows
 * - savedLibraryView.ts: starred messages and highlights
 * - promptEditForm.ts: add and edit a prompt
 * - promptPreview.ts: the hover card with the rendered prompt (via promptMarkdownLoader.ts)
 * - promptVersionBadge.ts, promptThemeToggle.ts, promptViewModeToggle.ts: header controls
 * - promptPrefs.ts: how panel and trigger preferences are read and written
 */
import browser from 'webextension-polyfill';

import { createStarIcon } from '@/core/icons/folderIcons';
import { createLockOpenIcon } from '@/core/icons/promptManagerIcons';
import { logger } from '@/core/services/LoggerService';
import { promptStorageService } from '@/core/services/StorageService';
import { StorageKeys } from '@/core/types/common';
import { isVoyagerLayerEvent } from '@/core/ui/layer';
import { createToaster } from '@/core/ui/toast/toaster';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { migrateFromLocalStorage } from '@/core/utils/storageMigration';
import type { PromptSiteAdapter } from '@/features/prompt/PromptSiteAdapter';
import { createRuntimePromptLibraryClient } from '@/features/prompt/library/promptLibraryMessages';
import { getCurrentLanguage, getTranslationSync, initI18n, setCachedLanguage } from '@/utils/i18n';
import {
  APP_LANGUAGES,
  APP_LANGUAGE_LABELS,
  type AppLanguage,
  isAppLanguage,
  normalizeLanguage,
} from '@/utils/language';
import type { TranslationKey } from '@/utils/translations';

import { hasUnreadChangelog } from '../changelog/index';
import { onOtherSurfaceOpened } from '../floatingSurfaces';
import { createPromptEditForm } from './promptEditForm';
import { createPromptLibraryState, readPromptLibrary } from './promptLibraryState';
import { createPromptListView } from './promptListView';
import { installKatexWarningFilter } from './promptMarkdownLoader';
import { createPanelPlacement } from './promptPanelPlacement';
import { readPromptPref, readSyncedChoice, writeSyncedChoice } from './promptPrefs';
import { createPromptPreview } from './promptPreview';
import { createThemeToggle } from './promptThemeToggle';
import { mountPromptTrigger } from './promptTrigger';
import { createVersionBadge } from './promptVersionBadge';
import { createViewModeToggle } from './promptViewModeToggle';
import { createSavedLibraryView } from './savedLibraryView';
import { PROMPT_TRIGGER_ELEMENT_ID } from './triggerClearance';
import { mascotLogoFromRecord } from './triggerLogo';

type PMPanelView = 'prompts' | 'starred';

function isPMPanelView(value: unknown): value is PMPanelView {
  return value === 'prompts' || value === 'starred';
}

const STORAGE_KEYS = {
  items: StorageKeys.PROMPT_ITEMS,
  locked: StorageKeys.PROMPT_PANEL_LOCKED,
  position: StorageKeys.PROMPT_PANEL_POSITION,
  triggerPos: StorageKeys.PROMPT_TRIGGER_POSITION,
  selectedTags: StorageKeys.PROMPT_SELECTED_TAGS,
} as const;

const ID = {
  trigger: PROMPT_TRIGGER_ELEMENT_ID,
  panel: 'gv-pm-panel',
} as const;

const SPONSOR_HEART_PATH_16 =
  'M7.655 14.916h-.002l-.006-.003l-.018-.01a22 22 0 0 1-3.744-2.584C2.045 10.731 0 8.35 0 5.5C0 2.836 2.086 1 4.25 1C5.797 1 7.153 1.802 8 3.02C8.847 1.802 10.203 1 11.75 1C13.914 1 16 2.836 16 5.5c0 2.85-2.044 5.231-3.886 6.818a22 22 0 0 1-3.433 2.414a7 7 0 0 1-.31.17l-.018.01l-.008.004a.75.75 0 0 1-.69 0';

// Use centralized i18n system
function createI18n() {
  return {
    t: (key: TranslationKey): string => getTranslationSync(key),
    set: async (lang: AppLanguage) => {
      try {
        // Check if extension context is still valid
        if (!browser.runtime?.id) {
          // Extension context invalidated, skip
          return;
        }
        setCachedLanguage(lang);
        await browser.storage.sync.set({ language: lang });
        return;
      } catch (e) {
        try {
          await browser.storage.local.set({ language: lang });
          return;
        } catch (localError) {
          // Silently ignore extension context errors
          if (
            isExtensionContextInvalidatedError(e) ||
            isExtensionContextInvalidatedError(localError)
          ) {
            return;
          }
          console.warn('[PromptManager] Failed to set language:', e, localError);
        }
      }
    },
    get: async (): Promise<AppLanguage> => await getCurrentLanguage(),
  };
}

const pmLogger = logger.createChild('PromptManager');

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function createSponsorHeartIcon(size = 14): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', SPONSOR_HEART_PATH_16);
  svg.appendChild(path);

  return svg;
}

function renderSupportLinkLabel(link: HTMLAnchorElement, label: string): void {
  const labelEl = createEl('span', 'gv-pm-support-label');
  labelEl.textContent = label;
  link.replaceChildren(createSponsorHeartIcon(), labelEl);
}

export async function startPromptManager(
  site: PromptSiteAdapter,
): Promise<{ destroy: () => void }> {
  try {
    // Check if the prompt manager should be hidden & changelog badge state
    let pmHiddenByUser = false;
    let changelogBadgeActive = false;
    let useMascotLogo = false;
    // Read by the prompt list on every render; the view mode comes from its toggle.
    const listSettings = {
      get viewMode() {
        return viewMode.mode;
      },
      insertOnClick: false,
      // Experiment: when on, the row itself takes the drag and its primary action
      // moves to pointerup. Flip it to compare against the handle before choosing.
      rowDrag: false,
    };

    try {
      const result = await browser.storage.sync.get({ gvHidePromptManager: false });
      pmHiddenByUser = result?.gvHidePromptManager === true;
    } catch (error) {
      pmLogger.warn(
        'Failed to check hide prompt manager setting, continuing with default behavior',
        { error },
      );
    }

    try {
      const result = await browser.storage.sync.get({
        [StorageKeys.PROMPT_INSERT_ON_CLICK]: false,
        [StorageKeys.PROMPT_ROW_DRAG]: false,
        [StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO]: false,
      });
      listSettings.insertOnClick = result?.[StorageKeys.PROMPT_INSERT_ON_CLICK] === true;
      listSettings.rowDrag = result?.[StorageKeys.PROMPT_ROW_DRAG] === true;
      useMascotLogo = mascotLogoFromRecord(result);
    } catch (error) {
      pmLogger.warn('Failed to check prompt click mode setting, falling back to copy behavior', {
        error,
      });
    }

    // Check changelog badge mode
    try {
      const [modeRes, unread] = await Promise.all([
        browser.storage.local.get(StorageKeys.CHANGELOG_NOTIFY_MODE),
        hasUnreadChangelog(),
      ]);
      const notifyMode = modeRes?.[StorageKeys.CHANGELOG_NOTIFY_MODE];
      changelogBadgeActive = notifyMode === 'badge' && unread;
    } catch {
      // Ignore errors
    }

    installKatexWarningFilter();

    // Migrate data from localStorage to chrome.storage.local (one-time migration)
    try {
      // The prompt library itself is seeded through its owner below.
      const keysToMigrate = [STORAGE_KEYS.locked, STORAGE_KEYS.position, STORAGE_KEYS.triggerPos];

      const migrationResult = await migrateFromLocalStorage(keysToMigrate, promptStorageService, {
        deleteAfterMigration: false, // Keep localStorage as backup
        skipExisting: true, // Skip if already migrated
      });

      if (migrationResult.migratedKeys.length > 0) {
        pmLogger.info('Migrated prompt data from localStorage to chrome.storage.local', {
          migratedKeys: migrationResult.migratedKeys,
        });
      }

      if (migrationResult.errors.length > 0) {
        pmLogger.warn('Some keys failed to migrate', { errors: migrationResult.errors });
      }
    } catch (migrationError) {
      pmLogger.error('Migration failed, continuing with current storage', { migrationError });
      // Continue even if migration fails - data will still work from current storage
    }

    // marked + KaTeX load lazily on the first Markdown render (promptMarkdownLoader.ts).

    // Initialize centralized i18n system
    await initI18n();
    const i18n = createI18n();

    // Prevent duplicate injection
    if (document.getElementById(ID.trigger)) {
      return { destroy: () => {} };
    }

    const trigger = await mountPromptTrigger({
      mascotLogo: useMascotLogo,
      hiddenByUser: pmHiddenByUser,
      attention: changelogBadgeActive,
      onAttentionChange: (active) => versionBadge.setAttention(active),
      defaultSpot: (ballHeight) => site.defaultTriggerSpot(ballHeight),
    });

    // Panel root
    const panel = createEl('div', 'gv-pm-panel gv-hidden');
    panel.id = ID.panel;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    document.body.appendChild(panel);

    // Build panel DOM
    const header = createEl('div', 'gv-pm-header');
    const dragHandle = createEl('div', 'gv-pm-drag');

    const titleRow = createEl('div', 'gv-pm-title-row');
    const title = createEl('div', 'gv-pm-title');
    const titleText = document.createElement('span');
    titleText.textContent = 'Voyager';
    title.appendChild(titleText);

    // Version badge always opens changelog modal
    const versionBadge = createVersionBadge({ t: i18n.t, trigger, beforeOpen: closePanel });

    const themeToggle = createThemeToggle({ panel, t: i18n.t, pageScheme: site.scheme() });

    titleRow.appendChild(title);
    titleRow.appendChild(themeToggle);
    titleRow.appendChild(versionBadge.element);

    const controls = createEl('div', 'gv-pm-controls');

    const langSel = createEl('select', 'gv-pm-lang');
    for (const lang of APP_LANGUAGES) {
      const opt = createEl('option');
      opt.value = lang;
      opt.textContent = APP_LANGUAGE_LABELS[lang];
      langSel.appendChild(opt);
    }
    // Set initial language value asynchronously
    i18n
      .get()
      .then((lang) => {
        langSel.value = lang;
      })
      .catch(() => {
        langSel.value = 'en';
      });

    const lockBtn = createEl('button', 'gv-pm-lock');
    lockBtn.setAttribute('type', 'button');
    lockBtn.setAttribute('aria-pressed', 'false');
    lockBtn.appendChild(createLockOpenIcon(15));
    lockBtn.title = i18n.t('pm_lock');

    const addBtn = createEl('button', 'gv-pm-add');
    addBtn.textContent = i18n.t('pm_add');

    const viewModeBtn = createEl('button', 'gv-pm-view-mode');
    viewModeBtn.setAttribute('type', 'button');
    // Icon, title, and aria-label come from its view-mode toggle below.

    controls.appendChild(langSel);
    controls.appendChild(addBtn);
    controls.appendChild(lockBtn);
    header.appendChild(dragHandle);
    header.appendChild(titleRow);
    header.appendChild(controls);

    // Search wrap hosts the search input and, on its right edge, the
    // compact/comfortable view-mode toggle. Keeping the toggle here instead of
    // the header controls row prevents the "Voyager" title from being squeezed
    // into ellipsis, and keeps it adjacent to the list it governs.
    const searchWrap = createEl('div', 'gv-pm-search');
    const searchInput = createEl('input') as HTMLInputElement;
    searchInput.type = 'search';
    searchInput.placeholder = i18n.t('pm_search_placeholder');
    searchWrap.appendChild(searchInput);
    searchWrap.appendChild(viewModeBtn);

    const list = createEl('div', 'gv-pm-list');

    const saved = createSavedLibraryView({
      list,
      t: i18n.t,
      getQuery: () => searchInput.value || '',
      isActive: () => panelView === 'starred',
      setNotice,
      beforeRender: () => preview.hide(),
      highlightPlatform: site.highlightPlatform,
      onBack: () => switchPanelView('prompts'),
      rememberView: () => persistPanelView('starred'),
      onNavigated: closePanel,
    });

    const tagsWrapOuter = createEl('div', 'gv-pm-tags-wrap');
    const tagsWrap = createEl('div', 'gv-pm-tags');
    const tagsScrollHint = createEl('div', 'gv-pm-tags-scroll-hint');
    tagsScrollHint.setAttribute('aria-hidden', 'true');
    tagsScrollHint.textContent = '▼';
    tagsWrapOuter.appendChild(tagsWrap);
    tagsWrapOuter.appendChild(tagsScrollHint);

    const footer = createEl('div', 'gv-pm-footer');
    // Primary view switch: the previous local backup slot now opens the
    // Saved Library. Its return action lives in the dedicated saved footer.
    const backupBtn = createEl('button', 'gv-pm-backup-btn');
    backupBtn.setAttribute('type', 'button');

    // Primary actions container
    const primaryActions = createEl('div', 'gv-pm-footer-actions');
    primaryActions.appendChild(backupBtn);

    // Secondary actions container
    const secondaryActions = createEl('div', 'gv-pm-footer-secondary');

    const settingsBtn = createEl('button', 'gv-pm-settings');
    settingsBtn.textContent = i18n.t('pm_settings');
    settingsBtn.title = i18n.t('pm_settings_tooltip');

    const supportLink = document.createElement('a');
    supportLink.className = 'gv-pm-support';
    supportLink.target = '_blank';
    supportLink.rel = 'noreferrer';
    supportLink.title = i18n.t('sponsorMe');

    secondaryActions.appendChild(settingsBtn);
    secondaryActions.appendChild(supportLink);

    footer.appendChild(primaryActions);
    footer.appendChild(saved.footerActions);
    footer.appendChild(secondaryActions);

    const toaster = createToaster();

    // State
    let libraryShown = false; // Library changes render once the panel is built.
    const library = createPromptLibraryState({
      read: () => readPromptLibrary(browser.storage.local),
      apply: createRuntimePromptLibraryClient().apply,
      readLegacy: () => localStorage.getItem(STORAGE_KEYS.items),
      changes: browser.storage.onChanged,
      onChanged: () => libraryShown && showLibrary(true),
      onReconcile: () => showLibrary(false),
      onNotLoaded: () => setNotice(i18n.t('pm_library_load_failed'), 'err'),
      onWriteFailed: () => setNotice(i18n.t('pm_save_failed') || "Couldn't save", 'err'),
      onUnavailable: (down) => down && setNotice(i18n.t('pm_library_unavailable'), 'err'),
      onReadFailed: (error) =>
        isExtensionContextInvalidatedError(error) || pmLogger.warn('Prompt read failed', { error }),
    });

    const form = createPromptEditForm({
      t: i18n.t,
      library,
      setNotice,
      onSaved: () => {
        listView.renderTags();
        renderActiveList();
      },
    });

    panel.appendChild(header);
    panel.appendChild(searchWrap);
    panel.appendChild(saved.toolbar);
    panel.appendChild(tagsWrapOuter);
    panel.appendChild(form.element);
    panel.appendChild(list);
    panel.appendChild(footer);

    await library.load();
    let open = false;
    // Restore the tag filter saved in a previous session (#729).
    const savedTags = await readPromptPref<string[]>(STORAGE_KEYS.selectedTags, []);
    const preview = createPromptPreview({ panel, scrollRoot: list });
    const listView = createPromptListView({
      list,
      tagsWrap,
      tagsWrapOuter,
      library,
      preview,
      settings: listSettings,
      savedTags,
      t: i18n.t,
      setNotice,
      insert: site.insert,
      getQuery: () => searchInput.value || '',
      getTheme: () => panel.getAttribute('data-gv-theme') || '',
      onEdit: form.startEdit,
      rerender: renderActiveList,
    });
    const placement = await createPanelPlacement({
      panel,
      anchor: trigger.element,
      lockButton: lockBtn,
      isOpen: () => open,
      t: i18n.t,
    });
    let panelView: PMPanelView = 'prompts';
    let promptSearchValue = '';
    let starredSearchValue = '';

    function setNotice(text: string, kind: 'ok' | 'err' = 'ok') {
      if (!text) {
        toaster.dismiss('notice');
        return;
      }
      toaster.show({
        message: text,
        tone: kind === 'ok' ? 'success' : 'error',
        durationMs: 1800,
        channel: 'notice',
      });
    }

    const viewMode = createViewModeToggle({
      button: viewModeBtn,
      panel,
      t: i18n.t,
      isEnabled: () => panelView === 'prompts',
      onChange: renderActiveList,
    });

    function applyPanelViewUI(): void {
      const isStarredView = panelView === 'starred';
      panel.setAttribute('data-gv-panel-view', panelView);
      titleText.textContent = isStarredView ? i18n.t('pm_starred_library') : 'Voyager';
      backupBtn.replaceChildren(
        createStarIcon(15),
        document.createTextNode(i18n.t('pm_starred_library')),
      );
      backupBtn.title = i18n.t('pm_starred_library');
      backupBtn.setAttribute('aria-label', backupBtn.title);
      searchInput.placeholder = isStarredView
        ? i18n.t('savedLibrarySearchPlaceholder')
        : i18n.t('pm_search_placeholder');
      addBtn.classList.toggle('gv-hidden', isStarredView);
      viewModeBtn.classList.toggle('gv-hidden', isStarredView);
      tagsWrapOuter.classList.toggle('gv-hidden', isStarredView);
      primaryActions.classList.toggle('gv-hidden', isStarredView);
      secondaryActions.classList.toggle('gv-hidden', isStarredView);
      if (isStarredView) {
        listView.closeTransient();
        form.hide();
        preview.hide();
      }
      saved.setActive(isStarredView);
    }

    function renderActiveList(): void {
      if (panelView === 'starred') saved.render();
      else listView.render();
    }

    function persistPanelView(nextView: PMPanelView): Promise<void> {
      return writeSyncedChoice(StorageKeys.PROMPT_PANEL_VIEW, nextView);
    }

    /** Swaps the search text kept per view and shows `nextView`'s chrome; no rendering. */
    function enterPanelView(nextView: PMPanelView): void {
      if (panelView === 'starred') starredSearchValue = searchInput.value || '';
      else promptSearchValue = searchInput.value || '';
      panelView = nextView;
      searchInput.value = panelView === 'starred' ? starredSearchValue : promptSearchValue;
      applyPanelViewUI();
    }

    /** The user switched views: remembered, and always loaded. */
    function switchPanelView(nextView: PMPanelView): void {
      if (panelView === nextView) return;
      enterPanelView(nextView);
      void persistPanelView(nextView);
      if (panelView === 'starred') {
        void saved.load();
      } else {
        listView.renderTags();
        listView.render();
        requestAnimationFrame(listView.syncTagScrollHint);
      }
    }

    /** The view changed elsewhere (restore, another tab): loads only into an open panel. */
    function followPanelView(nextView: PMPanelView): void {
      enterPanelView(nextView);
      if (panelView === 'starred' && open) void saved.load();
      else renderActiveList();
    }

    // Restore the last Prompt Manager sub-view. This mirrors the compact /
    // comfortable preference so a starred-message navigation does not drop the
    // user back into the prompt list after the Gemini route changes.
    void readSyncedChoice(StorageKeys.PROMPT_PANEL_VIEW, isPMPanelView).then((savedView) => {
      if (savedView && savedView !== panelView) followPanelView(savedView);
    });

    function openPanel(): void {
      open = true;
      void library.retry();
      panel.classList.remove('gv-hidden');
      placement.place();
      requestAnimationFrame(listView.syncTagScrollHint);
    }

    function closePanel(): void {
      open = false;
      panel.classList.add('gv-hidden');
      saved.closeExportMenu();
      preview.hide();
      listView.closeTransient();
    }

    function refreshUITexts(): void {
      // Keep custom icon + label
      addBtn.textContent = i18n.t('pm_add');
      renderSupportLinkLabel(supportLink, i18n.t('sponsorMe'));
      supportLink.title = i18n.t('sponsorMe');
      i18n.get().then((lang) => {
        supportLink.href =
          lang === 'zh'
            ? 'https://voyager.nagi.fun/guide/sponsor.html'
            : `https://voyager.nagi.fun/${lang}/guide/sponsor.html`;
      });

      settingsBtn.textContent = i18n.t('pm_settings');
      settingsBtn.title = i18n.t('pm_settings_tooltip');
      form.applyTexts();
      placement.applyTexts();
      viewMode.applyTexts();
      applyPanelViewUI();
      listView.renderTags();
      renderActiveList();
    }

    // Events
    trigger.enable(() => {
      if (open) closePanel();
      else {
        openPanel();
        if (panelView === 'starred') void saved.load();
        else {
          listView.renderTags();
          listView.render();
        }
      }
    });

    // Handle window resize - constrain trigger and reposition panel. The trigger
    // moves first: an unlocked panel is anchored to where it ends up.
    const onWindowResize = () => {
      trigger.constrain();
      placement.reposition();
      listView.syncTagScrollHint();
    };
    window.addEventListener('resize', onWindowResize, { passive: true });

    // Close when clicking outside of the manager (panel/trigger/confirm are exceptions)
    const onWindowPointerDown = (ev: PointerEvent) => {
      if (!open || isVoyagerLayerEvent(ev)) return;
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      saved.handlePointerDown(target);
      if (target.closest(`#${ID.panel}`)) return;
      if (target.closest(`#${ID.trigger}`)) return;
      // The hover-preview tooltip lives on document.body so users can
      // interact with it (scroll long prompts, select text). Without this
      // exclusion, clicking its scrollbar would be treated as an outside
      // click and close the whole panel.
      if (target.closest('.gv-pm-tooltip')) return;
      // The fill surface also lives on document.body and owns its own dismissal.
      if (target.closest('.gv-pm-fill')) return;
      closePanel();
    };
    window.addEventListener('pointerdown', onWindowPointerDown, { capture: true });
    // A Research Pack opened from the keyboard sends no pointerdown, so it says so itself.
    const stopSurfaceWatch = onOtherSurfaceOpened('prompt-manager', () => {
      if (open) closePanel();
    });

    // Close on Escape
    const onWindowKeyDown = (ev: KeyboardEvent) => {
      if (!open) return;
      if (ev.key !== 'Escape') return;
      if (saved.handleEscape()) return;
      closePanel();
    };
    window.addEventListener('keydown', onWindowKeyDown, { passive: true });

    langSel.addEventListener('change', async () => {
      const next = langSel.value;
      if (!isAppLanguage(next)) return;
      await i18n.set(next);
      refreshUITexts();
    });

    // Listen to external language changes (popup/options)
    // Note: The centralized i18n system already handles storage changes,
    // we just need to update the UI when language changes
    const storageChangeHandler = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string,
    ) => {
      // Handle language changes from sync storage
      const nextRaw = changes[StorageKeys.LANGUAGE]?.newValue;
      if (area === 'sync' && typeof nextRaw === 'string') {
        try {
          langSel.value = normalizeLanguage(nextRaw);
        } catch {}
        refreshUITexts();
      }
      // Handle hide prompt manager setting changes
      if (area === 'sync' && changes?.gvHidePromptManager) {
        const shouldHide = changes.gvHidePromptManager.newValue === true;
        pmLogger.info('Hide prompt manager setting changed', { shouldHide });
        if (trigger.setHiddenByUser(shouldHide)) {
          // The trigger is gone, so the panel goes with it
          closePanel();
        }
      }
      if (area === 'sync' && changes[StorageKeys.PROMPT_INSERT_ON_CLICK]) {
        listSettings.insertOnClick = changes[StorageKeys.PROMPT_INSERT_ON_CLICK].newValue === true;
      }
      // Trigger logo and release-notes announcement
      trigger.applyStorageChange(area, changes);
      if (area === 'sync' && changes[StorageKeys.PROMPT_ROW_DRAG]) {
        listSettings.rowDrag = changes[StorageKeys.PROMPT_ROW_DRAG].newValue === true;
        renderActiveList();
      }
      viewMode.applyStorageChange(area, changes);
      if ((area === 'sync' || area === 'local') && changes[StorageKeys.PROMPT_PANEL_VIEW]) {
        const nextView = changes[StorageKeys.PROMPT_PANEL_VIEW].newValue;
        if (isPMPanelView(nextView) && nextView !== panelView) {
          followPanelView(nextView);
        }
      }
      // Stars and highlights shown in the Saved Library
      saved.applyStorageChange(area, changes);
    };

    function showLibrary(changedElsewhere: boolean): void {
      listView.renderTags();
      renderActiveList();
      if (changedElsewhere) setNotice(i18n.t('syncSuccess') || 'Synced', 'ok');
    }

    libraryShown = true;
    try {
      browser.storage.onChanged.addListener(storageChangeHandler);
    } catch {}

    addBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      form.startAdd();
    });

    settingsBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try {
        // Check if extension context is still valid
        if (!browser.runtime?.id) {
          // Extension context invalidated, show fallback message
          setNotice(
            i18n.t('pm_settings_fallback') || '请点击浏览器工具栏中的扩展图标打开设置',
            'err',
          );
          return;
        }

        // Send message to background to open popup
        const response = (await browser.runtime.sendMessage({ type: 'gv.openPopup' })) as {
          ok?: boolean;
        };
        if (!response?.ok) {
          // If programmatic opening failed, show a helpful message
          setNotice(
            i18n.t('pm_settings_fallback') || '请点击浏览器工具栏中的扩展图标打开设置',
            'err',
          );
        }
      } catch (err) {
        // Silently handle extension context errors
        if (isExtensionContextInvalidatedError(err)) {
          setNotice(
            i18n.t('pm_settings_fallback') || '请点击浏览器工具栏中的扩展图标打开设置',
            'err',
          );
          return;
        }
        console.warn('[PromptManager] Failed to open settings:', err);
        setNotice(
          i18n.t('pm_settings_fallback') || '请点击浏览器工具栏中的扩展图标打开设置',
          'err',
        );
      }
    });

    searchInput.addEventListener('input', () => {
      if (panelView === 'starred') starredSearchValue = searchInput.value || '';
      else promptSearchValue = searchInput.value || '';
      renderActiveList();
    });

    backupBtn.addEventListener('click', () => {
      switchPanelView('starred');
    });

    // Initialize
    refreshUITexts();

    // Return destroy function
    return {
      destroy: () => {
        try {
          window.removeEventListener('resize', onWindowResize);
          window.removeEventListener('pointerdown', onWindowPointerDown, { capture: true });
          stopSurfaceWatch();
          window.removeEventListener('keydown', onWindowKeyDown);
          placement.destroy();
          listView.destroy();
          toaster.destroy();

          chrome.storage?.onChanged?.removeListener(storageChangeHandler);
          library.dispose();

          // Removes the hover card and its scroll listeners on `list` and `window`.
          // Without this, every re-init (SPA nav / extension reload) would leak
          // an orphan card + listener.
          preview.destroy();

          trigger.destroy();
          panel.remove();
        } catch (e) {
          console.error('[PromptManager] Destroy error:', e);
        }
      },
    };
  } catch (err) {
    try {
      if (isExtensionContextInvalidatedError(err)) {
        return { destroy: () => {} };
      }
      console.error('Prompt Manager init failed', err);
    } catch {}
    return { destroy: () => {} };
  }
}

export default { startPromptManager };
