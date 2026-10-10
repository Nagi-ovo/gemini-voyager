import { describe, expect, it, vi } from 'vitest';

import {
  HANDOFF_MAX_MARKDOWN_CHARS,
  HANDOFF_MESSAGES,
  HANDOFF_STORAGE_PREFIX,
  HANDOFF_TARGETS,
  HANDOFF_TARGET_IDS,
  HANDOFF_TTL_MS,
  type HandoffBrokerDeps,
  type HandoffOpener,
  type HandoffTarget,
  createHandoffBroker,
  handoffNewChatTargetForUrl,
  handoffStorageKey,
  handoffTargetForUrl,
  parseHandoffMessage,
  tabIdFromHandoffAlarm,
  handoffAlarmName,
} from '../handoff';

const CHATGPT_PAGE = 'https://chatgpt.com/';
const CLAUDE_PAGE = 'https://claude.ai/new';
const PACK = '# Research pack\n\nSecret findings about Rayleigh scattering.';
const GEMINI_TAB = { tabId: 7, index: 2, windowId: 1 };

function setup(options: { ready?: Partial<Record<HandoffTarget, boolean>>; tabId?: number } = {}) {
  let clock = 1_000_000;
  const data = new Map<string, unknown>();
  const area = {
    get: vi.fn(async (key: string | null) =>
      key === null
        ? Object.fromEntries(data)
        : data.has(key)
          ? { [key]: structuredClone(data.get(key)) }
          : {},
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value));
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) data.delete(key);
    }),
  };
  let nextTabId = options.tabId ?? 42;
  const deps = {
    area,
    isReceiverReady: vi.fn(async (target: HandoffTarget) => options.ready?.[target] ?? true),
    openTab: vi.fn(async (_url: string, _opener: HandoffOpener) => nextTabId++),
    scheduleExpiry: vi.fn(),
    clearExpiry: vi.fn(),
    now: () => clock,
  } satisfies HandoffBrokerDeps;
  const broker = createHandoffBroker(deps);
  return {
    broker,
    deps,
    data,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('research pack handoff broker', () => {
  it('opens the new chat at a constant URL that carries none of the pack', async () => {
    for (const target of HANDOFF_TARGET_IDS) {
      const { broker, deps } = setup();
      await expect(broker.open(target, PACK, GEMINI_TAB)).resolves.toEqual({ ok: true });
      const [url, opener] = deps.openTab.mock.calls[0];
      expect(url).toBe(HANDOFF_TARGETS[target].newChatUrl);
      const parsed = new URL(url);
      expect(parsed.search).toBe('');
      expect(parsed.hash).toBe('');
      expect(url).not.toContain('Rayleigh');
      expect(opener).toEqual(GEMINI_TAB);
    }
  });

  it('hands the pack to its tab once, then forgets it', async () => {
    const { broker, deps, data } = setup();
    await broker.open('chatgpt', PACK, GEMINI_TAB);

    await expect(broker.peek(42, CHATGPT_PAGE)).resolves.toBe(true);
    await expect(broker.claim(42, CHATGPT_PAGE)).resolves.toEqual({ ok: true, markdown: PACK });
    await expect(broker.claim(42, CHATGPT_PAGE)).resolves.toEqual({ ok: false });
    await expect(broker.peek(42, CHATGPT_PAGE)).resolves.toBe(false);
    expect([...data.keys()]).toEqual([]);
    expect(deps.clearExpiry).toHaveBeenCalledWith(42);
  });

  it('gives each of two racing claims from one tab a different answer', async () => {
    const { broker } = setup();
    await broker.open('claude', PACK, GEMINI_TAB);

    const results = await Promise.all([
      broker.claim(42, CLAUDE_PAGE),
      broker.claim(42, CLAUDE_PAGE),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  it('expires: an unclaimed pack is gone after the TTL, whether claimed late or swept by the alarm', async () => {
    const { broker, deps, data, advance } = setup();
    await broker.open('chatgpt', PACK, GEMINI_TAB);
    expect(deps.scheduleExpiry).toHaveBeenCalledWith(42, 1_000_000 + HANDOFF_TTL_MS);

    advance(HANDOFF_TTL_MS);
    await expect(broker.peek(42, CHATGPT_PAGE)).resolves.toBe(false);
    await expect(broker.claim(42, CHATGPT_PAGE)).resolves.toEqual({ ok: false });
    expect(data.size).toBe(0);

    await broker.open('chatgpt', PACK, GEMINI_TAB);
    advance(HANDOFF_TTL_MS + 1);
    await broker.expire(43);
    expect(data.size).toBe(0);
  });

  it('keeps a pack whose alarm fired early and schedules it again', async () => {
    const { broker, deps, data, advance } = setup();
    await broker.open('chatgpt', PACK, GEMINI_TAB);
    advance(HANDOFF_TTL_MS / 2);

    await broker.expire(42);
    expect(data.has(handoffStorageKey(42))).toBe(true);
    expect(deps.scheduleExpiry).toHaveBeenLastCalledWith(42, 1_000_000 + HANDOFF_TTL_MS);
  });

  it('is bound to the opened tab and its site', async () => {
    const { broker, data } = setup();
    await broker.open('chatgpt', PACK, GEMINI_TAB);

    await expect(broker.peek(99, CHATGPT_PAGE)).resolves.toBe(false);
    await expect(broker.claim(99, CHATGPT_PAGE)).resolves.toEqual({ ok: false });
    // The right tab on another site (or a login page) cannot take it either.
    await expect(broker.claim(42, CLAUDE_PAGE)).resolves.toEqual({ ok: false });
    await expect(broker.claim(42, 'https://auth.openai.com/log-in')).resolves.toEqual({
      ok: false,
    });
    expect(data.has(handoffStorageKey(42))).toBe(true);

    await expect(broker.claim(42, CHATGPT_PAGE)).resolves.toEqual({ ok: true, markdown: PACK });
  });

  it('cannot be taken once its tab has left the new-chat page', async () => {
    const { broker, data } = setup();
    await broker.open('chatgpt', PACK, GEMINI_TAB);
    await broker.open('claude', PACK, GEMINI_TAB);

    for (const page of ['https://chatgpt.com/c/other', 'https://chatgpt.com/g/g-p-1/project']) {
      await expect(broker.peek(42, page)).resolves.toBe(false);
      await expect(broker.claim(42, page)).resolves.toEqual({ ok: false });
    }
    await expect(broker.peek(43, 'https://claude.ai/chat/other')).resolves.toBe(false);
    await expect(broker.claim(43, 'https://claude.ai/chat/other')).resolves.toEqual({ ok: false });
    expect(data.size).toBe(2);

    // A harmless query on the new-chat page itself is fine.
    await expect(broker.claim(42, 'https://chatgpt.com/?model=auto')).resolves.toMatchObject({
      ok: true,
    });
    await expect(broker.claim(43, 'https://claude.ai/new/')).resolves.toMatchObject({ ok: true });
  });

  it('stores nothing and reports every target unready without storage.session', async () => {
    const opened: string[] = [];
    const broker = createHandoffBroker({
      area: null,
      isReceiverReady: async () => true,
      openTab: async (url) => {
        opened.push(url);
        return 42;
      },
      scheduleExpiry: vi.fn(),
      clearExpiry: vi.fn(),
    });

    await expect(broker.status()).resolves.toEqual({ chatgpt: false, claude: false });
    await expect(broker.open('chatgpt', PACK, GEMINI_TAB)).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(opened).toEqual([]);
    // The clipboard path still opens the new chat.
    await expect(broker.open('chatgpt', undefined, GEMINI_TAB)).resolves.toEqual({ ok: true });
    expect(opened).toEqual(['https://chatgpt.com/']);
    await expect(broker.claim(42, CHATGPT_PAGE)).resolves.toEqual({ ok: false });
    await expect(broker.sweep()).resolves.toBeUndefined();
  });

  it('answers a peek that arrives while the tab is still being opened', async () => {
    const { broker, deps } = setup();
    let releaseTab!: (tabId: number) => void;
    deps.openTab.mockImplementationOnce(
      () => new Promise<number>((resolve) => (releaseTab = resolve)),
    );

    const opening = broker.open('claude', PACK, GEMINI_TAB);
    const peek = broker.peek(42, CLAUDE_PAGE);
    await vi.waitFor(() => expect(deps.openTab).toHaveBeenCalled());
    releaseTab(42);

    await expect(opening).resolves.toEqual({ ok: true });
    await expect(peek).resolves.toBe(true);
  });

  it('refuses to hand off when Voyager cannot run on the target, and opens nothing', async () => {
    const { broker, deps, data } = setup({ ready: { claude: false } });

    await expect(broker.open('claude', PACK, GEMINI_TAB)).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(deps.openTab).not.toHaveBeenCalled();
    expect(data.size).toBe(0);
  });

  it('only opens the new chat on the clipboard path, storing nothing', async () => {
    const { broker, deps, data } = setup({ ready: { chatgpt: false } });

    await expect(broker.open('chatgpt', undefined, GEMINI_TAB)).resolves.toEqual({ ok: true });
    expect(deps.openTab).toHaveBeenCalledWith('https://chatgpt.com/', GEMINI_TAB);
    expect(data.size).toBe(0);
  });

  it('reports a receiver check that throws as not ready', async () => {
    const { broker, deps } = setup();
    deps.isReceiverReady.mockImplementation(async (target) => {
      if (target === 'claude') throw new Error('no scripting');
      return true;
    });

    await expect(broker.status()).resolves.toEqual({ chatgpt: true, claude: false });
  });

  it('drops the pack when its tab closes', async () => {
    const { broker, data } = setup();
    await broker.open('chatgpt', PACK, GEMINI_TAB);

    await broker.discard(42);
    expect(data.size).toBe(0);
    await expect(broker.claim(42, CHATGPT_PAGE)).resolves.toEqual({ ok: false });
  });

  it('sweeps expired and malformed records at start-up and keeps live ones', async () => {
    const { broker, data, advance } = setup();
    await broker.open('chatgpt', PACK, GEMINI_TAB);
    data.set(`${HANDOFF_STORAGE_PREFIX}5`, { junk: true });
    data.set(`${HANDOFF_STORAGE_PREFIX}6`, {
      target: 'claude',
      markdown: PACK,
      tabId: 6,
      expiresAt: 1,
    });
    data.set('unrelated', 1);
    advance(1);

    await broker.sweep();
    expect([...data.keys()].sort()).toEqual([handoffStorageKey(42), 'unrelated'].sort());
  });
});

describe('research pack handoff messages', () => {
  it('accepts only known targets and sane payloads', () => {
    expect(parseHandoffMessage({ type: HANDOFF_MESSAGES.open, target: 'chatgpt' })).toEqual({
      type: HANDOFF_MESSAGES.open,
      target: 'chatgpt',
    });
    expect(parseHandoffMessage({ type: HANDOFF_MESSAGES.open, target: 'gemini' })).toBeNull();
    expect(
      parseHandoffMessage({ type: HANDOFF_MESSAGES.open, target: 'claude', markdown: '' }),
    ).toBeNull();
    expect(
      parseHandoffMessage({
        type: HANDOFF_MESSAGES.open,
        target: 'claude',
        markdown: 'x'.repeat(HANDOFF_MAX_MARKDOWN_CHARS + 1),
      }),
    ).toBeNull();
    // A claim names no tab: the background uses the sender's.
    expect(parseHandoffMessage({ type: HANDOFF_MESSAGES.claim, tabId: 3 })).toEqual({
      type: HANDOFF_MESSAGES.claim,
    });
    expect(parseHandoffMessage({ type: 'gv.researchPack.apply' })).toBeNull();
  });

  it('maps pages to targets by exact https host', () => {
    expect(handoffTargetForUrl('https://chatgpt.com/c/1')).toBe('chatgpt');
    expect(handoffTargetForUrl('https://claude.ai/new')).toBe('claude');
    expect(handoffTargetForUrl('http://claude.ai/new')).toBeNull();
    expect(handoffTargetForUrl('https://claude.ai.evil.com/')).toBeNull();
    expect(handoffTargetForUrl('https://gemini.google.com/app')).toBeNull();
    expect(handoffTargetForUrl(undefined)).toBeNull();
  });

  it('recognizes only the exact new-chat routes', () => {
    expect(handoffNewChatTargetForUrl('https://chatgpt.com/')).toBe('chatgpt');
    expect(handoffNewChatTargetForUrl('https://chatgpt.com/?temporary-chat=true')).toBe('chatgpt');
    expect(handoffNewChatTargetForUrl('https://claude.ai/new')).toBe('claude');
    expect(handoffNewChatTargetForUrl('https://claude.ai/new#x')).toBe('claude');
    expect(handoffNewChatTargetForUrl('https://chatgpt.com/c/1')).toBeNull();
    expect(handoffNewChatTargetForUrl('https://claude.ai/')).toBeNull();
    expect(handoffNewChatTargetForUrl('https://claude.ai/new/chat')).toBeNull();
    expect(handoffNewChatTargetForUrl('https://claude.ai/newer')).toBeNull();
    expect(handoffNewChatTargetForUrl('https://gemini.google.com/')).toBeNull();
  });

  it('round-trips alarm names and ignores other alarms', () => {
    expect(tabIdFromHandoffAlarm(handoffAlarmName(12))).toBe(12);
    expect(tabIdFromHandoffAlarm('gv-chatgpt-handoff-expiry:abcd')).toBeNull();
    expect(tabIdFromHandoffAlarm(`${handoffAlarmName(1)}x`)).toBeNull();
  });
});
