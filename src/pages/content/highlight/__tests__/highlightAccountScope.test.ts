import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';
import type {
  HighlightAccountScope,
  HighlightCreateInput,
  HighlightRecordV1,
  HighlightUpdatePatch,
} from '@/core/types/highlight';

import { HighlightMarks } from '../HighlightMarks';
import { buildHighlightAnchor } from '../anchor';
import type { HighlightClient } from '../client';
import { HighlightManager } from '../manager';
import { installConversation, makeRecord, selectText } from './fixtures';

const page = vi.hoisted(() => ({ email: null as string | null }));

vi.mock('@/core/services/AccountIsolationService', () => ({
  detectAccountContextFromDocument: vi.fn((url: string) => ({
    routeUserId: new URL(url).pathname.match(/^\/u\/(\d+)\//)?.[1] ?? null,
    email: page.email,
  })),
  accountIsolationService: { resolveAccountScope: vi.fn() },
}));

interface ScopeHints {
  routeUserId?: string | null;
  email?: string | null;
}

/** What the real resolver keys an account by: email first, then the `/u/N` slot. */
function scopeFor(hints: ScopeHints) {
  const routeUserId = hints.routeUserId ?? null;
  if (hints.email) {
    return {
      accountKey: `email:${hints.email}`,
      accountId: 7,
      routeUserId,
      emailHash: hints.email,
    };
  }
  if (routeUserId) {
    return {
      accountKey: `route:${routeUserId}`,
      accountId: Number(routeUserId) + 1,
      routeUserId,
      emailHash: null,
    };
  }
  return { accountKey: 'default', accountId: 0, routeUserId: null, emailHash: null };
}

interface Held {
  release(): void;
  reject(error: Error): void;
}

/** Hold the mock's next call until released; it then answers as it normally would. */
function holdNext<Args extends unknown[], Result>(
  mock: Mock<(...args: Args) => Promise<Result>>,
): Held {
  const answer = mock.getMockImplementation();
  if (!answer) throw new Error('Expected a default implementation');
  let release = (): void => {
    throw new Error('The held call has not been made yet');
  };
  let reject = (_error: Error): void => {
    throw new Error('The held call has not been made yet');
  };
  mock.mockImplementationOnce(
    (...args: Args) =>
      new Promise<Result>((resolve, fail) => {
        release = () => resolve(answer(...args));
        reject = fail;
      }),
  );
  return { release: () => release(), reject: (error) => reject(error) };
}

function createClient(stored: Record<string, HighlightRecordV1[]>) {
  return {
    list: vi.fn(
      async (_scope: HighlightAccountScope, conversationId: string) => stored[conversationId] ?? [],
    ),
    create: vi.fn(async (_scope: HighlightAccountScope, input: HighlightCreateInput) => {
      const record = makeRecord(input.anchor, {
        id: `created-${input.conversationId}`,
        conversationId: input.conversationId,
        conversationUrl: input.conversationUrl,
        turnId: input.turnId,
      });
      stored[input.conversationId] = [...(stored[input.conversationId] ?? []), record];
      return record;
    }),
    update: vi.fn(
      async (
        _scope: HighlightAccountScope,
        conversationId: string,
        id: string,
        patch: HighlightUpdatePatch,
      ) => {
        const current = stored[conversationId]?.find((record) => record.id === id);
        if (!current) throw new Error('missing record');
        return { ...current, color: patch.color ?? current.color };
      },
    ),
    delete: vi.fn(
      async (_scope: HighlightAccountScope, _conversationId: string, _id: string) => {},
    ),
  };
}

/** A store that keeps each account's highlights apart, as the background does. */
function createScopedClient(stored: Record<string, HighlightRecordV1[]>) {
  return {
    ...createClient({}),
    list: vi.fn(
      async (scope: HighlightAccountScope, conversationId: string) =>
        stored[`${scope.accountKey}|${conversationId}`] ?? [],
    ),
  };
}

const resolveScope = () => vi.mocked(accountIsolationService.resolveAccountScope);
const marksOf = (id: string) =>
  document.querySelectorAll(`.gv-highlight-mark[data-gv-highlight-id="${id}"]`);
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

/** A route change Gemini makes with pushState: no popstate, only a later DOM change. */
function navigateWithoutPopstate(path: string): void {
  window.history.pushState(null, '', path);
  document.querySelector('main')?.appendChild(document.createElement('span'));
}

function anchorFor(response: HTMLElement) {
  const anchor = buildHighlightAnchor(response, selectText(response, 'target'));
  if (!anchor) throw new Error('Expected anchor');
  return anchor;
}

describe('highlight account and route identity', () => {
  const managers: HighlightManager[] = [];
  const start = (client: ReturnType<typeof createClient>): HighlightManager => {
    const manager = new HighlightManager(client as unknown as HighlightClient);
    managers.push(manager);
    return manager;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    page.email = null;
    resolveScope()
      .mockReset()
      .mockImplementation(async (hints: ScopeHints = {}) => scopeFor(hints));
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    managers.splice(0).forEach((manager) => manager.destroy());
    window.history.replaceState(null, '', '/');
    document.body.innerHTML = '';
  });

  it('does not save a highlight into the account the user switched to during the save', async () => {
    window.history.replaceState(null, '', '/u/0/app/a');
    const response = installConversation();
    const client = createClient({});
    const manager = start(client);
    await manager.init();

    const scopeLookup = holdNext(resolveScope());
    const saving = manager.createFromRange(selectText(response, 'target'));
    window.history.pushState(null, '', '/u/1/app/a');
    scopeLookup.release();

    await expect(saving).resolves.toBe(false);
    expect(client.create).not.toHaveBeenCalled();
  });

  it('still saves when the startup default scope completes to the same account', async () => {
    window.history.replaceState(null, '', '/app/a');
    const response = installConversation();
    const client = createClient({});
    const manager = start(client);
    await manager.init();
    expect(client.list.mock.calls.at(-1)?.[0].accountKey).toBe('default');

    page.email = 'me@example.com';
    await expect(manager.createFromRange(selectText(response, 'target'))).resolves.toBe(true);

    expect(client.create.mock.calls.at(-1)?.[0].accountKey).toBe('email:me@example.com');
    expect(client.list.mock.calls.at(-1)?.[0].accountKey).toBe('email:me@example.com');
    expect(marksOf('created-gemini:conv:a')).toHaveLength(1);
  });

  it('still saves when Gemini rewrites /app/x into /u/0/app/x during the save', async () => {
    window.history.replaceState(null, '', '/app/a');
    const response = installConversation();
    const client = createClient({});
    const manager = start(client);
    await manager.init();

    const scopeLookup = holdNext(resolveScope());
    const saving = manager.createFromRange(selectText(response, 'target'));
    navigateWithoutPopstate('/u/0/app/a');
    // Let the manager's debounced route check see the rewritten URL before the save goes on.
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    scopeLookup.release();

    await expect(saving).resolves.toBe(true);
    expect(client.create).toHaveBeenCalledTimes(1);
    // Without an email the page keeps the scope it loaded with until the next navigation.
    expect(client.create.mock.calls[0][0].accountKey).toBe('default');
    expect(marksOf('created-gemini:conv:a')).toHaveLength(1);
  });

  it('does not edit or delete a highlight in another account after a switch', async () => {
    const openEditorOnFirstAccount = async () => {
      managers.splice(0).forEach((manager) => manager.destroy());
      window.history.replaceState(null, '', '/u/0/app/a');
      const response = installConversation();
      const client = createClient({ 'gemini:conv:a': [makeRecord(anchorFor(response))] });
      await start(client).init();
      document.querySelector<HTMLElement>('.gv-highlight-mark')!.click();
      return client;
    };
    const status = () => document.querySelector('.gv-highlight-save-status')?.textContent ?? '';

    const editing = await openEditorOnFirstAccount();
    let scopeLookup = holdNext(resolveScope());
    document.querySelector<HTMLButtonElement>('.gv-highlight-popover-button-primary')!.click();
    window.history.pushState(null, '', '/u/1/app/a');
    scopeLookup.release();
    await vi.waitFor(() => expect(status()).toContain('account changed'));
    expect(editing.update).not.toHaveBeenCalled();

    const deleting = await openEditorOnFirstAccount();
    scopeLookup = holdNext(resolveScope());
    document.querySelector<HTMLButtonElement>('.gv-highlight-popover-button-danger')!.click();
    window.history.pushState(null, '', '/u/1/app/a');
    scopeLookup.release();
    await vi.waitFor(() => expect(status()).toContain('account changed'));
    expect(deleting.delete).not.toHaveBeenCalled();
  });

  it("a late list from chat A does not enter chat B's records", async () => {
    window.history.replaceState(null, '', '/app/a');
    const response = installConversation();
    const client = createClient({
      'gemini:conv:a': [makeRecord(anchorFor(response), { id: 'a-1' })],
      'gemini:conv:b': [],
    });
    const listA = holdNext(client.list);
    void start(client).init();
    await vi.waitFor(() => expect(client.list).toHaveBeenCalledOnce());

    const scopeB = holdNext(resolveScope());
    navigateWithoutPopstate('/app/b');
    await vi.waitFor(() => expect(resolveScope()).toHaveBeenCalledTimes(2));
    listA.release();
    await settle();
    expect(marksOf('a-1')).toHaveLength(0);

    scopeB.release();
    await vi.waitFor(() =>
      expect(client.list).toHaveBeenLastCalledWith(expect.anything(), 'gemini:conv:b'),
    );
    await settle();
    expect(document.querySelector('.gv-highlight-mark')).toBeNull();
  });

  it('a late create result from chat A leaves chat B untouched', async () => {
    window.history.replaceState(null, '', '/app/a');
    const response = installConversation();
    const client = createClient({ 'gemini:conv:a': [], 'gemini:conv:b': [] });
    const manager = start(client);
    await manager.init();

    const created = holdNext(client.create);
    const saving = manager.createFromRange(selectText(response, 'target'));
    await vi.waitFor(() => expect(client.create).toHaveBeenCalledOnce());
    window.history.pushState(null, '', '/app/b');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() =>
      expect(client.list).toHaveBeenLastCalledWith(expect.anything(), 'gemini:conv:b'),
    );
    created.release();

    await expect(saving).resolves.toBe(false);
    await settle();
    expect(document.querySelector('.gv-highlight-mark')).toBeNull();
    expect(document.querySelector('.gv-highlight-live')?.textContent).toBe('');
  });

  it("navigating A to B to A without popstate shows only A's highlights once", async () => {
    window.history.replaceState(null, '', '/app/a');
    const response = installConversation();
    const anchor = anchorFor(response);
    const client = createClient({
      'gemini:conv:a': [makeRecord(anchor, { id: 'a-1' })],
      'gemini:conv:b': [makeRecord(anchor, { id: 'b-1', conversationId: 'gemini:conv:b' })],
    });
    await start(client).init();
    expect(marksOf('a-1')).toHaveLength(1);

    const listB = holdNext(client.list);
    navigateWithoutPopstate('/app/b');
    await vi.waitFor(() => expect(client.list).toHaveBeenCalledTimes(2));
    const scopeA = holdNext(resolveScope());
    navigateWithoutPopstate('/app/a');
    await vi.waitFor(() => expect(resolveScope()).toHaveBeenCalledTimes(3));
    listB.release();
    await settle();
    expect(marksOf('b-1')).toHaveLength(0);

    scopeA.release();
    await vi.waitFor(() => expect(marksOf('a-1')).toHaveLength(1));
    await settle();
    expect(document.querySelectorAll('.gv-highlight-mark')).toHaveLength(1);
    expect(marksOf('b-1')).toHaveLength(0);
  });

  it("an account switch on the same URL while its scope resolves shows only B's highlights", async () => {
    window.history.replaceState(null, '', '/app/a');
    page.email = 'a@example.com';
    const response = installConversation();
    const anchor = anchorFor(response);
    const client = createScopedClient({
      'email:a@example.com|gemini:conv:a': [makeRecord(anchor, { id: 'a-1' })],
      'email:b@example.com|gemini:conv:a': [makeRecord(anchor, { id: 'b-1' })],
    });
    const scopeA = holdNext(resolveScope());
    void start(client).init();
    await vi.waitFor(() => expect(resolveScope()).toHaveBeenCalledOnce());

    page.email = 'b@example.com';
    scopeA.release();

    await vi.waitFor(() => expect(marksOf('b-1')).toHaveLength(1));
    await settle();
    expect(marksOf('a-1')).toHaveLength(0);
    expect(document.querySelectorAll('.gv-highlight-mark')).toHaveLength(1);
    expect(client.list.mock.calls.map(([scope]) => scope.accountKey)).not.toContain(
      'email:a@example.com',
    );
  });

  it("an account switch on the same URL while the list loads shows only B's highlights", async () => {
    window.history.replaceState(null, '', '/app/a');
    page.email = 'a@example.com';
    const response = installConversation();
    const anchor = anchorFor(response);
    const client = createScopedClient({
      'email:a@example.com|gemini:conv:a': [makeRecord(anchor, { id: 'a-1' })],
      'email:b@example.com|gemini:conv:a': [makeRecord(anchor, { id: 'b-1' })],
    });
    const listA = holdNext(client.list);
    void start(client).init();
    await vi.waitFor(() => expect(client.list).toHaveBeenCalledOnce());

    page.email = 'b@example.com';
    listA.release();

    await vi.waitFor(() => expect(marksOf('b-1')).toHaveLength(1));
    await settle();
    expect(marksOf('a-1')).toHaveLength(0);
    expect(document.querySelectorAll('.gv-highlight-mark')).toHaveLength(1);
  });

  it('does not recreate the live region after destroy', async () => {
    window.history.replaceState(null, '', '/app/a');
    const response = installConversation();
    const client = createClient({});
    const manager = start(client);
    await manager.init();

    const created = holdNext(client.create);
    const saving = manager.createFromRange(selectText(response, 'target'));
    await vi.waitFor(() => expect(client.create).toHaveBeenCalledOnce());
    manager.destroy();
    created.reject(new Error('Highlight operation failed'));
    await expect(saving).resolves.toBe(false);
    await settle();

    expect(document.querySelector('.gv-highlight-live')).toBeNull();
  });

  it('destroy during init attaches nothing', async () => {
    window.history.replaceState(null, '', '/app/a');
    installConversation();
    const client = createClient({});
    const manager = start(client);
    const scopeLookup = holdNext(resolveScope());
    const initializing = manager.init();

    manager.destroy();
    scopeLookup.release();
    await initializing;
    await settle();

    expect(chrome.runtime.onMessage.addListener).not.toHaveBeenCalled();
    expect(client.list).not.toHaveBeenCalled();
    expect(document.getElementById('gv-highlight-style')).toBeNull();
    expect(document.querySelector('.gv-highlight-live')).toBeNull();
  });

  it('leaves no highlight marks on a turn detached, re-rendered, then reattached after stop', async () => {
    window.history.replaceState(null, '', '/app/a');
    const response = installConversation();
    const client = createClient({ 'gemini:conv:a': [makeRecord(anchorFor(response))] });
    const manager = start(client);
    await manager.init();
    expect(response.querySelector('.gv-highlight-mark')).not.toBeNull();
    const render = vi.spyOn(HighlightMarks.prototype, 'render');

    const turn = document.querySelector<HTMLElement>('.conversation-container')!;
    const main = turn.parentElement!;
    turn.remove();
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    manager.destroy();
    main.appendChild(turn);

    expect(turn.querySelector('.gv-highlight-mark')).toBeNull();
    expect(response.childNodes).toHaveLength(1);
    expect(response.textContent).toBe('Alpha target Omega');
  });
});
