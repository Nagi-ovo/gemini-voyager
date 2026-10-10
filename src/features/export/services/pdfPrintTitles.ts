import type { ConversationMetadata } from '../types/export';

/** Resolve cover and print-dialog names without exposing the page-title lookup protocol. */
export function resolvePDFPrintTitle(
  metadata: ConversationMetadata,
  mode: 'cover' | 'conversation',
): string {
  const platform = mode === 'cover' ? metadata.platform : metadata.platform || 'Gemini';
  const metadataTitle = normalizeConversationTitle(metadata.title, platform);
  const conversationTitle = normalizeConversationTitle(getConversationTitle(), platform);

  if (mode === 'cover') return metadataTitle || conversationTitle || 'Untitled Conversation';

  const base = metadataTitle || conversationTitle;
  if (!base) return `${platform} Conversation`;
  return `${base} - ${platform}`;
}

/**
 * Get conversation title from page
 */
function getConversationTitle(): string {
  // Strategy 1: Get from active conversation in Gemini Voyager Folder UI (most accurate)
  try {
    // Prefer the folder row that is marked as selected for the current conversation
    const activeFolderTitle =
      document.querySelector(
        '.gv-folder-conversation.gv-folder-conversation-selected .gv-conversation-title',
      ) || document.querySelector('.gv-folder-conversation-selected .gv-conversation-title');

    if (activeFolderTitle?.textContent?.trim()) {
      return activeFolderTitle.textContent.trim();
    }
  } catch (error) {
    console.debug('[PDF Export] Failed to get title from Folder Manager:', error);
  }

  // Strategy 1b: Get from Gemini native sidebar via current conversation ID
  try {
    const conversationId = extractConversationIdFromURL(window.location.href);
    if (conversationId) {
      const byId = resolveNativeSidebarTitle(conversationId);
      if (byId) return byId;
    }
  } catch (error) {
    console.debug('[PDF Export] Failed to get title from native sidebar by id:', error);
  }

  // Strategy 2: Try to get from page title
  const titleElement = document.querySelector('title');
  if (titleElement) {
    const title = titleElement.textContent?.trim();
    if (isMeaningfulConversationTitle(title)) {
      return title;
    }
  }

  // Strategy 3: Try to get from sidebar conversation list
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
    console.debug('[PDF Export] Failed to get title from sidebar:', error);
  }

  // Strategy 4: URL fallback
  const conversationId = extractConversationIdFromURL(window.location.href);
  if (conversationId) {
    return `Conversation ${conversationId.slice(0, 8)}`;
  }

  return 'Untitled Conversation';
}

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

function isGemLabel(text: string | null | undefined): boolean {
  const t = (text || '').trim().toLowerCase();
  return t === 'gem' || t === 'gems';
}

function extractConversationIdFromURL(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const appMatch = urlObj.pathname.match(/\/app\/([^/?#]+)/);
    if (appMatch?.[1]) return appMatch[1];
    const gemMatch = urlObj.pathname.match(/\/gem\/[^/]+\/([^/?#]+)/);
    if (gemMatch?.[1]) return gemMatch[1];
  } catch {
    /* ignore */
  }
  return null;
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

export function resolveNativeSidebarTitle(conversationId: string): string | null {
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

function normalizeConversationTitle(rawTitle: string | undefined, platform?: string): string {
  if (!rawTitle) return '';
  let normalized = rawTitle
    .trim()
    .replace(/\s+-\s+Gemini$/i, '')
    .replace(/\s+-\s+Google Gemini$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (platform && platform !== 'Gemini') {
    const escaped = platform.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalized = normalized.replace(new RegExp(`\\s+-\\s+${escaped}$`, 'i'), '').trim();
  }
  if (platform && normalized.toLocaleLowerCase() === platform.trim().toLocaleLowerCase()) {
    return '';
  }
  return isMeaningfulConversationTitle(normalized) ? normalized : '';
}

function escapeCssAttributeValue(value: string): string {
  const escape = globalThis.CSS?.escape;
  if (typeof escape === 'function') {
    return escape(value);
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
