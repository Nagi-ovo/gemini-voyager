/* Prompt Manager content module
 * - Injects a floating trigger button using the extension icon
 * - Opens a small anchored panel above the trigger (default)
 * - Panel supports: i18n language switch, add prompt, tag chips, search, copy, import/export
 * - Optional lock to pin panel position; when locked, panel is draggable and persisted
 */
import DOMPurify from 'dompurify';
import JSZip from 'jszip';
import 'katex/dist/katex.min.css';
import type { marked as MarkedFn } from 'marked';
import browser from 'webextension-polyfill';

import { logger } from '@/core/services/LoggerService';
import { promptStorageService } from '@/core/services/StorageService';
import { type StorageKey, StorageKeys } from '@/core/types/common';
import { isSafari, shouldShowSafariUpdateReminder } from '@/core/utils/browser';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { migrateFromLocalStorage } from '@/core/utils/storageMigration';
import { shouldShowUpdateReminderForCurrentVersion } from '@/core/utils/updateReminder';
import { compareVersions } from '@/core/utils/version';
import { getCurrentLanguage, getTranslationSync, initI18n, setCachedLanguage } from '@/utils/i18n';
import {
  APP_LANGUAGES,
  APP_LANGUAGE_LABELS,
  type AppLanguage,
  isAppLanguage,
  normalizeLanguage,
} from '@/utils/language';
import type { TranslationKey } from '@/utils/translations';

import { createFolderStorageAdapter } from '../folder/storage/FolderStorageAdapter';

type PromptItem = {
  id: string;
  text: string;
  tags: string[];
  createdAt: number;
  updatedAt?: number;
};

type PanelPosition = { top: number; left: number };
type TriggerPosition = { bottom: number; right: number };

const STORAGE_KEYS = {
  items: StorageKeys.PROMPT_ITEMS,
  locked: StorageKeys.PROMPT_PANEL_LOCKED,
  position: StorageKeys.PROMPT_PANEL_POSITION,
  triggerPos: StorageKeys.PROMPT_TRIGGER_POSITION,
  language: StorageKeys.LANGUAGE, // reuse global language key
} as const;

const ID = {
  trigger: 'gv-pm-trigger',
  panel: 'gv-pm-panel',
} as const;

const LATEST_VERSION_CACHE_KEY = 'gvLatestVersionCache';
const LATEST_VERSION_MAX_AGE = 1000 * 60 * 60 * 6; // 6 hours

function getRuntimeUrl(path: string): string {
  // Try the standard Web Extensions API first (mainly for Firefox)
  try {
    return browser.runtime.getURL(path);
  } catch {
    const win = window as Window & { chrome?: { runtime?: { getURL?: (path: string) => string } } };
    return win.chrome?.runtime?.getURL?.(path) || path;
  }
}

function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    const v = JSON.parse(raw);
    return v as T;
  } catch {
    return fallback;
  }
}

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

function uid(): string {
  // FNV-1a-ish hash over timestamp + rand
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Storage adapter - uses chrome.storage.local for cross-domain data sharing
 * Falls back to localStorage if chrome.storage is unavailable
 */
const pmLogger = logger.createChild('PromptManager');

const normalizeVersionString = (version?: string | null): string | null => {
  if (!version) return null;
  const trimmed = version.trim();
  return trimmed ? trimmed.replace(/^v/i, '') : null;
};

const toReleaseTag = (version?: string | null): string | null => {
  if (!version) return null;
  const trimmed = version.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
};

async function readStorage<T>(key: StorageKey, fallback: T): Promise<T> {
  const result = await promptStorageService.get<T>(key);
  if (result.success) {
    return result.data;
  }
  pmLogger.debug(`Key not found: ${key}, using fallback`);
  return fallback;
}

async function writeStorage<T>(key: StorageKey, value: T): Promise<void> {
  const result = await promptStorageService.set(key, value);
  if (!result.success) {
    pmLogger.error(`Failed to write key: ${key}`, {
      error: result.error?.message || 'Unknown error',
      errorDetails: result.error,
    });
  }
}

async function getLatestVersionCached(): Promise<string | null> {
  try {
    if (!browser.runtime?.id) return null;

    const now = Date.now();
    const cache = await browser.storage.local.get(LATEST_VERSION_CACHE_KEY);
    const cached = cache?.[LATEST_VERSION_CACHE_KEY] as
      | { version?: string; fetchedAt?: number }
      | undefined;
    if (
      cached &&
      cached.version &&
      cached.fetchedAt &&
      now - cached.fetchedAt < LATEST_VERSION_MAX_AGE
    ) {
      return cached.version;
    }

    const resp = await fetch(
      'https://api.github.com/repos/Nagi-ovo/gemini-voyager/releases/latest',
      {
        headers: { Accept: 'application/vnd.github+json' },
      },
    );
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const candidate =
      typeof data.tag_name === 'string'
        ? data.tag_name
        : typeof data.name === 'string'
          ? data.name
          : null;

    if (candidate) {
      await browser.storage.local.set({
        [LATEST_VERSION_CACHE_KEY]: { version: candidate, fetchedAt: now },
      });
      return candidate;
    }
  } catch (error) {
    pmLogger.debug('Latest version check failed', { error });
  }
  return null;
}

function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function elFromHTML(html: string): HTMLElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild as HTMLElement;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function collectAllTags(items: PromptItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) for (const t of it.tags || []) set.add(String(t).toLowerCase());
  return Array.from(set).sort();
}

function copyText(text: string): Promise<void> {
  try {
    return navigator.clipboard.writeText(text);
  } catch {
    return new Promise<void>((resolve) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {}
      ta.remove();
      resolve();
    });
  }
}

function computeAnchoredPosition(
  trigger: HTMLElement,
  panel: HTMLElement,
): { top: number; left: number } {
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const pad = 8;
  const panelW = Math.min(380, Math.max(300, panel.getBoundingClientRect().width || 320));
  const tentativeLeft = Math.min(vw - panelW - pad, Math.max(pad, rect.left + rect.width - panelW));
  const top = Math.max(pad, rect.top - (panel.getBoundingClientRect().height || 360) - 10);
  return { top, left: Math.round(tentativeLeft) };
}

export async function startPromptManager(): Promise<{ destroy: () => void }> {
  let marked!: typeof MarkedFn;
  try {
    // Check if the prompt manager should be hidden
    try {
      const result = await browser.storage.sync.get({ gvHidePromptManager: false });
      if (result?.gvHidePromptManager === true) {
        pmLogger.info('Prompt Manager is hidden by user settings');
        // Return a no-op destroy function to maintain interface compatibility
        return { destroy: () => {} };
      }
    } catch (error) {
      pmLogger.warn(
        'Failed to check hide prompt manager setting, continuing with default behavior',
        { error },
      );
    }

    // Monkey patch console.warn to suppress KaTeX quirks mode warning in content script
    const originalWarn = console.warn;
    console.warn = function (...args) {
      const message = args[0];
      if (
        typeof message === 'string' &&
        (message.includes("KaTeX doesn't work in quirks mode") ||
          message.includes('unicodeTextInMathMode') ||
          message.includes('LaTeX-incompatible input and strict mode'))
      ) {
        return;
      }
      return originalWarn.apply(console, args);
    };

    // Migrate data from localStorage to chrome.storage.local (one-time migration)
    try {
      const keysToMigrate = [
        STORAGE_KEYS.items,
        STORAGE_KEYS.locked,
        STORAGE_KEYS.position,
        STORAGE_KEYS.triggerPos,
      ];

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

    // Dynamic imports to prevent side effects on unsupported pages
    // Dynamic imports to prevent side effects on unsupported pages
    marked = (await import('marked')).marked;
    const { default: markedKatex } = await import('marked-katex-extension');

    // markdown config: respect single newlines as <br> and KaTeX inline/display math
    try {
      marked.use(
        markedKatex({
          throwOnError: false,
          output: 'html',
          trust: true, // Trust the rendering environment (content script context)
          strict: false, // Disable strict mode checks including quirks mode detection
        }),
      );
      marked.setOptions({ breaks: true });
    } catch {}
    // Initialize centralized i18n system
    await initI18n();
    const i18n = createI18n();

    // Prevent duplicate injection
    if (document.getElementById(ID.trigger)) return { destroy: () => {} };

    // Trigger button
    const trigger = createEl('button', 'gv-pm-trigger');
    trigger.id = ID.trigger;
    trigger.setAttribute('aria-label', 'Prompt Manager');
    const img = document.createElement('img');
    img.width = 24;
    img.height = 24;
    img.alt = 'pm';
    img.src = getRuntimeUrl('icon-32.png');
    img.addEventListener(
      'error',
      () => {
        // dev fallback
        const devUrl = getRuntimeUrl('icon-32.png');
        if (img.src !== devUrl) img.src = devUrl;
      },
      { once: true },
    );
    trigger.appendChild(img);
    document.body.appendChild(trigger);
    // Helper: place trigger near a target element (e.g. Gemini FAB touch target)
    function placeTriggerNextToHost(): void {
      try {
        const candidates = Array.from(
          document.querySelectorAll('span.mat-mdc-button-touch-target'),
        ) as HTMLElement[];
        if (!candidates.length) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pick = candidates
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter((x) => x.r.width > 0 && x.r.height > 0)
          // choose the element closest to bottom-right corner
          .sort((a, b) => a.r.bottom + a.r.right - (b.r.bottom + b.r.right))
          .reduce((_, x) => x, undefined as { el: HTMLElement; r: DOMRect } | undefined);
        if (!pick) return;
        const r = pick.r;
        const th = trigger.getBoundingClientRect().height || 36;
        const gap = 10;
        const right = Math.max(6, Math.round(vw - r.left + gap));
        const bottom = Math.max(6, Math.round(vh - (r.top + r.height / 2 + th / 2)));
        trigger.style.right = `${right}px`;
        trigger.style.bottom = `${bottom}px`;
      } catch {}
    }

    // Helper: constrain trigger position to viewport bounds
    function constrainTriggerPosition(): void {
      try {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = trigger.getBoundingClientRect();
        const tw = rect.width || 44;
        const th = rect.height || 44;
        const minPad = 6;

        // Parse current position
        const currentRight = parseFloat(trigger.style.right || '18') || 18;
        const currentBottom = parseFloat(trigger.style.bottom || '18') || 18;

        // Calculate constraints (ensure at least minPad from edges)
        const maxRight = vw - tw - minPad;
        const maxBottom = vh - th - minPad;

        // Constrain position
        const right = Math.max(minPad, Math.min(currentRight, maxRight));
        const bottom = Math.max(minPad, Math.min(currentBottom, maxBottom));

        trigger.style.right = `${Math.round(right)}px`;
        trigger.style.bottom = `${Math.round(bottom)}px`;
      } catch {}
    }

    // Restore trigger position if saved; otherwise place next to host button
    try {
      const pos = await readStorage<TriggerPosition | null>(STORAGE_KEYS.triggerPos, null);
      if (pos && Number.isFinite(pos.bottom) && Number.isFinite(pos.right)) {
        trigger.style.bottom = `${Math.max(6, Math.round(pos.bottom))}px`;
        trigger.style.right = `${Math.max(6, Math.round(pos.right))}px`;
        // Constrain position after restore to handle window resize/split screen
        requestAnimationFrame(constrainTriggerPosition);
      } else {
        // defer a bit to wait for host DOM
        placeTriggerNextToHost();
        requestAnimationFrame(placeTriggerNextToHost);
        window.setTimeout(placeTriggerNextToHost, 350);
      }
    } catch {
      placeTriggerNextToHost();
    }

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
    titleText.textContent = 'Gemini Voyager';
    title.appendChild(titleText);

    const manifestVersion = chrome?.runtime?.getManifest?.()?.version;
    const currentVersionNormalized = normalizeVersionString(manifestVersion);
    const currentReleaseTag = toReleaseTag(manifestVersion);
    const releaseUrl = manifestVersion
      ? `https://github.com/Nagi-ovo/gemini-voyager/releases/tag/${currentReleaseTag ?? `v${manifestVersion}`}`
      : 'https://github.com/Nagi-ovo/gemini-voyager/releases';
    const versionBadge = document.createElement('a');
    versionBadge.className = 'gv-pm-version';
    versionBadge.href = releaseUrl;
    versionBadge.target = '_blank';
    versionBadge.rel = 'noreferrer';
    versionBadge.title = manifestVersion
      ? `${i18n.t('extensionVersion')} ${manifestVersion}`
      : i18n.t('extensionVersion');
    versionBadge.textContent = manifestVersion ?? '...';

    titleRow.appendChild(title);
    titleRow.appendChild(versionBadge);

    (async () => {
      const isSafariBrowser = isSafari();
      const safariUpdateReminderEnabled = isSafariBrowser && shouldShowSafariUpdateReminder();

      // For Safari, the feature flag controls whether reminders are shown for all versions.
      if (isSafariBrowser && !safariUpdateReminderEnabled) return;

      const shouldShowUpdateNotification = shouldShowUpdateReminderForCurrentVersion({
        currentVersion: currentVersionNormalized,
        isSafariBrowser,
        safariReminderEnabled: safariUpdateReminderEnabled,
      });
      if (!shouldShowUpdateNotification) return;

      const latest = await getLatestVersionCached();
      const latestNormalized = normalizeVersionString(latest);
      const hasUpdate =
        currentVersionNormalized && latestNormalized
          ? compareVersions(latestNormalized, currentVersionNormalized) > 0
          : false;

      if (!hasUpdate || !latestNormalized) return;

      const latestTag = toReleaseTag(latest);
      const latestUrl = latestTag
        ? `https://github.com/Nagi-ovo/gemini-voyager/releases/tag/${latestTag}`
        : 'https://github.com/Nagi-ovo/gemini-voyager/releases/latest';

      versionBadge.classList.add('gv-pm-version-outdated');
      versionBadge.href = latestUrl;
      versionBadge.title = `${i18n.t('latestVersionLabel')}: v${latestNormalized}`;
    })();

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
    lockBtn.setAttribute('aria-pressed', 'false');
    lockBtn.setAttribute('data-icon', '🔓');
    lockBtn.title = i18n.t('pm_lock');

    const addBtn = createEl('button', 'gv-pm-add');
    addBtn.textContent = i18n.t('pm_add');

    controls.appendChild(langSel);
    controls.appendChild(addBtn);
    controls.appendChild(lockBtn);
    header.appendChild(dragHandle);
    header.appendChild(titleRow);
    header.appendChild(controls);

    const searchWrap = createEl('div', 'gv-pm-search');
    const searchInput = createEl('input') as HTMLInputElement;
    searchInput.type = 'search';
    searchInput.placeholder = i18n.t('pm_search_placeholder');
    searchWrap.appendChild(searchInput);

    const tagsWrap = createEl('div', 'gv-pm-tags');

    const list = createEl('div', 'gv-pm-list');

    const footer = createEl('div', 'gv-pm-footer');
    const importInput = createEl('input') as HTMLInputElement;
    importInput.type = 'file';
    importInput.accept = '.json,application/json';
    importInput.className = 'gv-pm-import-input';

    // Backup button - primary action
    const backupBtn = createEl('button', 'gv-pm-backup-btn');
    backupBtn.textContent = '💾 ' + i18n.t('pm_backup');
    backupBtn.title = i18n.t('pm_backup_tooltip');

    // Official Website button - primary action (right side)
    const websiteBtn = createEl('a', 'gv-pm-website-btn');
    websiteBtn.target = '_blank';
    websiteBtn.rel = 'noreferrer';
    // Initial text/href will be set in refreshUITexts

    // Primary actions container
    const primaryActions = createEl('div', 'gv-pm-footer-actions');
    primaryActions.appendChild(backupBtn);
    primaryActions.appendChild(websiteBtn);

    // Secondary actions container
    const secondaryActions = createEl('div', 'gv-pm-footer-secondary');

    const importBtn = createEl('button', 'gv-pm-import-btn');
    importBtn.textContent = i18n.t('pm_import');

    const exportBtn = createEl('button', 'gv-pm-export-btn');
    exportBtn.textContent = i18n.t('pm_export');

    const settingsBtn = createEl('button', 'gv-pm-settings');
    settingsBtn.textContent = i18n.t('pm_settings');
    settingsBtn.title = i18n.t('pm_settings_tooltip');

    const gh = document.createElement('a');
    gh.className = 'gv-pm-gh';
    gh.href = 'https://github.com/Nagi-ovo/gemini-voyager';
    gh.target = '_blank';
    gh.rel = 'noreferrer';
    gh.title = i18n.t('starProject');

    // Add icon and text
    const ghIcon = document.createElement('span');
    ghIcon.className = 'gv-pm-gh-icon';
    const ghText = document.createElement('span');
    ghText.className = 'gv-pm-gh-text';
    ghText.textContent = i18n.t('starProject');
    gh.appendChild(ghIcon);
    gh.appendChild(ghText);

    secondaryActions.appendChild(importBtn);
    secondaryActions.appendChild(exportBtn);
    secondaryActions.appendChild(settingsBtn);
    secondaryActions.appendChild(gh);

    footer.appendChild(primaryActions);
    footer.appendChild(secondaryActions);
    footer.appendChild(importInput);

    const addForm = elFromHTML(
      `<form class="gv-pm-add-form gv-hidden">
        <textarea class="gv-pm-input-text" placeholder="${escapeHtml(
          i18n.t('pm_prompt_placeholder') || 'Prompt text',
        )}" rows="3"></textarea>
        <input class="gv-pm-input-tags" type="text" placeholder="${escapeHtml(
          i18n.t('pm_tags_placeholder') || 'Tags (comma separated)',
        )}" />
        <div class="gv-pm-add-actions">
          <span class="gv-pm-inline-hint" aria-live="polite"></span>
          <button type="submit" class="gv-pm-save">${escapeHtml(i18n.t('pm_save') || 'Save')}</button>
          <button type="button" class="gv-pm-cancel">${escapeHtml(
            i18n.t('pm_cancel') || 'Cancel',
          )}</button>
        </div>
      </form>`,
    );

    // Notice as floating toast (not in footer layout)
    const notice = createEl('div', 'gv-pm-notice');

    panel.appendChild(header);
    panel.appendChild(searchWrap);
    panel.appendChild(tagsWrap);
    panel.appendChild(addForm);
    panel.appendChild(list);
    panel.appendChild(footer);
    panel.appendChild(notice);

    // State
    let items: PromptItem[] = await readStorage<PromptItem[]>(STORAGE_KEYS.items, []);
    let open = false;
    let selectedTags: Set<string> = new Set<string>();
    let locked = !!(await readStorage<boolean>(STORAGE_KEYS.locked, false));
    let savedPos = await readStorage<PanelPosition | null>(STORAGE_KEYS.position, null);
    let dragging = false;
    let dragOffset = { x: 0, y: 0 };
    let draggingTrigger = false;
    let editingId: string | null = null;
    let expandedItems: Set<string> = new Set<string>(); // Track expanded prompt items

    function setNotice(text: string, kind: 'ok' | 'err' = 'ok') {
      notice.textContent = text || '';
      notice.classList.toggle('ok', kind === 'ok');
      notice.classList.toggle('err', kind === 'err');
      if (text) {
        window.setTimeout(() => {
          if (notice.textContent === text) notice.textContent = '';
        }, 1800);
      }
    }

    function setInlineHint(text: string, kind: 'ok' | 'err' = 'err'): void {
      const hint = addForm.querySelector('.gv-pm-inline-hint') as HTMLSpanElement | null;
      if (!hint) return;
      hint.textContent = text || '';
      hint.classList.toggle('ok', kind === 'ok');
      hint.classList.toggle('err', kind === 'err');
    }

    function renderTags(): void {
      const all = collectAllTags(items);
      tagsWrap.innerHTML = '';
      const allBtn = createEl('button', 'gv-pm-tag');
      allBtn.textContent = i18n.t('pm_all_tags') || 'All';
      allBtn.classList.toggle('active', selectedTags.size === 0);
      allBtn.addEventListener('click', () => {
        selectedTags = new Set();
        renderTags();
        renderList();
      });
      tagsWrap.appendChild(allBtn);
      for (const tag of all) {
        const btn = createEl('button', 'gv-pm-tag');
        btn.textContent = tag;
        btn.classList.toggle('active', selectedTags.has(tag));
        btn.addEventListener('click', () => {
          if (selectedTags.has(tag)) selectedTags.delete(tag);
          else selectedTags.add(tag);
          renderTags();
          renderList();
        });
        tagsWrap.appendChild(btn);
      }
    }

    function renderList(): void {
      const q = (searchInput.value || '').trim().toLowerCase();
      const selectedTagList = Array.from(selectedTags);
      const filtered = items.filter((it) => {
        const okTag =
          selectedTagList.length === 0 || selectedTagList.every((t) => it.tags.includes(t));
        if (!okTag) return false;
        if (!q) return true;
        return it.text.toLowerCase().includes(q) || it.tags.some((t) => t.includes(q));
      });
      list.innerHTML = '';
      if (filtered.length === 0) {
        const empty = createEl('div', 'gv-pm-empty');
        empty.textContent = i18n.t('pm_empty') || 'No prompts yet';
        list.appendChild(empty);
        return;
      }
      const frag = document.createDocumentFragment();
      for (const it of filtered) {
        const row = createEl('div', 'gv-pm-item');

        // Create text container with expand/collapse functionality
        const textContainer = createEl('div', 'gv-pm-item-text-container');
        const textBtn = createEl('button', 'gv-pm-item-text');

        // Render Markdown + KaTeX preview (sanitized)
        const md = document.createElement('div');
        md.className = 'gv-md';

        // Apply collapsed class if not expanded
        const isExpanded = expandedItems.has(it.id);
        if (!isExpanded) {
          md.classList.add('gv-md-collapsed');
        }

        // Insert element into DOM first, then render to ensure KaTeX can detect document mode correctly
        textBtn.appendChild(md);

        // Defer rendering to next frame to ensure element is fully attached
        requestAnimationFrame(() => {
          try {
            const out = marked.parse(it.text as string);
            if (typeof out === 'string') {
              md.innerHTML = DOMPurify.sanitize(out);
            } else {
              out
                .then((html: string) => {
                  md.innerHTML = DOMPurify.sanitize(html);
                })
                .catch(() => {
                  md.textContent = it.text;
                });
            }
          } catch {
            md.textContent = it.text;
          }
        });

        textBtn.title = i18n.t('pm_copy') || 'Copy';
        textBtn.addEventListener('click', async (e) => {
          // Don't copy when clicking expand button
          if ((e.target as HTMLElement).closest('.gv-pm-expand-btn')) return;
          await copyText(it.text);
          setNotice(i18n.t('pm_copied') || 'Copied', 'ok');
        });

        // Add expand/collapse button
        const expandBtn = createEl('button', 'gv-pm-expand-btn');
        expandBtn.innerHTML = isExpanded ? '▲' : '▼';
        expandBtn.title = isExpanded
          ? i18n.t('pm_collapse') || 'Collapse'
          : i18n.t('pm_expand') || 'Expand';
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (expandedItems.has(it.id)) {
            expandedItems.delete(it.id);
          } else {
            expandedItems.add(it.id);
          }
          renderList();
        });

        textContainer.appendChild(textBtn);
        textContainer.appendChild(expandBtn);

        // Edit button
        const editBtn = createEl('button', 'gv-pm-edit');
        editBtn.setAttribute('aria-label', i18n.t('pm_edit') || 'Edit');
        //editBtn.textContent = '✏️';
        editBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          // Start inline edit using the add form fields
          (addForm.querySelector('.gv-pm-input-text') as HTMLTextAreaElement).value = it.text;
          (addForm.querySelector('.gv-pm-input-tags') as HTMLInputElement).value = (
            it.tags || []
          ).join(', ');
          addForm.classList.remove('gv-hidden');
          (addForm.querySelector('.gv-pm-input-text') as HTMLTextAreaElement).focus();
          editingId = it.id;
        });
        const bottom = createEl('div', 'gv-pm-bottom');
        const meta = createEl('div', 'gv-pm-item-meta');
        for (const t of it.tags) {
          const chip = createEl('span', 'gv-pm-chip');
          chip.textContent = t;
          chip.addEventListener('click', () => {
            if (selectedTags.has(t)) selectedTags.delete(t);
            else selectedTags.add(t);
            renderTags();
            renderList();
          });
          meta.appendChild(chip);
        }
        // Actions container at row bottom-right
        const actions = createEl('div', 'gv-pm-actions');
        const del = createEl('button', 'gv-pm-del');
        del.title = i18n.t('pm_delete') || 'Delete';
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          // inline confirm popover (floating)
          if (document.body.querySelector('.gv-pm-confirm')) return; // one at a time
          const pop = document.createElement('div');
          pop.className = 'gv-pm-confirm';
          const msg = document.createElement('span');
          msg.textContent = i18n.t('pm_delete_confirm') || 'Delete this prompt?';
          const yes = document.createElement('button');
          yes.className = 'gv-pm-confirm-yes';
          yes.textContent = i18n.t('pm_delete') || 'Delete';
          const no = document.createElement('button');
          no.textContent = i18n.t('pm_cancel') || 'Cancel';
          pop.appendChild(msg);
          pop.appendChild(yes);
          pop.appendChild(no);
          document.body.appendChild(pop);
          // position near button
          const r = del.getBoundingClientRect();
          const vw = window.innerWidth;
          const side: 'left' | 'right' = r.right + 220 > vw ? 'left' : 'right';
          const top = Math.max(8, r.top + window.scrollY - 6);
          const left =
            side === 'right'
              ? r.right + window.scrollX + 10
              : r.left + window.scrollX - pop.offsetWidth - 10;
          pop.style.top = `${Math.round(top)}px`;
          pop.style.left = `${Math.round(Math.max(8, left))}px`;
          pop.setAttribute('data-side', side);
          const cleanup = () => {
            try {
              pop.remove();
            } catch {}
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('click', onOutside, true);
          };
          const onOutside = (ev: MouseEvent) => {
            const t = ev.target as HTMLElement;
            if (!t.closest('.gv-pm-confirm')) cleanup();
          };
          const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') cleanup();
          };
          window.addEventListener('click', onOutside, true);
          window.addEventListener('keydown', onKey, { passive: true });
          no.addEventListener('click', (ev) => {
            ev.stopPropagation();
            cleanup();
          });
          yes.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            items = items.filter((x) => x.id !== it.id);
            await writeStorage(STORAGE_KEYS.items, items);
            cleanup();
            renderTags();
            renderList();
            setNotice(i18n.t('pm_deleted') || 'Deleted', 'ok');
          });
        });

        // Append text container instead of textBtn
        row.appendChild(textContainer);

        actions.appendChild(editBtn);
        actions.appendChild(del);
        bottom.appendChild(meta);
        bottom.appendChild(actions);
        row.appendChild(bottom);
        frag.appendChild(row);
      }
      list.appendChild(frag);
      // KaTeX rendered during Markdown step, no post-typeset needed
    }

    function openPanel(): void {
      open = true;
      panel.classList.remove('gv-hidden');
      if (locked && savedPos) {
        panel.style.left = `${Math.round(savedPos.left)}px`;
        panel.style.top = `${Math.round(savedPos.top)}px`;
      } else {
        // measure after making visible
        const pos = computeAnchoredPosition(trigger, panel);
        panel.style.left = `${pos.left}px`;
        panel.style.top = `${pos.top}px`;
      }
    }

    function closePanel(): void {
      open = false;
      panel.classList.add('gv-hidden');
    }

    function applyLockUI(): void {
      lockBtn.classList.toggle('active', locked);
      lockBtn.setAttribute('aria-pressed', locked ? 'true' : 'false');
      // When locked, show 🔒; when unlocked, show 🔓.
      lockBtn.setAttribute('data-icon', locked ? '🔒' : '🔓');
      lockBtn.title = locked ? i18n.t('pm_unlock') || 'Unlock' : i18n.t('pm_lock') || 'Lock';
      panel.classList.toggle('gv-locked', locked);
    }

    function refreshUITexts(): void {
      // Keep custom icon + label
      titleText.textContent = 'Gemini Voyager';
      addBtn.textContent = i18n.t('pm_add');
      searchInput.placeholder = i18n.t('pm_search_placeholder');
      importBtn.textContent = i18n.t('pm_import');
      exportBtn.textContent = i18n.t('pm_export');
      backupBtn.textContent = '💾 ' + i18n.t('pm_backup');
      backupBtn.title = i18n.t('pm_backup_tooltip');

      // Update website button
      websiteBtn.textContent = '🌐 ' + i18n.t('officialDocs');
      i18n.get().then((lang) => {
        websiteBtn.href =
          lang === 'zh'
            ? 'https://voyager.nagi.fun/guide/sponsor'
            : `https://voyager.nagi.fun/${lang}/guide/sponsor`;
      });

      settingsBtn.textContent = i18n.t('pm_settings');
      settingsBtn.title = i18n.t('pm_settings_tooltip');
      gh.title = i18n.t('starProject');
      const ghTextEl = gh.querySelector('.gv-pm-gh-text');
      if (ghTextEl) ghTextEl.textContent = i18n.t('starProject');
      (addForm.querySelector('.gv-pm-input-text') as HTMLTextAreaElement).placeholder =
        i18n.t('pm_prompt_placeholder');
      (addForm.querySelector('.gv-pm-input-tags') as HTMLInputElement).placeholder =
        i18n.t('pm_tags_placeholder');
      (addForm.querySelector('.gv-pm-save') as HTMLButtonElement).textContent = i18n.t('pm_save');
      (addForm.querySelector('.gv-pm-cancel') as HTMLButtonElement).textContent =
        i18n.t('pm_cancel');
      applyLockUI();
      renderTags();
      renderList();
    }

    function onReposition(): void {
      if (!open) return;
      if (locked) return;
      const pos = computeAnchoredPosition(trigger, panel);
      panel.style.left = `${pos.left}px`;
      panel.style.top = `${pos.top}px`;
    }

    function beginDrag(ev: PointerEvent): void {
      if (locked) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      dragOffset = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      try {
        panel.setPointerCapture?.(ev.pointerId);
      } catch {}
    }

    async function endDrag(_ev: PointerEvent): Promise<void> {
      if (!dragging) return;
      dragging = false;
      const rect = panel.getBoundingClientRect();
      savedPos = { left: rect.left, top: rect.top };
      await writeStorage(STORAGE_KEYS.position, savedPos);
    }

    function onDragMove(ev: PointerEvent): void {
      if (dragging) {
        const x = ev.clientX - dragOffset.x;
        const y = ev.clientY - dragOffset.y;
        panel.style.left = `${Math.round(x)}px`;
        panel.style.top = `${Math.round(y)}px`;
      } else if (draggingTrigger) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = trigger.getBoundingClientRect();
        const w = rect.width || 36;
        const h = rect.height || 36;
        const right = Math.max(6, Math.min(vw - 6 - w, vw - ev.clientX - w / 2));
        const bottom = Math.max(6, Math.min(vh - 6 - h, vh - ev.clientY - h / 2));
        trigger.style.right = `${Math.round(right)}px`;
        trigger.style.bottom = `${Math.round(bottom)}px`;
      }
    }

    // Events
    trigger.addEventListener('click', () => {
      if (open) closePanel();
      else {
        openPanel();
        renderTags();
        renderList();
      }
    });

    // Handle window resize - constrain trigger and reposition panel
    // Handle window resize - constrain trigger and reposition panel
    const onWindowResize = () => {
      constrainTriggerPosition();
      onReposition();
    };
    window.addEventListener('resize', onWindowResize, { passive: true });

    window.addEventListener('scroll', onReposition, { passive: true });

    // Close when clicking outside of the manager (panel/trigger/confirm are exceptions)
    const onWindowPointerDown = (ev: PointerEvent) => {
      if (!open) return;
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`#${ID.panel}`)) return;
      if (target.closest(`#${ID.trigger}`)) return;
      if (target.closest('.gv-pm-confirm')) return;
      closePanel();
    };
    window.addEventListener('pointerdown', onWindowPointerDown, { capture: true });

    // Close on Escape
    const onWindowKeyDown = (ev: KeyboardEvent) => {
      if (!open) return;
      if (ev.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onWindowKeyDown, { passive: true });

    lockBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      locked = !locked;
      await writeStorage(STORAGE_KEYS.locked, locked);
      applyLockUI();
      try {
        (ev.currentTarget as HTMLButtonElement)?.blur?.();
      } catch {}
      if (locked) {
        const rect = panel.getBoundingClientRect();
        savedPos = { left: rect.left, top: rect.top };
        await writeStorage(STORAGE_KEYS.position, savedPos);
      } else {
        onReposition();
      }
    });
    panel.addEventListener('pointerdown', (ev: PointerEvent) => {
      const target = ev.target as HTMLElement;
      if (target.closest('.gv-pm-drag')) beginDrag(ev);
    });
    window.addEventListener('pointermove', onDragMove, { passive: true });
    window.addEventListener('pointerup', endDrag, { passive: true });

    // Trigger drag (always draggable)
    let triggerDragStartPos: { x: number; y: number } | null = null;
    trigger.addEventListener('pointerdown', (ev: PointerEvent) => {
      if (typeof ev.button === 'number' && ev.button !== 0) return;
      draggingTrigger = true;
      triggerDragStartPos = { x: ev.clientX, y: ev.clientY };
      try {
        trigger.setPointerCapture?.(ev.pointerId);
      } catch {}
    });

    const onTriggerDragEnd = async (ev: PointerEvent) => {
      if (draggingTrigger) {
        draggingTrigger = false;
        // Only save if the trigger actually moved (threshold: 5px)
        if (triggerDragStartPos) {
          const dx = Math.abs(ev.clientX - triggerDragStartPos.x);
          const dy = Math.abs(ev.clientY - triggerDragStartPos.y);
          if (dx > 5 || dy > 5) {
            const r = parseFloat((trigger.style.right || '').replace('px', '')) || 18;
            const b = parseFloat((trigger.style.bottom || '').replace('px', '')) || 18;
            await writeStorage(STORAGE_KEYS.triggerPos, { right: r, bottom: b });
          }
        }
        triggerDragStartPos = null;
      }
    };
    window.addEventListener('pointerup', onTriggerDragEnd, { passive: true });

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
        if (shouldHide) {
          // Hide trigger and panel
          trigger.style.display = 'none';
          panel.classList.add('gv-hidden');
          open = false;
        } else {
          // Show trigger
          trigger.style.display = '';
        }
      }
      // Handle prompt data changes from cloud sync (local storage)
      if (area === 'local' && changes?.gvPromptItems) {
        pmLogger.info('Prompt data changed in chrome.storage.local, reloading...');
        const newItems = changes.gvPromptItems.newValue;
        if (Array.isArray(newItems)) {
          items = newItems;
          renderTags();
          renderList();
          setNotice(i18n.t('syncSuccess') || 'Synced', 'ok');
        }
      }
    };

    try {
      browser.storage.onChanged.addListener(storageChangeHandler);
    } catch {}

    addBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      editingId = null;
      addForm.classList.remove('gv-hidden');
      (addForm.querySelector('.gv-pm-input-text') as HTMLTextAreaElement)?.focus();
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

    (addForm.querySelector('.gv-pm-cancel') as HTMLButtonElement).addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        editingId = null;
        addForm.classList.add('gv-hidden');
      },
    );
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = (addForm.querySelector('.gv-pm-input-text') as HTMLTextAreaElement).value.trim();
      const tagsRaw = (addForm.querySelector('.gv-pm-input-tags') as HTMLInputElement).value;
      const tags = dedupeTags((tagsRaw || '').split(',').map((s) => s.trim()));
      if (!text) return;
      if (editingId) {
        const dup = items.some(
          (x) => x.id !== editingId && x.text.trim().toLowerCase() === text.toLowerCase(),
        );
        if (dup) {
          setInlineHint(i18n.t('pm_duplicate') || 'Duplicate prompt', 'err');
          return;
        }
        const target = items.find((x) => x.id === editingId);
        if (target) {
          target.text = text;
          target.tags = tags;
          target.updatedAt = Date.now();
          await writeStorage(STORAGE_KEYS.items, items);
          setNotice(i18n.t('pm_saved') || 'Saved', 'ok');
        }
        editingId = null;
      } else {
        // prevent duplicates (case-insensitive, same text)
        const exists = items.some((x) => x.text.trim().toLowerCase() === text.toLowerCase());
        if (exists) {
          setInlineHint(i18n.t('pm_duplicate') || 'Duplicate prompt', 'err');
          return;
        }
        const it: PromptItem = { id: uid(), text, tags, createdAt: Date.now() };
        items = [it, ...items];
        await writeStorage(STORAGE_KEYS.items, items);
      }
      (addForm.querySelector('.gv-pm-input-text') as HTMLTextAreaElement).value = '';
      (addForm.querySelector('.gv-pm-input-tags') as HTMLInputElement).value = '';
      setInlineHint('');
      addForm.classList.add('gv-hidden');
      renderTags();
      renderList();
    });

    searchInput.addEventListener('input', () => renderList());

    exportBtn.addEventListener('click', async () => {
      try {
        const data = await readStorage<PromptItem[]>(STORAGE_KEYS.items, []);
        const payload = {
          format: 'gemini-voyager.prompts.v1',
          exportedAt: new Date().toISOString(),
          items: data,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prompts-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        setNotice('Export failed', 'err');
      }
    });

    // Backup button handler - creates timestamp folder with all data
    backupBtn.addEventListener('click', async () => {
      try {
        // Read prompts
        const prompts = await readStorage<PromptItem[]>(STORAGE_KEYS.items, []);
        const promptPayload = {
          format: 'gemini-voyager.prompts.v1',
          exportedAt: new Date().toISOString(),
          items: prompts,
        };

        // Read folders (Safari-compatible: uses storage adapter)
        const folderStorage = createFolderStorageAdapter();
        const folderData = (await folderStorage.loadData('gvFolderData')) || {
          folders: [],
          folderContents: {},
        };

        // Create folder export payload with correct format
        const folderPayload = {
          format: 'gemini-voyager.folders.v1',
          exportedAt: new Date().toISOString(),
          version: '0.9.3',
          data: {
            folders: folderData.folders || [],
            folderContents: folderData.folderContents || {},
          },
        };

        // Count conversations
        const conversationCount = Object.values(folderData.folderContents || {}).reduce(
          (sum: number, convs: unknown) => sum + (Array.isArray(convs) ? convs.length : 0),
          0,
        );

        // Create metadata
        const metadata = {
          version: '0.9.3',
          timestamp: new Date().toISOString(),
          includesPrompts: true,
          includesFolders: true,
          promptCount: prompts.length,
          folderCount: folderData.folders?.length || 0,
          conversationCount,
        };

        // Generate timestamp for folder/file name
        const pad = (n: number) => String(n).padStart(2, '0');
        const d = new Date();
        const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
        const folderName = `backup-${timestamp}`;

        // Check File System Access API support
        if ('showDirectoryPicker' in window) {
          // Modern browsers (Chrome, Edge) - use File System Access API
          const dirHandle = await (
            window as Window & {
              showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
            }
          ).showDirectoryPicker({ mode: 'readwrite' });
          if (!dirHandle) {
            setNotice(i18n.t('pm_backup_cancelled') || 'Backup cancelled', 'err');
            return;
          }

          const backupDir = await dirHandle.getDirectoryHandle(folderName, { create: true });

          // Write files
          const promptsFile = await backupDir.getFileHandle('prompts.json', { create: true });
          const promptsWritable = await promptsFile.createWritable();
          await promptsWritable.write(JSON.stringify(promptPayload, null, 2));
          await promptsWritable.close();

          const foldersFile = await backupDir.getFileHandle('folders.json', { create: true });
          const foldersWritable = await foldersFile.createWritable();
          await foldersWritable.write(JSON.stringify(folderPayload, null, 2));
          await foldersWritable.close();

          const metaFile = await backupDir.getFileHandle('metadata.json', { create: true });
          const metaWritable = await metaFile.createWritable();
          await metaWritable.write(JSON.stringify(metadata, null, 2));
          await metaWritable.close();

          setNotice(
            `✓ Backed up ${prompts.length} prompts, ${folderData.folders?.length || 0} folders`,
            'ok',
          );
        } else {
          // Fallback for Firefox, Safari - download as ZIP file
          const zip = new JSZip();

          // Add files to ZIP
          zip.file('prompts.json', JSON.stringify(promptPayload, null, 2));
          zip.file('folders.json', JSON.stringify(folderPayload, null, 2));
          zip.file('metadata.json', JSON.stringify(metadata, null, 2));

          // Generate ZIP file
          const zipBlob = await zip.generateAsync({ type: 'blob' });

          // Download ZIP file
          const url = URL.createObjectURL(zipBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${folderName}.zip`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);

          setNotice(
            `✓ Downloaded ${folderName}.zip (${prompts.length} prompts, ${folderData.folders?.length || 0} folders)`,
            'ok',
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setNotice(i18n.t('pm_backup_cancelled') || 'Backup cancelled', 'err');
        } else {
          console.error('[PromptManager] Backup failed:', err);
          setNotice(i18n.t('pm_backup_error') || '✗ Backup failed', 'err');
        }
      }
    });

    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = safeParseJSON<Record<string, unknown> | null>(text, null);
        if (!json || (json.format !== 'gemini-voyager.prompts.v1' && !Array.isArray(json.items))) {
          setNotice(i18n.t('pm_import_invalid') || 'Invalid file format', 'err');
          return;
        }
        const arr: PromptItem[] = Array.isArray(json)
          ? json
          : Array.isArray(json.items)
            ? json.items
            : [];
        const valid: PromptItem[] = [];
        const seen = new Set<string>();
        for (const it of arr) {
          const itObj = it as Record<string, unknown>;
          const text = String((itObj && itObj.text) || '').trim();
          if (!text) continue;
          const tags = Array.isArray(itObj.tags) ? itObj.tags.map((t: unknown) => String(t)) : [];
          const key = `${text.toLowerCase()}|${tags.sort().join(',')}`;
          if (seen.has(key)) continue;
          seen.add(key);
          valid.push({ id: uid(), text, tags: dedupeTags(tags), createdAt: Date.now() });
        }
        if (valid.length) {
          // Merge by text equality (case-insensitive)
          const map = new Map<string, PromptItem>();
          for (const it of items) map.set(it.text.toLowerCase(), it);
          for (const it of valid) {
            const k = it.text.toLowerCase();
            if (map.has(k)) {
              const prev = map.get(k)!;
              const mergedTags = dedupeTags([...(prev.tags || []), ...(it.tags || [])]);
              prev.tags = mergedTags;
              prev.updatedAt = Date.now();
              map.set(k, prev);
            } else {
              map.set(k, it);
            }
          }
          items = Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          await writeStorage(STORAGE_KEYS.items, items);
          setNotice(
            (i18n.t('pm_import_success') || 'Imported').replace('{count}', String(valid.length)),
            'ok',
          );
          renderTags();
          renderList();
        } else {
          setNotice(i18n.t('pm_import_invalid') || 'Invalid file format', 'err');
        }
      } catch {
        setNotice(i18n.t('pm_import_invalid') || 'Invalid file format', 'err');
      } finally {
        importInput.value = '';
      }
    });

    // Initialize
    refreshUITexts();

    // Return destroy function
    return {
      destroy: () => {
        try {
          window.removeEventListener('resize', onWindowResize);
          window.removeEventListener('scroll', onReposition);
          window.removeEventListener('pointerdown', onWindowPointerDown, { capture: true });
          window.removeEventListener('keydown', onWindowKeyDown);
          window.removeEventListener('pointermove', onDragMove);
          window.removeEventListener('pointerup', endDrag);
          window.removeEventListener('pointerup', onTriggerDragEnd);

          chrome.storage?.onChanged?.removeListener(storageChangeHandler);

          trigger.remove();
          panel.remove();
          document.querySelectorAll('.gv-pm-confirm').forEach((el) => el.remove());
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
