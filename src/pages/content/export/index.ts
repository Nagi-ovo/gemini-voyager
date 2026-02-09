// Static imports to avoid CSP issues with dynamic imports in content scripts
import { StorageKeys } from '@/core/types/common';
import { isSafari } from '@/core/utils/browser';
import { type AppLanguage, normalizeLanguage } from '@/utils/language';
import { extractMessageDictionary } from '@/utils/localeMessages';
import type { TranslationKey } from '@/utils/translations';

import { ConversationExportService } from '../../../features/export/services/ConversationExportService';
import type {
  ConversationMetadata,
  ChatTurn as ExportChatTurn,
  ExportFormat,
} from '../../../features/export/types/export';
import { ExportDialog } from '../../../features/export/ui/ExportDialog';
import { resolveExportErrorMessage } from '../../../features/export/ui/ExportErrorMessage';
import { showExportToast } from '../../../features/export/ui/ExportToast';
import { groupSelectedMessagesByTurn } from './selectionUtils';
import {
  computeConversationFingerprint,
  waitForConversationFingerprintChangeOrTimeout,
} from './topNodePreload';

// Storage key to persist export state across reloads (e.g. when clicking top node triggers refresh)
const SESSION_KEY_PENDING_EXPORT = 'gv_export_pending';

interface PendingExportState {
  format: ExportFormat;
  fontSize?: number;
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

function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'json' || value === 'markdown' || value === 'pdf' || value === 'image';
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

type ChatTurn = {
  turnId: string;
  user: string;
  assistant: string;
  starred: boolean;
  userElement?: HTMLElement;
  assistantElement?: HTMLElement;
  assistantHostElement?: HTMLElement;
};

function collectChatPairs(): ChatTurn[] {
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
        turnId,
        user: uText,
        assistant: aText,
        starred,
        userElement: uEl,
        assistantElement: finalAssistantEl,
        assistantHostElement: aEl || undefined,
      });
    }
  }
  return pairs;
}

type ExportMessageRole = 'user' | 'assistant';

type ExportMessage = {
  messageId: string;
  role: ExportMessageRole;
  hostElement: HTMLElement;
  exportElement?: HTMLElement;
  text: string;
  starred: boolean;
};

function buildExportMessagesFromPairs(pairs: ChatTurn[]): ExportMessage[] {
  const out: ExportMessage[] = [];
  pairs.forEach((pair) => {
    if (pair.userElement) {
      out.push({
        messageId: `${pair.turnId}:u`,
        role: 'user',
        hostElement: pair.userElement,
        exportElement: pair.userElement,
        text: pair.user,
        starred: pair.starred,
      });
    }

    const assistantHost = pair.assistantHostElement;
    if (assistantHost) {
      out.push({
        messageId: `${pair.turnId}:a`,
        role: 'assistant',
        hostElement: assistantHost,
        exportElement: pair.assistantElement || assistantHost,
        text: pair.assistant,
        starred: pair.starred,
      });
    }
  });
  return out;
}

function ensureDropdownInjected(logoElement: Element): HTMLButtonElement | null {
  // Check if already injected
  const existingWrapper = document.querySelector('.gv-logo-dropdown-wrapper');
  if (existingWrapper) {
    return existingWrapper.querySelector('.gv-export-dropdown-btn') as HTMLButtonElement | null;
  }

  const logo = logoElement as HTMLElement;
  const parent = logo.parentElement;
  if (!parent) return null;

  // Create wrapper that will contain both logo and dropdown
  const wrapper = document.createElement('div');
  wrapper.className = 'gv-logo-dropdown-wrapper';

  // Move logo into wrapper
  parent.insertBefore(wrapper, logo);
  wrapper.appendChild(logo);

  // Create dropdown container
  const dropdown = document.createElement('div');
  dropdown.className = 'gv-logo-dropdown';

  // Create export button inside dropdown
  const btn = document.createElement('button');
  btn.className = 'gv-export-dropdown-btn';
  btn.type = 'button';
  btn.title = 'Export chat history';
  btn.setAttribute('aria-label', 'Export chat history');

  // Export icon
  const iconSpan = document.createElement('span');
  iconSpan.className = 'gv-export-dropdown-icon';
  btn.appendChild(iconSpan);

  // Export text label
  const labelSpan = document.createElement('span');
  labelSpan.className = 'gv-export-dropdown-label';
  labelSpan.textContent = 'Export';
  btn.appendChild(labelSpan);

  dropdown.appendChild(btn);
  wrapper.appendChild(dropdown);

  return btn;
}

async function loadDictionaries(): Promise<Record<AppLanguage, Record<string, string>>> {
  try {
    const [enRaw, zhRaw, zhTWRaw, jaRaw, frRaw, esRaw, ptRaw, arRaw, ruRaw, koRaw] =
      await Promise.all([
        import(/* @vite-ignore */ '../../../locales/en/messages.json'),
        import(/* @vite-ignore */ '../../../locales/zh/messages.json'),
        import(/* @vite-ignore */ '../../../locales/zh_TW/messages.json'),
        import(/* @vite-ignore */ '../../../locales/ja/messages.json'),
        import(/* @vite-ignore */ '../../../locales/fr/messages.json'),
        import(/* @vite-ignore */ '../../../locales/es/messages.json'),
        import(/* @vite-ignore */ '../../../locales/pt/messages.json'),
        import(/* @vite-ignore */ '../../../locales/ar/messages.json'),
        import(/* @vite-ignore */ '../../../locales/ru/messages.json'),
        import(/* @vite-ignore */ '../../../locales/ko/messages.json'),
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
      ko: extractMessageDictionary(koRaw),
    };
  } catch {
    return {
      en: {},
      zh: {},
      zh_TW: {},
      ja: {},
      fr: {},
      es: {},
      pt: {},
      ar: {},
      ru: {},
      ko: {},
    };
  }
}

/**
 * Extract human-readable conversation title from the current page
 * Used for JSON/Markdown metadata so all formats share the same title.
 * Mirrors the logic used by PDFPrintService.getConversationTitle.
 */
function isMeaningfulConversationTitle(title: string | null | undefined): title is string {
  const t = (title || '').trim();
  if (!t) return false;
  if (
    t === 'Untitled Conversation' ||
    t === 'Gemini' ||
    t === 'Google Gemini' ||
    t === 'Google AI Studio' ||
    t === 'New chat'
  ) {
    return false;
  }
  if (t.startsWith('Gemini -') || t.startsWith('Google AI Studio -')) return false;
  return true;
}

function extractConversationIdFromUrl(): string | null {
  const appMatch = window.location.pathname.match(/\/app\/([^/?#]+)/);
  if (appMatch?.[1]) return appMatch[1];
  const gemMatch = window.location.pathname.match(/\/gem\/[^/]+\/([^/?#]+)/);
  if (gemMatch?.[1]) return gemMatch[1];
  return null;
}

function isGemLabel(text: string | null | undefined): boolean {
  const t = (text || '').trim().toLowerCase();
  return t === 'gem' || t === 'gems';
}

function extractTitleFromLinkText(link?: HTMLAnchorElement | null): string | null {
  if (!link) return null;
  const text = (link.innerText || '').trim();
  if (!text) return null;
  const parts = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !isGemLabel(s))
    .filter((s) => s.length >= 2);
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => (b.length > a.length ? b : a), parts[0]) || null;
}

function extractTitleFromConversationElement(conversationEl: HTMLElement): string | null {
  const scope =
    (conversationEl.closest('[data-test-id="conversation"]') as HTMLElement) || conversationEl;
  const bySelector = scope.querySelector(
    '.gds-label-l, .conversation-title-text, [data-test-id="conversation-title"], h3',
  );
  const selectorTitle = bySelector?.textContent?.trim();
  if (isMeaningfulConversationTitle(selectorTitle) && !isGemLabel(selectorTitle)) {
    return selectorTitle;
  }

  const link = scope.querySelector(
    'a[href*="/app/"], a[href*="/gem/"]',
  ) as HTMLAnchorElement | null;
  const ariaTitle = link?.getAttribute('aria-label')?.trim();
  if (isMeaningfulConversationTitle(ariaTitle) && !isGemLabel(ariaTitle)) {
    return ariaTitle;
  }
  const linkTitle = link?.getAttribute('title')?.trim();
  if (isMeaningfulConversationTitle(linkTitle) && !isGemLabel(linkTitle)) {
    return linkTitle;
  }
  const fromLinkText = extractTitleFromLinkText(link);
  if (isMeaningfulConversationTitle(fromLinkText)) {
    return fromLinkText;
  }

  const label = scope.querySelector('.gds-body-m, .gds-label-m, .subtitle');
  const labelText = label?.textContent?.trim();
  if (isMeaningfulConversationTitle(labelText) && !isGemLabel(labelText)) {
    return labelText;
  }

  const raw = scope.textContent?.trim() || '';
  if (!raw) return null;
  const firstLine =
    raw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)[0] || raw;
  if (isMeaningfulConversationTitle(firstLine) && !isGemLabel(firstLine)) {
    return firstLine.slice(0, 80);
  }

  return null;
}

function extractTitleFromNativeSidebarByConversationId(conversationId: string): string | null {
  const escapedConversationId = escapeCssAttributeValue(conversationId);
  const byJslog = document.querySelector(
    `[data-test-id="conversation"][jslog*="c_${escapedConversationId}"]`,
  ) as HTMLElement | null;
  if (byJslog) {
    const title = extractTitleFromConversationElement(byJslog);
    if (title) return title;
  }

  const byHrefLink = document.querySelector(
    `[data-test-id="conversation"] a[href*="${escapedConversationId}"]`,
  ) as HTMLElement | null;
  if (byHrefLink) {
    const title = extractTitleFromConversationElement(byHrefLink);
    if (title) return title;
  }

  return null;
}

function escapeCssAttributeValue(value: string): string {
  const escape = globalThis.CSS?.escape;
  if (typeof escape === 'function') {
    return escape(value);
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

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

  // Strategy 1b: Get from Gemini native sidebar via current conversation ID
  try {
    const conversationId = extractConversationIdFromUrl();
    if (conversationId) {
      const title = extractTitleFromNativeSidebarByConversationId(conversationId);
      if (title) return title;
    }
  } catch (error) {
    try {
      console.debug('[Export] Failed to get title from native sidebar by conversation id:', error);
    } catch {}
  }

  // Strategy 2: Try to get from page title
  const titleElement = document.querySelector('title');
  if (titleElement) {
    const title = titleElement.textContent?.trim();
    if (isMeaningfulConversationTitle(title)) {
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
      const title = element?.textContent?.trim();
      if (isMeaningfulConversationTitle(title)) {
        return title;
      }
    }
  } catch (error) {
    try {
      console.debug('[Export] Failed to get title from sidebar:', error);
    } catch {}
  }

  // Strategy 4: URL fallback
  const conversationId = extractConversationIdFromUrl();
  if (conversationId) {
    return `Conversation ${conversationId.slice(0, 8)}`;
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
  format: ExportFormat,
  dict: Record<AppLanguage, Record<string, string>>,
  lang: AppLanguage,
  paramState?: PendingExportState,
  fontSize?: number,
): Promise<void> {
  const state: PendingExportState = paramState || {
    format,
    fontSize,
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
    await performFinalExport(format, dict, lang, state.fontSize);
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
    { timeoutMs: 25000, minWaitMs: 1600, idleMs: 650, pollIntervalMs: 90, maxSamples: 10 },
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
  await performFinalExport(format, dict, lang, state.fontSize);
}

/**
 * Performs the actual file generation and download.
 */
async function performFinalExport(
  format: ExportFormat,
  dict: Record<AppLanguage, Record<string, string>>,
  lang: AppLanguage,
  fontSize?: number,
) {
  const t = (key: TranslationKey) => dict[lang]?.[key] ?? dict.en?.[key] ?? key;

  await new Promise((r) => setTimeout(r, 400));

  const pairs = collectChatPairs();
  const messages = buildExportMessagesFromPairs(pairs);
  if (messages.length === 0) {
    alert(t('export_dialog_warning'));
    return;
  }

  const selectedIds = new Set<string>();
  let allMessageIds: string[] = [];
  const cleanupTasks: Array<() => void> = [];
  const idToHost = new Map<string, HTMLElement>();
  const idToCheckbox = new Map<string, HTMLButtonElement>();
  const knownIds = new Set<string>();

  let autoSelectAll = false;

  const cleanup = () => {
    cleanupTasks.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    cleanupTasks.length = 0;
  };

  const setSelected = (id: string, next: boolean) => {
    if (next) selectedIds.add(id);
    else selectedIds.delete(id);

    const btn = idToCheckbox.get(id);
    if (btn) {
      btn.setAttribute('aria-pressed', next ? 'true' : 'false');
      btn.dataset.selected = next ? 'true' : 'false';
    }
    const host = idToHost.get(id);
    if (host) {
      if (next) host.classList.add('gv-export-msg-selected');
      else host.classList.remove('gv-export-msg-selected');
    }
  };

  const updateBottomBar = (bar: HTMLElement) => {
    const countEl = bar.querySelector(
      '[data-gv-export-selection-count="true"]',
    ) as HTMLElement | null;
    if (countEl) {
      countEl.textContent = t('export_select_mode_count').replace(
        '{count}',
        String(selectedIds.size),
      );
    }

    const exportBtn = bar.querySelector(
      '[data-gv-export-action="export"]',
    ) as HTMLButtonElement | null;
    if (exportBtn) {
      exportBtn.disabled = selectedIds.size === 0;
    }

    const selectAllBtn = bar.querySelector(
      '[data-gv-export-action="selectAll"]',
    ) as HTMLButtonElement | null;
    if (selectAllBtn) {
      const isAllSelected = allMessageIds.length > 0 && selectedIds.size === allMessageIds.length;
      selectAllBtn.dataset.checked = isAllSelected ? 'true' : 'false';
    }
  };

  const attachSelectorIfNeeded = (msg: ExportMessage) => {
    if (knownIds.has(msg.messageId)) return;
    knownIds.add(msg.messageId);

    const host = msg.hostElement;
    idToHost.set(msg.messageId, host);
    host.classList.add('gv-export-msg-host');
    cleanupTasks.push(() => host.classList.remove('gv-export-msg-host'));

    const selector = document.createElement('div');
    selector.className = 'gv-export-msg-selector';
    selector.dataset.gvExportMessageId = msg.messageId;

    const checkbox = document.createElement('button');
    checkbox.type = 'button';
    checkbox.className = 'gv-export-msg-checkbox';
    checkbox.setAttribute('aria-pressed', 'false');
    checkbox.title = t('export_select_mode_toggle');

    const mark = document.createElement('span');
    mark.className = 'gv-export-msg-checkbox-mark';
    checkbox.appendChild(mark);

    const swallow = (ev: Event) => {
      try {
        ev.preventDefault();
      } catch {}
      try {
        ev.stopPropagation();
      } catch {}
    };

    checkbox.addEventListener('click', (ev) => {
      swallow(ev);
      autoSelectAll = false;
      const next = !selectedIds.has(msg.messageId);
      setSelected(msg.messageId, next);
      const bar = document.querySelector(
        '[data-gv-export-select-bar="true"]',
      ) as HTMLElement | null;
      if (bar) updateBottomBar(bar);
    });

    selector.appendChild(checkbox);
    host.appendChild(selector);
    cleanupTasks.push(() => selector.remove());

    idToCheckbox.set(msg.messageId, checkbox);
  };

  const computeSortedMessages = (
    pairsInput: ChatTurn[],
  ): Array<ExportMessage & { absTop: number }> => {
    const msgs = buildExportMessagesFromPairs(pairsInput);
    const withPos = msgs.map((m) => {
      const rect = m.hostElement.getBoundingClientRect();
      const absTop = rect.top + window.scrollY;
      return { ...m, absTop };
    });
    withPos.sort((a, b) => a.absTop - b.absTop);
    return withPos;
  };

  const syncMessages = (pairsInput: ChatTurn[]) => {
    const sorted = computeSortedMessages(pairsInput);
    allMessageIds = sorted.map((m) => m.messageId);

    sorted.forEach((m) => attachSelectorIfNeeded(m));

    // Auto-select new messages when a policy is active.
    if (autoSelectAll) {
      for (const id of allMessageIds) setSelected(id, true);
    }
  };

  // Selection mode body class
  document.body.classList.add('gv-export-select-mode');
  cleanupTasks.push(() => document.body.classList.remove('gv-export-select-mode'));

  // Bottom action bar
  const bar = document.createElement('div');
  bar.className = 'gv-export-select-bar';
  bar.dataset.gvExportSelectBar = 'true';

  const selectAllBtn = document.createElement('button');
  selectAllBtn.type = 'button';
  selectAllBtn.className = 'gv-export-select-all-toggle';
  selectAllBtn.dataset.gvExportAction = 'selectAll';
  selectAllBtn.textContent = t('export_select_mode_select_all');

  const count = document.createElement('div');
  count.className = 'gv-export-select-count';
  count.dataset.gvExportSelectionCount = 'true';
  count.textContent = t('export_select_mode_count').replace('{count}', '0');

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'gv-export-select-export-btn';
  exportBtn.dataset.gvExportAction = 'export';
  exportBtn.textContent = t('pm_export');
  exportBtn.disabled = true;

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'gv-export-select-cancel-btn';
  cancelBtn.title = t('pm_cancel');
  cancelBtn.textContent = '×';

  bar.appendChild(selectAllBtn);
  bar.appendChild(count);
  bar.appendChild(exportBtn);
  bar.appendChild(cancelBtn);

  document.body.appendChild(bar);
  cleanupTasks.push(() => bar.remove());

  const swallow = (ev: Event) => {
    try {
      ev.preventDefault();
    } catch {}
    try {
      ev.stopPropagation();
    } catch {}
  };

  selectAllBtn.addEventListener('click', (ev) => {
    swallow(ev);
    const isAllSelected = allMessageIds.length > 0 && selectedIds.size === allMessageIds.length;
    if (isAllSelected) {
      selectedIds.clear();
      autoSelectAll = false;
      allMessageIds.forEach((id) => setSelected(id, false));
    } else {
      selectedIds.clear();
      autoSelectAll = true;
      allMessageIds.forEach((id) => setSelected(id, true));
    }
    updateBottomBar(bar);
  });

  const finish = () => {
    allMessageIds.forEach((id) => setSelected(id, false));
    selectedIds.clear();
    autoSelectAll = false;
    cleanup();
  };

  cancelBtn.addEventListener('click', (ev) => {
    swallow(ev);
    finish();
  });

  exportBtn.addEventListener('click', async (ev) => {
    swallow(ev);
    if (selectedIds.size === 0) {
      alert(t('export_select_mode_empty'));
      return;
    }

    // Recompute order just-in-time and build a "half-turns" list for export.
    const latestPairs = collectChatPairs();
    const sorted = computeSortedMessages(latestPairs);
    const selectedMessages = sorted.filter((m) => selectedIds.has(m.messageId));

    const groupedTurns = groupSelectedMessagesByTurn(selectedMessages);
    const turnsForExport: ExportChatTurn[] = groupedTurns
      .map((turn) => ({
        user: turn.user?.text || '',
        assistant: turn.assistant?.text || '',
        starred: turn.starred,
        omitEmptySections: true,
        userElement: turn.user?.exportElement,
        assistantElement: turn.assistant?.exportElement,
      }))
      .filter(
        (turn) =>
          turn.user.length > 0 ||
          turn.assistant.length > 0 ||
          !!turn.userElement ||
          !!turn.assistantElement,
      );

    // Cleanup before export so selection UI isn't captured.
    finish();

    const metadata: ConversationMetadata = {
      url: location.href,
      exportedAt: new Date().toISOString(),
      count: turnsForExport.length,
      title: getConversationTitleForExport(),
    };

    const hideProgress = showExportProgressOverlay(t);
    try {
      const resultPromise = ConversationExportService.export(turnsForExport, metadata, {
        format,
        fontSize,
      });
      const minVisiblePromise = new Promise((resolve) => setTimeout(resolve, 420));
      const [result] = await Promise.all([resultPromise, minVisiblePromise]);

      if (!result.success) {
        alert(resolveExportErrorMessage(result.error, t));
      } else if (format === 'pdf' && isSafari()) {
        showExportToast(t('export_toast_safari_pdf_ready'), { autoDismissMs: 5000 });
      }
    } catch (err) {
      console.error('[Gemini Voyager] Export error:', err);
      alert('Export error occurred.');
    } finally {
      hideProgress();
    }
  });

  // Observe new lazy-loaded messages while selection mode is active.
  const root = getConversationRoot();
  let refreshTimer: number | null = null;
  const scheduleRefresh = () => {
    if (refreshTimer) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      try {
        syncMessages(collectChatPairs());
        updateBottomBar(bar);
      } catch {}
    }, 250);
  };

  const obs = new MutationObserver(() => scheduleRefresh());
  try {
    obs.observe(root, { childList: true, subtree: true });
    cleanupTasks.push(() => obs.disconnect());
  } catch {}

  // Escape to cancel
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      finish();
      document.removeEventListener('keydown', onKeyDown);
    }
  };
  document.addEventListener('keydown', onKeyDown);
  cleanupTasks.push(() => document.removeEventListener('keydown', onKeyDown));

  // Initial sync
  syncMessages(pairs);
  updateBottomBar(bar);
}

function showExportProgressOverlay(t: (key: TranslationKey) => string): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'gv-export-progress-overlay';

  const card = document.createElement('div');
  card.className = 'gv-export-progress-card';

  const spinner = document.createElement('div');
  spinner.className = 'gv-export-progress-spinner';

  const title = document.createElement('div');
  title.className = 'gv-export-progress-title';
  title.textContent = `${t('pm_export')}...`;

  const desc = document.createElement('div');
  desc.className = 'gv-export-progress-desc';
  desc.textContent = t('loading');

  card.appendChild(spinner);
  card.appendChild(title);
  card.appendChild(desc);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  return () => {
    try {
      overlay.remove();
    } catch {}
  };
}

/**
 * Check if there is a pending export operation from a previous page load.
 */
async function checkPendingExport() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PENDING_EXPORT);
    if (!raw) return;

    const parsed = JSON.parse(raw) as Partial<PendingExportState>;
    if (
      !isExportFormat(parsed.format) ||
      typeof parsed.attempt !== 'number' ||
      typeof parsed.url !== 'string' ||
      parsed.status !== 'clicking' ||
      typeof parsed.timestamp !== 'number'
    ) {
      sessionStorage.removeItem(SESSION_KEY_PENDING_EXPORT);
      return;
    }
    const state: PendingExportState = {
      format: parsed.format,
      fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : undefined,
      attempt: parsed.attempt,
      url: parsed.url,
      status: parsed.status,
      timestamp: parsed.timestamp,
    };

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
  const btn = ensureDropdownInjected(logo);
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

  // i18n setup for tooltip and label
  const dict = await loadDictionaries();
  let lang = await getLanguage();
  const t = (key: TranslationKey) => dict[lang]?.[key] ?? dict.en?.[key] ?? key;
  const title = t('exportChatJson');
  const labelText = t('pm_export');
  btn.title = title;
  btn.setAttribute('aria-label', title);

  // Update label text
  const labelEl = btn.querySelector('.gv-export-dropdown-label');
  if (labelEl) labelEl.textContent = labelText;

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
        dict[next]?.['exportChatJson'] ?? dict.en?.['exportChatJson'] ?? 'Export chat history';
      btn.title = ttl;
      btn.setAttribute('aria-label', ttl);

      // Update visible label text
      const lbl = btn.querySelector('.gv-export-dropdown-label');
      if (lbl) lbl.textContent = dict[next]?.['pm_export'] ?? dict.en?.['pm_export'] ?? 'Export';
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

async function showExportDialog(
  dict: Record<AppLanguage, Record<string, string>>,
  lang: AppLanguage,
): Promise<void> {
  const t = (key: TranslationKey) => dict[lang]?.[key] ?? dict.en?.[key] ?? key;

  // We defer collection until after the export sequence (scrolling/refresh checks)

  const dialog = new ExportDialog();

  dialog.show({
    onExport: async (format, fontSize) => {
      try {
        await executeExportSequence(format, dict, lang, undefined, fontSize);
      } catch (err) {
        console.error('[Gemini Voyager] Export error:', err);
      }
    },

    onCancel: () => {
      // Dialog closed
    },
    translations: {
      title: t('export_dialog_title'),
      selectFormat: t('export_dialog_select'),
      warning: t('export_dialog_warning'),
      safariCmdpHint: t('export_dialog_safari_cmdp_hint'),
      safariMarkdownHint: t('export_dialog_safari_markdown_hint'),
      cancel: t('pm_cancel'),
      export: t('pm_export'),
      fontSizeLabel: t('export_fontsize_label'),
      fontSizePreview: t('export_fontsize_preview'),
      formatDescriptions: {
        json: t('export_format_json_description'),
        markdown: t('export_format_markdown_description'),
        pdf: t('export_format_pdf_description'),
        image: t('export_format_image_description'),
      },
    },
  });
}

export default { startExportButton };
