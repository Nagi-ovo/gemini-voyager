/**
 * "Continue in ChatGPT / Claude": the background carries a research pack from
 * a Gemini tab to a new chat tab on another model's site.
 *
 * The pack never travels in a URL. When Voyager runs on the target site and
 * the browser has `storage.session`, the background opens the new chat and
 * keeps a one-shot record bound to that tab's id, with a short expiry.
 * Voyager's content script on that tab claims it once, only while the tab is
 * still on the new-chat page, and fills the empty composer without sending.
 * Otherwise the Gemini tab copies the pack inside the click and the
 * background only opens the new chat.
 *
 * Same shape as the ChatGPT temporary-chat handoff (one-shot, tab-bound,
 * alarm-backed expiry), but owned by the background: that handoff keys its
 * record by a sessionStorage token of the page that wrote it, which a page on
 * another origin cannot read.
 */

export type HandoffTarget = 'chatgpt' | 'claude';

export interface HandoffTargetInfo {
  readonly label: string;
  /** The new-chat page opened for the user. A constant: no query, no hash, no content. */
  readonly newChatUrl: string;
  /** The only path a pack may be claimed on; a tab that moved to a chat cannot take it. */
  readonly newChatPath: string;
  /** The optional host permission Voyager needs to run there. */
  readonly origin: string;
  readonly hosts: readonly string[];
}

export const HANDOFF_TARGETS: Readonly<Record<HandoffTarget, HandoffTargetInfo>> = {
  chatgpt: {
    label: 'ChatGPT',
    newChatUrl: 'https://chatgpt.com/',
    newChatPath: '/',
    origin: 'https://chatgpt.com/*',
    hosts: ['chatgpt.com'],
  },
  claude: {
    label: 'Claude',
    newChatUrl: 'https://claude.ai/new',
    newChatPath: '/new',
    origin: 'https://claude.ai/*',
    hosts: ['claude.ai'],
  },
};

export const HANDOFF_TARGET_IDS = Object.keys(HANDOFF_TARGETS) as readonly HandoffTarget[];

export const HANDOFF_TTL_MS = 60_000;
export const HANDOFF_STORAGE_PREFIX = 'gvResearchPackHandoff:';
export const HANDOFF_ALARM_PREFIX = 'gv-research-pack-handoff-expiry:';
/** Far above any pack the panel can hold; refuses a payload nobody should send. */
export const HANDOFF_MAX_MARKDOWN_CHARS = 2_000_000;

export const HANDOFF_MESSAGES = {
  status: 'gv.researchPack.handoff.status',
  open: 'gv.researchPack.handoff.open',
  peek: 'gv.researchPack.handoff.peek',
  claim: 'gv.researchPack.handoff.claim',
} as const;

export type HandoffMessage =
  | { readonly type: typeof HANDOFF_MESSAGES.status }
  /** With `markdown`, deliver it to the composer; without, only open the new chat. */
  | {
      readonly type: typeof HANDOFF_MESSAGES.open;
      readonly target: HandoffTarget;
      readonly markdown?: string;
    }
  | { readonly type: typeof HANDOFF_MESSAGES.peek }
  | { readonly type: typeof HANDOFF_MESSAGES.claim };

export type HandoffStatus = Readonly<Record<HandoffTarget, boolean>>;

export type HandoffOpenResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unavailable' | 'open_failed' | 'store_failed' };

export type HandoffClaimResult =
  | { readonly ok: true; readonly markdown: string }
  | { readonly ok: false };

export function isHandoffTarget(value: unknown): value is HandoffTarget {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(HANDOFF_TARGETS, value);
}

/** The target whose site this page belongs to, or null. Only https pages count. */
export function handoffTargetForUrl(url: string | undefined): HandoffTarget | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const host = parsed.hostname.toLowerCase();
  return HANDOFF_TARGET_IDS.find((target) => HANDOFF_TARGETS[target].hosts.includes(host)) ?? null;
}

/**
 * The target whose new-chat page this is, or null. The path must match exactly
 * (a trailing slash aside); a query or hash is tolerated, since both sites add
 * harmless ones to a new chat, and a prefilled composer is refused separately.
 */
export function handoffNewChatTargetForUrl(url: string | undefined): HandoffTarget | null {
  const target = handoffTargetForUrl(url);
  if (!target || !url) return null;
  const path = new URL(url).pathname.replace(/(.)\/+$/, '$1');
  return path === HANDOFF_TARGETS[target].newChatPath ? target : null;
}

export function parseHandoffMessage(message: unknown): HandoffMessage | null {
  if (!message || typeof message !== 'object') return null;
  const { type, target, markdown } = message as Record<string, unknown>;
  switch (type) {
    case HANDOFF_MESSAGES.status:
    case HANDOFF_MESSAGES.peek:
    case HANDOFF_MESSAGES.claim:
      return { type };
    case HANDOFF_MESSAGES.open:
      if (!isHandoffTarget(target)) return null;
      if (markdown === undefined) return { type, target };
      if (
        typeof markdown !== 'string' ||
        markdown.length === 0 ||
        markdown.length > HANDOFF_MAX_MARKDOWN_CHARS
      ) {
        return null;
      }
      return { type, target, markdown };
    default:
      return null;
  }
}

export function parseHandoffStatus(value: unknown): HandoffStatus {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return { chatgpt: record.chatgpt === true, claude: record.claude === true };
}

interface PendingHandoff {
  readonly target: HandoffTarget;
  readonly markdown: string;
  readonly tabId: number;
  readonly expiresAt: number;
}

function isPendingHandoff(value: unknown): value is PendingHandoff {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    isHandoffTarget(record.target) &&
    typeof record.markdown === 'string' &&
    typeof record.tabId === 'number' &&
    typeof record.expiresAt === 'number' &&
    Number.isFinite(record.expiresAt)
  );
}

export function handoffStorageKey(tabId: number): string {
  return `${HANDOFF_STORAGE_PREFIX}${tabId}`;
}

export function handoffAlarmName(tabId: number): string {
  return `${HANDOFF_ALARM_PREFIX}${tabId}`;
}

export function tabIdFromHandoffAlarm(name: string): number | null {
  if (!name.startsWith(HANDOFF_ALARM_PREFIX)) return null;
  const tabId = Number(name.slice(HANDOFF_ALARM_PREFIX.length));
  return isTabId(tabId) ? tabId : null;
}

export function isTabId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export interface HandoffStorageArea {
  get(keys: string | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** Where the new chat opens: next to the Gemini tab that asked for it. */
export interface HandoffOpener {
  readonly tabId?: number;
  readonly index?: number;
  readonly windowId?: number;
}

export interface HandoffBrokerDeps {
  /**
   * `storage.session`, or null where the browser lacks it. Without it nothing is
   * stored: every target reports "cannot run" and the click takes the clipboard
   * path, so the pack never reaches disk.
   */
  area: HandoffStorageArea | null;
  /** True only when Voyager's content script will run on the target's new chat page. */
  isReceiverReady: (target: HandoffTarget) => Promise<boolean>;
  /** Open `url` in a new tab and return its id. */
  openTab: (url: string, opener: HandoffOpener) => Promise<number | undefined>;
  scheduleExpiry: (tabId: number, when: number) => Promise<void> | void;
  clearExpiry: (tabId: number) => Promise<void> | void;
  now?: () => number;
}

export interface HandoffBroker {
  status(): Promise<HandoffStatus>;
  open(
    target: HandoffTarget,
    markdown: string | undefined,
    opener: HandoffOpener,
  ): Promise<HandoffOpenResult>;
  /** Whether a live handoff waits for this tab on this page. Does not consume it. */
  peek(tabId: number, pageUrl: string | undefined): Promise<boolean>;
  /** Hand the pack over once: the record is gone after this returns. */
  claim(tabId: number, pageUrl: string | undefined): Promise<HandoffClaimResult>;
  /** Drop the record for a closed tab. */
  discard(tabId: number): Promise<void>;
  /** Drop the record for `tabId` if it has expired (the expiry alarm fired). */
  expire(tabId: number): Promise<void>;
  /** Drop every expired or malformed record (service-worker start). */
  sweep(): Promise<void>;
}

export function createHandoffBroker(deps: HandoffBrokerDeps): HandoffBroker {
  const now = deps.now ?? Date.now;
  const area = deps.area;
  // One queue: a new tab's peek can arrive while its record is still being
  // written, and two claims from one tab must not both read it.
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const stored = async (tabId: number): Promise<unknown> => {
    if (!area) return undefined;
    const key = handoffStorageKey(tabId);
    return ((await area.get(key)) ?? {})[key];
  };

  const read = async (tabId: number): Promise<PendingHandoff | null> => {
    const value = await stored(tabId);
    return isPendingHandoff(value) && value.tabId === tabId ? value : null;
  };

  const drop = async (tabId: number): Promise<void> => {
    await area?.remove(handoffStorageKey(tabId));
    try {
      await deps.clearExpiry(tabId);
    } catch {
      // A stale alarm only removes a key that is already gone.
    }
  };

  /** The live record this page may take, or null. Expired or foreign records are dropped. */
  const live = async (
    tabId: number,
    pageUrl: string | undefined,
  ): Promise<PendingHandoff | null> => {
    const pending = await read(tabId);
    if (!pending) return null;
    if (pending.expiresAt <= now()) {
      await drop(tabId);
      return null;
    }
    return handoffNewChatTargetForUrl(pageUrl) === pending.target ? pending : null;
  };

  const readiness = async (target: HandoffTarget): Promise<boolean> => {
    if (!area) return false;
    try {
      return await deps.isReceiverReady(target);
    } catch {
      return false;
    }
  };

  return {
    async status() {
      const entries = await Promise.all(
        HANDOFF_TARGET_IDS.map(async (target) => [target, await readiness(target)] as const),
      );
      return parseHandoffStatus(Object.fromEntries(entries));
    },

    open(target, markdown, opener) {
      return serialize(async (): Promise<HandoffOpenResult> => {
        const { newChatUrl } = HANDOFF_TARGETS[target];
        if (markdown !== undefined && (!area || !(await readiness(target)))) {
          return { ok: false, reason: 'unavailable' };
        }
        let tabId: number | undefined;
        try {
          tabId = await deps.openTab(newChatUrl, opener);
        } catch {
          return { ok: false, reason: 'open_failed' };
        }
        if (markdown === undefined) return { ok: true };
        if (!isTabId(tabId) || !area) return { ok: false, reason: 'open_failed' };
        const expiresAt = now() + HANDOFF_TTL_MS;
        try {
          await area.set({
            [handoffStorageKey(tabId)]: {
              target,
              markdown,
              tabId,
              expiresAt,
            } satisfies PendingHandoff,
          });
        } catch {
          return { ok: false, reason: 'store_failed' };
        }
        try {
          await deps.scheduleExpiry(tabId, expiresAt);
        } catch {
          // A claim checks expiresAt itself; the alarm only cleans up an unclaimed record.
        }
        return { ok: true };
      });
    },

    peek(tabId, pageUrl) {
      return serialize(async () => (await live(tabId, pageUrl)) !== null);
    },

    claim(tabId, pageUrl) {
      return serialize(async (): Promise<HandoffClaimResult> => {
        const pending = await live(tabId, pageUrl);
        if (!pending) return { ok: false };
        await drop(tabId);
        return { ok: true, markdown: pending.markdown };
      });
    },

    discard(tabId) {
      return serialize(async () => {
        if ((await stored(tabId)) !== undefined) await drop(tabId);
      });
    },

    expire(tabId) {
      return serialize(async () => {
        const value = await stored(tabId);
        if (value === undefined) return;
        if (!isPendingHandoff(value) || value.expiresAt <= now()) {
          await drop(tabId);
          return;
        }
        await deps.scheduleExpiry(tabId, value.expiresAt);
      });
    },

    sweep() {
      return serialize(async () => {
        if (!area) return;
        const all = (await area.get(null)) ?? {};
        const stale = Object.entries(all)
          .filter(([key]) => key.startsWith(HANDOFF_STORAGE_PREFIX))
          .filter(([, value]) => !isPendingHandoff(value) || value.expiresAt <= now())
          .map(([key]) => key);
        if (stale.length > 0) await area.remove(stale);
      });
    },
  };
}
