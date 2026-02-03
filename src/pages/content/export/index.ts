// Static imports to avoid CSP issues with dynamic imports in content scripts
import { StorageKeys } from '@/core/types/common';
import { type AppLanguage, normalizeLanguage } from '@/utils/language';
import { extractMessageDictionary } from '@/utils/localeMessages';
import type { TranslationKey } from '@/utils/translations';

import { BatchExportService } from '../../../features/export/services/BatchExportService';
import { ConversationExportService } from '../../../features/export/services/ConversationExportService';
import type { ConversationMetadata } from '../../../features/export/types/export';
import { ExportDialog } from '../../../features/export/ui/ExportDialog';
import {
  computeConversationFingerprint,
  waitForConversationFingerprintChangeOrTimeout,
} from './topNodePreload';

// Storage key to persist export state across reloads (e.g. when clicking top node triggers refresh)
const SESSION_KEY_PENDING_EXPORT = 'gv_export_pending';

interface PendingExportState {
  format: string; // ExportFormat
  attempt: number;
  url: string;
  status: 'clicking';
  timestamp: number;
}

function hashString(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function waitForElement(selector: string, timeoutMs: number = 6000): Promise<Element | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);
    const obs = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        try {
          obs.disconnect();
        } catch {}
        resolve(found);
      }
    });
    try {
      obs.observe(document.body, { childList: true, subtree: true });
    } catch {}
    if (timeoutMs > 0)
      setTimeout(() => {
        try {
          obs.disconnect();
        } catch {}
        resolve(null);
      }, timeoutMs);
  });
}

function waitForAnyElement(
  selectors: string[],
  timeoutMs: number = 10000,
): Promise<Element | null> {
  return new Promise((resolve) => {
    // Check first
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return resolve(el);
    }

    const obs = new MutationObserver(() => {
      for (const s of selectors) {
        const found = document.querySelector(s);
        if (found) {
          try {
            obs.disconnect();
          } catch {}
          resolve(found);
          return;
        }
      }
    });

    try {
      obs.observe(document.body, { childList: true, subtree: true });
    } catch {}

    if (timeoutMs > 0)
      setTimeout(() => {
        try {
          obs.disconnect();
        } catch {}
        resolve(null);
      }, timeoutMs);
  });
}

function normalizeText(text: string | null): string {
  try {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

// Note: cleaning of thinking toggles is handled at DOM level in extractAssistantText

function filterTopLevel(elements: Element[]): HTMLElement[] {
  const arr = elements.map((e) => e as HTMLElement);
  const out: HTMLElement[] = [];
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];
    let isDescendant = false;
    for (let j = 0; j < arr.length; j++) {
      if (i === j) continue;
      const other = arr[j];
      if (other.contains(el)) {
        isDescendant = true;
        break;
      }
    }
    if (!isDescendant) out.push(el);
  }
  return out;
}

function getConversationRoot(): HTMLElement {
  return (document.querySelector('main') as HTMLElement) || (document.body as HTMLElement);
}

function computeConversationId(): string {
  const raw = `${location.host}${location.pathname}${location.search}`;
  return `gemini:${hashString(raw)}`;
}

function getUserSelectors(): string[] {
  const configured = (() => {
    try {
      return (
        localStorage.getItem('geminiTimelineUserTurnSelector') ||
        localStorage.getItem('geminiTimelineUserTurnSelectorAuto') ||
        ''
      );
    } catch {
      return '';
    }
  })();
  const defaults = [
    '.user-query-bubble-with-background',
    '.user-query-bubble-container',
    '.user-query-container',
    'user-query-content .user-query-bubble-with-background',
    'div[aria-label="User message"]',
    'article[data-author="user"]',
    'article[data-turn="user"]',
    '[data-message-author-role="user"]',
    'div[role="listitem"][data-user="true"]',
  ];
  return configured ? [configured, ...defaults.filter((s) => s !== configured)] : defaults;
}

function getAssistantSelectors(): string[] {
  return [
    // Attribute-based roles
    '[aria-label="Gemini response"]',
    '[data-message-author-role="assistant"]',
    '[data-message-author-role="model"]',
    'article[data-author="assistant"]',
    'article[data-turn="assistant"]',
    'article[data-turn="model"]',
    // Common Gemini containers
    '.model-response, model-response',
    '.response-container',
    'div[role="listitem"]:not([data-user="true"])',
  ];
}

function dedupeByTextAndOffset(elements: HTMLElement[], firstTurnOffset: number): HTMLElement[] {
  const seen = new Set<string>();
  const out: HTMLElement[] = [];
  for (const el of elements) {
    const offsetFromStart = (el.offsetTop || 0) - firstTurnOffset;
    const key = `${normalizeText(el.textContent || '')}|${Math.round(offsetFromStart)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(el);
  }
  return out;
}

function ensureTurnId(el: Element, index: number): string {
  const asEl = el as HTMLElement & { dataset?: DOMStringMap & { turnId?: string } };
  let id = (asEl.dataset && (asEl.dataset as any).turnId) || '';
  if (!id) {
    const basis = normalizeText(asEl.textContent || '') || `user-${index}`;
    id = `u-${index}-${hashString(basis)}`;
    try {
      (asEl.dataset as any).turnId = id;
    } catch {}
  }
  return id;
}

function readStarredSet(): Set<string> {
  const cid = computeConversationId();
  try {
    const raw = localStorage.getItem(`geminiTimelineStars:${cid}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((x: any) => String(x)));
  } catch {
    return new Set();
  }
}

function extractAssistantText(el: HTMLElement): string {
  // Prefer direct text from message container if available (connected to DOM)
  try {
    const mc = el.querySelector(
      'message-content, .markdown, .markdown-main-panel',
    ) as HTMLElement | null;
    if (mc) {
      const raw = mc.textContent || mc.innerText || '';
      const txt = normalizeText(raw);
      if (txt) return txt;
    }
  } catch {}

  // Clone and remove reasoning toggles/labels before reading text (detached fallback)
  const clone = el.cloneNode(true) as HTMLElement;
  const matchesReasonToggle = (txt: string): boolean => {
    const s = normalizeText(txt).toLowerCase();
    if (!s) return false;
    return (
      /^(show\s*(thinking|reasoning)|hide\s*(thinking|reasoning))$/i.test(s) ||
      /^(显示\s*(思路|推理)|隐藏\s*(思路|推理))$/u.test(s)
    );
  };
  const shouldDrop = (node: HTMLElement): boolean => {
    const role = (node.getAttribute('role') || '').toLowerCase();
    const aria = (node.getAttribute('aria-label') || '').toLowerCase();
    const txt = node.textContent || '';
    if (matchesReasonToggle(txt)) return true;
    if (role === 'button' && (/thinking|reasoning/i.test(txt) || /思路|推理/u.test(txt)))
      return true;
    if (/thinking|reasoning/i.test(aria) || /思路|推理/u.test(aria)) return true;
    return false;
  };
  try {
    const candidates = clone.querySelectorAll(
      'button, [role="button"], [aria-label], span, div, a',
    );
    candidates.forEach((n) => {
      const eln = n as HTMLElement;
      if (shouldDrop(eln)) eln.remove();
    });
  } catch {}
  const text = normalizeText(clone.innerText || clone.textContent || '');
  return text;
}

export type ChatTurn = {
  user: string;
  assistant: string;
  starred: boolean;
  userElement?: HTMLElement;
  assistantElement?: HTMLElement;
};

export function collectChatPairs(): ChatTurn[] {
  const root = getConversationRoot();
  const userSelectors = getUserSelectors();
  const assistantSelectors = getAssistantSelectors();
  const userNodeList = root.querySelectorAll(userSelectors.join(','));
  if (!userNodeList || userNodeList.length === 0) return [];
  let users = filterTopLevel(Array.from(userNodeList));
  if (users.length === 0) return [];

  const firstOffset = (users[0] as HTMLElement).offsetTop || 0;
  users = dedupeByTextAndOffset(users, firstOffset);
  const userOffsets = users.map((el) => (el as HTMLElement).offsetTop || 0);

  const assistantsAll = Array.from(root.querySelectorAll(assistantSelectors.join(',')));
  const assistants = filterTopLevel(assistantsAll);
  const assistantOffsets = assistants.map((el) => (el as HTMLElement).offsetTop || 0);

  const starredSet = readStarredSet();
  const pairs: ChatTurn[] = [];
  for (let i = 0; i < users.length; i++) {
    const uEl = users[i] as HTMLElement;
    const uText = normalizeText(uEl.innerText || uEl.textContent || '');
    const start = userOffsets[i];
    const end = i + 1 < userOffsets.length ? userOffsets[i + 1] : Number.POSITIVE_INFINITY;
    let aText = '';
    let aEl: HTMLElement | null = null;
    let bestIdx = -1;
    let bestOff = Number.POSITIVE_INFINITY;
    for (let k = 0; k < assistants.length; k++) {
      const off = assistantOffsets[k];
      if (off >= start && off < end) {
        if (off < bestOff) {
          bestOff = off;
          bestIdx = k;
        }
      }
    }
    if (bestIdx >= 0) {
      aEl = assistants[bestIdx] as HTMLElement;
      aText = extractAssistantText(aEl);
    } else {
      // Fallback: search next siblings up to a small window
      let sib: HTMLElement | null = uEl;
      for (let step = 0; step < 8 && sib; step++) {
        sib = sib.nextElementSibling as HTMLElement | null;
        if (!sib) break;
        if (sib.matches(userSelectors.join(','))) break;
        if (sib.matches(assistantSelectors.join(','))) {
          aEl = sib;
          aText = extractAssistantText(sib);
          break;
        }
      }
    }
    const turnId = ensureTurnId(uEl, i);
    const starred = !!turnId && starredSet.has(turnId);
    if (uText || aText) {
      // Prefer a richer assistant container for downstream rich extraction
      let finalAssistantEl: HTMLElement | undefined = undefined;
      if (aEl) {
        const pick =
          (aEl.querySelector('message-content') as HTMLElement | null) ||
          (aEl.querySelector('.markdown, .markdown-main-panel') as HTMLElement | null) ||
          (aEl.closest('.presented-response-container') as HTMLElement | null) ||
          (aEl.querySelector(
            '.presented-response-container, .response-content',
          ) as HTMLElement | null) ||
          (aEl.querySelector('response-element') as HTMLElement | null) ||
          aEl;
        finalAssistantEl = pick || undefined;
      }
      pairs.push({
        user: uText,
        assistant: aText,
        starred,
        userElement: uEl,
        assistantElement: finalAssistantEl,
      });
    }
  }
  return pairs;
}

function downloadJSON(data: any, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch {}
    URL.revokeObjectURL(url);
  }, 0);
}

function buildExportPayload(pairs: ChatTurn[]) {
  return {
    format: 'gemini-voyager.chat.v1',
    url: location.href,
    exportedAt: new Date().toISOString(),
    count: pairs.length,
    items: pairs,
  };
}

function ensureButtonInjected(container: Element): HTMLButtonElement | null {
  const host = container as HTMLElement;
  if (!host || host.querySelector('.gv-export-btn'))
    return host.querySelector('.gv-export-btn') as HTMLButtonElement | null;
  const btn = document.createElement('button');
  btn.className = 'gv-export-btn';
  btn.type = 'button';
  btn.title = 'Export chat history (JSON)';
  btn.setAttribute('aria-label', 'Export chat history (JSON)');
  host.appendChild(btn);
  return btn;
}

function formatFilename(): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date();
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `gemini-chat-${y}${m}${day}-${hh}${mm}${ss}.json`;
}

async function loadDictionaries(): Promise<Record<AppLanguage, Record<string, string>>> {
  try {
    const [enRaw, zhRaw, zhTWRaw, jaRaw, frRaw, esRaw, ptRaw, arRaw, ruRaw] = await Promise.all([
      import(/* @vite-ignore */ '../../../locales/en/messages.json'),
      import(/* @vite-ignore */ '../../../locales/zh/messages.json'),
      import(/* @vite-ignore */ '../../../locales/zh_TW/messages.json'),
      import(/* @vite-ignore */ '../../../locales/ja/messages.json'),
      import(/* @vite-ignore */ '../../../locales/fr/messages.json'),
      import(/* @vite-ignore */ '../../../locales/es/messages.json'),
      import(/* @vite-ignore */ '../../../locales/pt/messages.json'),
      import(/* @vite-ignore */ '../../../locales/ar/messages.json'),
      import(/* @vite-ignore */ '../../../locales/ru/messages.json'),
    ]);

    return {
      en: extractMessageDictionary(enRaw),
      zh: extractMessageDictionary(zhRaw),
      zh_TW: extractMessageDictionary(zhTWRaw),
      ja: extractMessageDictionary(jaRaw),
      fr: extractMessageDictionary(frRaw),
      es: extractMessageDictionary(esRaw),
      pt: extractMessageDictionary(ptRaw),
      ar: extractMessageDictionary(arRaw),
      ru: extractMessageDictionary(ruRaw),
    };
  } catch {
    return { en: {}, zh: {}, zh_TW: {}, ja: {}, fr: {}, es: {}, pt: {}, ar: {}, ru: {} };
  }
}

/**
 * Extract human-readable conversation title from the current page
 * Used for JSON/Markdown metadata so all formats share the same title.
 * Mirrors the logic used by PDFPrintService.getConversationTitle.
 */
function getConversationTitleForExport(): string {
  // Strategy 1: Get from active conversation in Gemini Voyager Folder UI (most accurate)
  try {
    const activeFolderTitle =
      document.querySelector(
        '.gv-folder-conversation.gv-folder-conversation-selected .gv-conversation-title',
      ) || document.querySelector('.gv-folder-conversation-selected .gv-conversation-title');

    if (activeFolderTitle?.textContent?.trim()) {
      return activeFolderTitle.textContent.trim();
    }
  } catch (error) {
    try {
      console.debug('[Export] Failed to get title from Folder Manager:', error);
    } catch {}
  }

  // Strategy 1b: Get from Gemini's native sidebar using the selected actions container
  try {
    const actionsContainer = document.querySelector('.conversation-actions-container.selected');
    if (actionsContainer && actionsContainer.previousElementSibling) {
      const convEl = actionsContainer.previousElementSibling as HTMLElement;
      const rawTitle = convEl.textContent || '';
      const title = rawTitle.trim();
      if (title) {
        return title;
      }
    }
  } catch (error) {
    try {
      console.debug(
        '[Export] Failed to get title from native sidebar selected conversation:',
        error,
      );
    } catch {}
  }

  // Strategy 2: Try to get from page title
  const titleElement = document.querySelector('title');
  if (titleElement) {
    const title = titleElement.textContent?.trim();
    if (
      title &&
      title !== 'Gemini' &&
      title !== 'Google Gemini' &&
      title !== 'Google AI Studio' &&
      !title.startsWith('Gemini -') &&
      !title.startsWith('Google AI Studio -') &&
      title.length > 0
    ) {
      return title;
    }
  }

  // Strategy 3: Try to get from sidebar conversation list (Gemini / AI Studio)
  try {
    const selectors = [
      'mat-list-item.mdc-list-item--activated [mat-line]',
      'mat-list-item[aria-current="page"] [mat-line]',
      '.conversation-list-item.active .conversation-title',
      '.active-conversation .title',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element?.textContent?.trim() && element.textContent.trim() !== 'New chat') {
        return element.textContent.trim();
      }
    }
  } catch (error) {
    try {
      console.debug('[Export] Failed to get title from sidebar:', error);
    } catch {}
  }

  return 'Untitled Conversation';
}

function normalizeLang(lang: string | undefined): AppLanguage {
  return normalizeLanguage(lang);
}

async function getLanguage(): Promise<AppLanguage> {
  try {
    // Add timeout to prevent hanging in Firefox
    const stored = await Promise.race([
      new Promise<unknown>((resolve) => {
        try {
          if ((window as any).chrome?.storage?.sync?.get) {
            (window as any).chrome.storage.sync.get(StorageKeys.LANGUAGE, resolve);
          } else if ((window as any).browser?.storage?.sync?.get) {
            (window as any).browser.storage.sync
              .get(StorageKeys.LANGUAGE)
              .then(resolve)
              .catch(() => resolve({}));
          } else {
            resolve({});
          }
        } catch {
          resolve({});
        }
      }),
      new Promise<unknown>((resolve) => setTimeout(() => resolve({}), 1000)),
    ]);
    const rec = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
    const v =
      typeof rec[StorageKeys.LANGUAGE] === 'string'
        ? (rec[StorageKeys.LANGUAGE] as string)
        : undefined;
    return normalizeLang(v || navigator.language || 'en');
  } catch {
    return 'en';
  }
}

/**
 * Finds the top-most user message element in the DOM.
 */
function getTopUserElement(): HTMLElement | null {
  const selectors = getUserSelectors();
  const all = document.querySelectorAll(selectors.join(','));
  if (!all.length) return null;
  const topLevel = filterTopLevel(Array.from(all));
  return topLevel.length > 0 ? topLevel[0] : null;
}

/**
 * Executes the export sequence:
 * 1. Find top node and click it.
 * 2. Wait to see if refresh happens.
 * 3. If refresh -> script dies, on load we resume.
 * 4. If no refresh -> we are stable, proceed to export.
 */
async function executeExportSequence(
  format: string,
  dict: Record<AppLanguage, Record<string, string>>,
  lang: AppLanguage,
  paramState?: PendingExportState,
): Promise<void> {
  const state: PendingExportState = paramState || {
    format,
    attempt: 0,
    url: location.href,
    status: 'clicking',
    timestamp: Date.now(),
  };

  if (state.attempt > 25) {
    console.warn('[Gemini Voyager] Export aborted: too many attempts.');
    sessionStorage.removeItem(SESSION_KEY_PENDING_EXPORT);
    alert('Export stopped: Too many attempts detected.');
    return;
  }

  // 1. Find Top Node
  if (state.attempt > 0) {
    console.log('[Gemini Voyager] Resuming export... waiting for content load.');
    const selectors = getUserSelectors();
    await waitForAnyElement(selectors, 15000);
  }

  // Wait a bit if we just reloaded
  let topNode = getTopUserElement();
  if (!topNode) {
    await waitForElement('body', 2000);
    const pairs = collectChatPairs();
    if (pairs.length > 0 && pairs[0].userElement) {
      topNode = pairs[0].userElement;
    }
  }

  if (!topNode) {
    console.log('[Gemini Voyager] No top node found, proceeding to export directly.');
    sessionStorage.removeItem(SESSION_KEY_PENDING_EXPORT);
    await performFinalExport(format as any, dict, lang);
    return;
  }

  const fingerprintSelectors = [...getUserSelectors(), ...getAssistantSelectors()];
  const beforeFingerprint = computeConversationFingerprint(document.body, fingerprintSelectors, 10);

  console.log(`[Gemini Voyager] Simulating click on top node (Attempt ${state.attempt + 1})...`);

  // Update state before action to persist across potential reload
  sessionStorage.setItem(
    SESSION_KEY_PENDING_EXPORT,
    JSON.stringify({ ...state, attempt: state.attempt + 1, timestamp: Date.now() }),
  );

  // Dispatch click logic
  try {
    topNode.scrollIntoView({ behavior: 'auto', block: 'center' });
    const opts = { bubbles: true, cancelable: true, view: window };
    topNode.dispatchEvent(new MouseEvent('mousedown', opts));
    topNode.dispatchEvent(new MouseEvent('mouseup', opts));
    topNode.click();
  } catch (e) {
    console.error('[Gemini Voyager] Failed to click top node:', e);
  }

  // 2. Wait for either hard refresh (page unload) OR a "soft refresh" that loads more history.
  // If the page unloads, the script stops and `checkPendingExport()` resumes on next load via sessionStorage.
  const { changed } = await waitForConversationFingerprintChangeOrTimeout(
    document.body,
    fingerprintSelectors,
    beforeFingerprint,
    { timeoutMs: 25000, idleMs: 550, pollIntervalMs: 90, maxSamples: 10 },
  );

  if (changed) {
    console.log('[Gemini Voyager] History expanded (soft refresh). Clicking top node again...');
    await executeExportSequence(format, dict, lang, {
      ...state,
      attempt: state.attempt + 1,
      timestamp: Date.now(),
    });
    return;
  }

  console.log('[Gemini Voyager] No refresh or update detected. Exporting...');
  sessionStorage.removeItem(SESSION_KEY_PENDING_EXPORT);
  await performFinalExport(format as any, dict, lang);
}

/**
 * Performs the actual file generation and download.
 */
async function performFinalExport(
  format: string,
  dict: Record<AppLanguage, Record<string, string>>,
  lang: AppLanguage,
) {
  const t = (key: TranslationKey) => dict[lang]?.[key] ?? dict.en?.[key] ?? key;

  // Re-collect data (DOM might have updated with new history)
  // We might need to wait for any final rendering?
  await new Promise((r) => setTimeout(r, 500));

  const pairs = collectChatPairs();
  const metadata: ConversationMetadata = {
    url: location.href,
    exportedAt: new Date().toISOString(),
    count: pairs.length,
    title: getConversationTitleForExport(),
  };

  try {
    const result = await ConversationExportService.export(pairs, metadata, {
      format: format as any,
    });

    if (result.success) {
      console.log(`[Gemini Voyager] Exported ${result.format} successfully`);
    } else {
      console.error(`[Gemini Voyager] Export failed: ${result.error}`);
      alert(`${t('export_dialog_warning')}: ${result.error}`);
    }
  } catch (err) {
    console.error('[Gemini Voyager] Export error:', err);
    alert('Export error occurred.');
  }
}

/**
 * Check if there is a pending export operation from a previous page load.
 */
async function checkPendingExport() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PENDING_EXPORT);
    if (!raw) return;

    const state = JSON.parse(raw) as PendingExportState;

    // Validate context
    if (state.url !== location.href) {
      // User navigated away? Abort.
      sessionStorage.removeItem(SESSION_KEY_PENDING_EXPORT);
      return;
    }

    // If state exists, it means we clicked and page refreshed.
    // So we resume the sequence.
    console.log('[Gemini Voyager] Resuming pending export sequence...');

    // We need i18n for final export/alert
    const dict = await loadDictionaries();
    const lang = await getLanguage();

    await executeExportSequence(state.format, dict, lang, state);
  } catch (e) {
    console.error('[Gemini Voyager] Failed to resume pending export:', e);
    sessionStorage.removeItem(SESSION_KEY_PENDING_EXPORT);
  }
}

export async function startExportButton(): Promise<void> {
  // Check for pending export immediately
  checkPendingExport();

  if (
    location.hostname !== 'gemini.google.com' &&
    location.hostname !== 'aistudio.google.com' &&
    location.hostname !== 'aistudio.google.cn'
  )
    return;
  const logo =
    (await waitForElement('[data-test-id="logo"]', 6000)) || (await waitForElement('.logo', 2000));
  if (!logo) return;
  const btn = ensureButtonInjected(logo);
  if (!btn) return;
  if ((btn as any)._gvBound) return;
  (btn as any)._gvBound = true;

  // Swallow events on the button to avoid parent navigation (logo click -> /app)
  const swallow = (e: Event) => {
    try {
      e.preventDefault();
    } catch {}
    try {
      e.stopPropagation();
    } catch {}
  };
  // Capture low-level press events to avoid parent logo navigation, but do NOT capture 'click'
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach((type) => {
    try {
      btn.addEventListener(type, swallow, true);
    } catch {}
  });

  // i18n setup for tooltip
  const dict = await loadDictionaries();
  let lang = await getLanguage();
  const t = (key: TranslationKey) => dict[lang]?.[key] ?? dict.en?.[key] ?? key;
  const title = t('exportChatJson');
  btn.title = title;
  btn.setAttribute('aria-label', title);

  // listen for runtime language changes
  const storageChangeHandler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'sync') return;
    const nextRaw = changes[StorageKeys.LANGUAGE]?.newValue;
    if (typeof nextRaw === 'string') {
      const next = normalizeLang(nextRaw);
      lang = next;
      const ttl =
        dict[next]?.['exportChatJson'] ??
        dict.en?.['exportChatJson'] ??
        'Export chat history (JSON)';
      btn.title = ttl;
      btn.setAttribute('aria-label', ttl);
    }
  };

  try {
    chrome.storage?.onChanged?.addListener(storageChangeHandler);

    // Cleanup listener on page unload to prevent memory leaks
    window.addEventListener(
      'beforeunload',
      () => {
        try {
          chrome.storage?.onChanged?.removeListener(storageChangeHandler);
        } catch (e) {
          console.error('[Gemini Voyager] Failed to remove storage listener on unload:', e);
        }
      },
      { once: true },
    );
  } catch {}

  btn.addEventListener('click', (ev) => {
    // Stop parent navigation, but allow this handler to run
    swallow(ev);
    try {
      // Show export dialog instead of directly exporting
      showExportDialog(dict, lang);
    } catch (err) {
      try {
        console.error('Gemini Voyager export failed', err);
      } catch {}
    }
  });
}

async function executeBatchExport(dict: Record<AppLanguage, Record<string, string>>): Promise<void> {
  const t = (key: TranslationKey) => dict['en']?.[key] ?? key;

  // Show confirmation dialog
  const confirmed = confirm(
    '⚠️ ' +
      (t('batch_export_confirm') ||
        'This will export all conversations. The process may take several minutes. Continue?'),
  );

  if (!confirmed) return;

  console.log('[Gemini Voyager] Starting batch export...');

  try {
    const result = await BatchExportService.exportAllConversations();

    console.log('[Gemini Voyager] Batch export completed:', result);

    // Show summary
    alert(
      `✅ Batch Export Complete\n\n` +
        `Total: ${result.total}\n` +
        `✓ Successful: ${result.successful}\n` +
        `✗ Failed: ${result.failed}\n\n` +
        `ZIP file has been downloaded.`,
    );
  } catch (error) {
    console.error('[Gemini Voyager] Batch export error:', error);
    alert('❌ Batch export failed: ' + (error instanceof Error ? error.message : String(error)));
  }
}

async function showExportDialog(
  dict: Record<AppLanguage, Record<string, string>>,
  lang: AppLanguage,
): Promise<void> {
  const t = (key: TranslationKey) => dict[lang]?.[key] ?? dict.en?.[key] ?? key;

  // We defer collection until after the export sequence (scrolling/refresh checks)

  const dialog = new ExportDialog();

  dialog.show({
    onExport: async (format) => {
      try {
        await executeExportSequence(format, dict, lang);
      } catch (err) {
        console.error('[Gemini Voyager] Export error:', err);
      }
    },

    onBatchExport: async () => {
      try {
        await executeBatchExport(dict);
      } catch (err) {
        console.error('[Gemini Voyager] Batch export error:', err);
      }
    },

    onCancel: () => {
      // Dialog closed
    },
    translations: {
      title: t('export_dialog_title'),
      selectFormat: t('export_dialog_select'),
      warning: t('export_dialog_warning'),
      cancel: t('pm_cancel'),
      export: t('pm_export'),
      batchExport: t('pm_batch_export') || 'Export All Conversations',
      batchExportDescription:
        t('batch_export_description') || 'Export all conversations as individual JSON files (ZIP)',
    },
  });
}

export default { startExportButton };

/**
 * Export conversation collection helper for batch export
 * BatchExportService uses this to ensure consistent data collection
 */
export const ConversationCollector = {
  collectCurrentPairs: (): ChatTurn[] => {
    return collectChatPairs();
  },

  /**
   * Trigger lazy loading by repeatedly clicking the top node
   * This mimics the single export logic to ensure complete history is loaded
   */
  triggerLazyLoad: async (): Promise<void> => {
    const root = getConversationRoot();
    const userSelectors = getUserSelectors();
    const allSelectors = [...userSelectors, ...getAssistantSelectors()];

    // Wait for user selectors to be present
    await waitForAnyElement(userSelectors, 5000);

    const userNodeList = root.querySelectorAll(userSelectors.join(','));
    if (!userNodeList || userNodeList.length === 0) return;

    let users = filterTopLevel(Array.from(userNodeList));
    if (users.length === 0) return;

    const topNode = users[0] as HTMLElement;

    // Recursively click top node until no more content loads (similar to executeExportSequence)
    await recursivelyLoadHistory(topNode, allSelectors, 0);

    // CRITICAL: Wait for DOM to fully stabilize after all clicks
    // This matches the behavior in performFinalExport
    console.log('[BatchExport] Waiting for DOM to stabilize after lazy loading...');
    await new Promise((r) => setTimeout(r, 500));
    console.log('[BatchExport] ✓ DOM stabilized, ready to collect');
  },
};

/**
 * Recursively click top node to load all historical messages
 * @param topNode - The first user message element
 * @param selectors - CSS selectors for fingerprint computation
 * @param attempt - Current attempt number (max 25)
 */
async function recursivelyLoadHistory(
  topNode: HTMLElement,
  selectors: string[],
  attempt: number,
): Promise<void> {
  if (attempt > 25) {
    console.warn('[BatchExport] Stopped after 25 attempts to prevent infinite loop');
    return;
  }

  const beforeFingerprint = computeConversationFingerprint(document.body, selectors, 10);

  console.log(`[BatchExport] Clicking top node (attempt ${attempt + 1}/25)...`);

  // Click the top node
  try {
    topNode.scrollIntoView({ behavior: 'auto', block: 'center' });
    const opts = { bubbles: true, cancelable: true, view: window };
    topNode.dispatchEvent(new MouseEvent('mousedown', opts));
    await new Promise((r) => setTimeout(r, 50));
    topNode.dispatchEvent(new MouseEvent('mouseup', opts));
    await new Promise((r) => setTimeout(r, 50));
    topNode.click();
  } catch (e) {
    console.error('[BatchExport] Failed to click top node:', e);
    return;
  }

  // Wait for content to load
  const { changed } = await waitForConversationFingerprintChangeOrTimeout(
    document.body,
    selectors,
    beforeFingerprint,
    { timeoutMs: 10000, idleMs: 550, pollIntervalMs: 90, maxSamples: 10, minWaitMs: 800 },
  );

  if (changed) {
    console.log('[BatchExport] ✓ Content expanded, clicking again...');
    // More content loaded, click again
    await recursivelyLoadHistory(topNode, selectors, attempt + 1);
  } else {
    console.log('[BatchExport] ✓ No more content to load, history complete');
  }
}
