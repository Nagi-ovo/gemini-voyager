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
        try { obs.disconnect(); } catch {}
        resolve(found);
      }
    });
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch {}
    if (timeoutMs > 0) setTimeout(() => { try { obs.disconnect(); } catch {}; resolve(null); }, timeoutMs);
  });
}

function normalizeText(text: string | null): string {
  try { return String(text || '').replace(/\s+/g, ' ').trim(); } catch { return ''; }
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
      if (other.contains(el)) { isDescendant = true; break; }
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
    try { return localStorage.getItem('geminiTimelineUserTurnSelector') || localStorage.getItem('geminiTimelineUserTurnSelectorAuto') || ''; } catch { return ''; }
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
    try { (asEl.dataset as any).turnId = id; } catch {}
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
  // Clone and remove reasoning toggles/labels before reading text
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
    if (role === 'button' && (/thinking|reasoning/i.test(txt) || /思路|推理/u.test(txt))) return true;
    if (/thinking|reasoning/i.test(aria) || /思路|推理/u.test(aria)) return true;
    return false;
  };
  try {
    const candidates = clone.querySelectorAll('button, [role="button"], [aria-label], span, div, a');
    candidates.forEach((n) => {
      const eln = n as HTMLElement;
      if (shouldDrop(eln)) eln.remove();
    });
  } catch {}
  const text = normalizeText((clone.innerText || clone.textContent || ''));
  return text;
}

type ChatTurn = { user: string; assistant: string; starred: boolean };

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
    let bestIdx = -1;
    let bestOff = Number.POSITIVE_INFINITY;
    for (let k = 0; k < assistants.length; k++) {
      const off = assistantOffsets[k];
      if (off >= start && off < end) {
        if (off < bestOff) { bestOff = off; bestIdx = k; }
      }
    }
    if (bestIdx >= 0) {
      const aEl = assistants[bestIdx] as HTMLElement;
      aText = extractAssistantText(aEl);
    } else {
      // Fallback: search next siblings up to a small window
      let sib: HTMLElement | null = uEl;
      for (let step = 0; step < 8 && sib; step++) {
        sib = (sib.nextElementSibling as HTMLElement | null);
        if (!sib) break;
        if (sib.matches(userSelectors.join(','))) break;
        if (sib.matches(assistantSelectors.join(','))) {
          aText = extractAssistantText(sib);
          break;
        }
      }
    }
    const turnId = ensureTurnId(uEl, i);
    const starred = !!turnId && starredSet.has(turnId);
    if (uText || aText) pairs.push({ user: uText, assistant: aText, starred });
  }
  return pairs;
}

function downloadJSON(data: any, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { try { document.body.removeChild(a); } catch {}; URL.revokeObjectURL(url); }, 0);
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
  if (!host || host.querySelector('.gv-export-btn')) return host.querySelector('.gv-export-btn') as HTMLButtonElement | null;
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

async function loadDictionaries(): Promise<Record<'en' | 'zh', Record<string, string>>> {
  try {
    const enRaw: any = await import(/* @vite-ignore */ '../../../locales/en/messages.json');
    const zhRaw: any = await import(/* @vite-ignore */ '../../../locales/zh/messages.json');
    const extract = (raw: any): Record<string, string> => {
      const out: Record<string, string> = {};
      if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach((k) => {
          const v = (raw as any)[k];
          if (v && typeof v.message === 'string') out[k] = v.message;
        });
      }
      return out;
    };
    return { en: extract(enRaw), zh: extract(zhRaw) } as any;
  } catch {
    return { en: {}, zh: {} } as any;
  }
}

function normalizeLang(lang: string | undefined): 'en' | 'zh' {
  return lang && lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

async function getLanguage(): Promise<'en' | 'zh'> {
  try {
    const stored = await new Promise<any>((resolve) => {
      try { (window as any).chrome?.storage?.sync?.get?.('language', resolve); } catch { resolve({}); }
    });
    const v = typeof stored?.language === 'string' ? stored.language : undefined;
    return normalizeLang(v || (navigator.language || 'en'));
  } catch {
    return 'en';
  }
}

export async function startExportButton(): Promise<void> {
  if (location.hostname !== 'gemini.google.com' && location.hostname !== 'aistudio.google.com') return;
  const logo =
    (await waitForElement('[data-test-id="logo"]', 6000)) ||
    (await waitForElement('.logo', 2000));
  if (!logo) return;
  const btn = ensureButtonInjected(logo);
  if (!btn) return;
  if ((btn as any)._gvBound) return;
  (btn as any)._gvBound = true;

  // i18n setup for tooltip
  const dict = await loadDictionaries();
  const lang = await getLanguage();
  const t = (key: string) => dict[lang]?.[key] ?? dict.en?.[key] ?? key;
  const title = t('exportChatJson');
  btn.title = title;
  btn.setAttribute('aria-label', title);

  // listen for runtime language changes
  try {
    chrome.storage?.onChanged?.addListener((changes: any, area: string) => {
      if (area !== 'sync') return;
      if (changes?.language) {
        const next = normalizeLang(changes.language.newValue);
        const ttl = (dict[next]?.['exportChatJson'] ?? dict.en?.['exportChatJson'] ?? 'Export chat history (JSON)');
        btn.title = ttl;
        btn.setAttribute('aria-label', ttl);
      }
    });
  } catch {}

  btn.addEventListener('click', () => {
    try {
      const pairs = collectChatPairs();
      const payload = buildExportPayload(pairs);
      downloadJSON(payload, formatFilename());
    } catch (err) {
      try { console.error('Gemini Voyager export failed', err); } catch {}
    }
  });
}

export default { startExportButton };


