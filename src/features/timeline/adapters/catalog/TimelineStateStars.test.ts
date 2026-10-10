import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { StarredMessage } from '@/features/savedLibrary/starTypes';

import { TimelineState } from '../../TimelineState';
import type { TimelineStoragePolicy } from '../../TimelineStoragePolicy';
import type { TimelineMarker } from '../../types';
import { CatalogTurnOwnership } from './CatalogTurnOwnership';
import { extractTurnHash } from './turnHash';

const { addStarredMessage, getStarredMessagesForConversation, removeStarredMessage } = vi.hoisted(
  () => ({
    addStarredMessage: vi.fn().mockResolvedValue(undefined),
    getStarredMessagesForConversation: vi.fn().mockResolvedValue([]),
    removeStarredMessage: vi.fn().mockResolvedValue(undefined),
  }),
);

vi.mock('@/features/savedLibrary/StarredMessagesService', async (importOriginal) => ({
  StarredMessagesService: {
    backfillStarredTexts: vi.fn().mockResolvedValue(undefined),
    decodeStorageChange: (
      await importOriginal<typeof import('@/features/savedLibrary/StarredMessagesService')>()
    ).StarredMessagesService.decodeStorageChange,
    addStarredMessage,
    getStarredMessagesForConversation,
    removeStarredMessage,
  },
}));

const turn = { id: 'c-same', hash: 'same', summary: 'Same prompt' };

let route: string;
let ownership: CatalogTurnOwnership;
let state: TimelineState;
const states: TimelineState[] = [];
const library = new Map<string, StarredMessage[]>();
const init = () => state.init();

/** The conversation a host that names it puts on the turn's container. */
function stated(element: Element): string | null {
  const id = element.closest('[data-conv]')?.getAttribute('data-conv');
  return id ? `site:conv:${id}` : null;
}

function create(
  starId: () => string | null = () => route,
  turnConversation?: (element: Element) => string | null | undefined,
): void {
  ownership = new CatalogTurnOwnership({ routeId: () => route, starId, turnConversation });
  ownership.begin();
  const capturedRoute = route;
  const capturedId = starId();
  const policy: TimelineStoragePolicy = {
    conversationId: capturedId ?? '',
    url: `https://site/c/${route.split(':').at(-1)}`,
    settingsPrefix: 'gvTimeline:site:',
    stars: {
      matchLegacyConversations: false,
      resolveAccount: async () => undefined,
    },
    hierarchy: {
      extensionKey: 'gvCatalogTimelineHierarchy:site',
      legacyLevelsKey: null,
      legacyCollapsedKey: null,
      adoptUnscopedHierarchy: false,
      accountAttributes: [],
      resolveAccountScope: async () => null,
    },
    isCurrent: () => route === capturedRoute,
    canEdit: (marker) => !!marker && ownership.canStar(marker.element),
    resolveMountedTurnId: extractTurnHash,
    resolveStoredTurnId: extractTurnHash,
    getStoredTurnIdAliases: (id) => [id],
    getConversationTitle: () => 'B',
  };
  state = new TimelineState(() => {}, policy);
  states.push(state);
}

function observe(turns: Array<{ element: Element; hash: string }>): void {
  ownership.observe(turns);
  state.replaceMarkers(
    turns.map(({ element, hash }) => ({
      id: `c-${hash}`,
      element: element as HTMLElement,
      summary: 'Same prompt',
      assistantSummary: '',
      baseN: 0,
      starred: false,
    })),
  );
}

function press(target: {
  id: string;
  hash: string;
  summary: string;
  element: Element;
}): Promise<void> {
  const marker: TimelineMarker = {
    ...target,
    element: target.element as HTMLElement,
    assistantSummary: '',
    baseN: 0,
    starred: false,
  };
  state.replaceMarkers([marker]);
  return state.toggleStar(target.id);
}

function seedLibrary(messages: StarredMessage[]): void {
  library.set(route, messages);
}

function synchronizeLibrary(messages: StarredMessage[]): void {
  seedLibrary(messages);
  for (const [listener] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls)
    listener(
      {
        [StorageKeys.SAVED_LIBRARY_STARS]: { newValue: { messages: { [route]: messages } } },
      },
      'local',
    );
}

/** The host inserts a turn now, under whatever the URL names. */
function insert(): HTMLElement {
  const element = document.createElement('div');
  document.body.appendChild(element);
  ownership.recordInsertions([{ addedNodes: [element] } as unknown as MutationRecord]);
  return element;
}

const seen = (element: Element, hash = 'same') => ({ element, hash });

function deferRead(): (messages: StarredMessage[]) => void {
  let release!: (messages: StarredMessage[]) => void;
  getStarredMessagesForConversation.mockImplementationOnce(
    () =>
      new Promise<StarredMessage[]>((resolve) => {
        release = resolve;
      }),
  );
  return (messages) => release(messages);
}

beforeEach(() => {
  document.body.innerHTML = '';
  route = 'site:conv:b';
  library.clear();
  addStarredMessage.mockReset().mockImplementation(async (message: StarredMessage) => {
    library.set(message.conversationId, [
      ...(library.get(message.conversationId) ?? []).filter(
        (stored) => stored.turnId !== message.turnId,
      ),
      message,
    ]);
  });
  removeStarredMessage
    .mockReset()
    .mockImplementation(async (conversationId: string, turnId: string) => {
      library.set(
        conversationId,
        (library.get(conversationId) ?? []).filter((stored) => stored.turnId !== turnId),
      );
    });
  getStarredMessagesForConversation
    .mockReset()
    .mockImplementation(async (conversationId: string) => library.get(conversationId) ?? []);
});

afterEach(() => states.splice(0).forEach((state) => state.destroy()));

describe('shared timeline star writes', () => {
  it('writes what was pressed, where it was pressed, once the read lands', async () => {
    create();
    const element = insert();
    observe([seen(element)]);
    const release = deferRead();
    void init();

    const toggled = press({ ...turn, element });
    release([]);

    await toggled;
    expect(addStarredMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'site:conv:b',
        conversationUrl: 'https://site/c/b',
        content: 'Same prompt',
      }),
    );
  });

  it('drops a press when the conversation changes while its read is pending', async () => {
    create();
    const element = insert();
    observe([seen(element)]);
    const release = deferRead();
    void init();

    const toggled = press({ ...turn, element });
    route = 'site:conv:c';
    observe([seen(insert())]);
    void init();
    release([]);

    await toggled;
    expect(addStarredMessage).not.toHaveBeenCalled();
  });

  it('refuses a press before a refresh has seen the current route', () => {
    create();
    const element = insert();
    observe([seen(element)]);
    route = 'site:conv:c';
    expect(ownership.canStar(element)).toBe(false);
  });

  it("never stars a new chat's turn, not even under the id the chat gets", () => {
    route = '/';
    create(() => (route.startsWith('site:conv:') ? route : null));
    const draft = insert();
    observe([seen(draft, 'x')]);
    route = 'site:conv:c';
    observe([seen(draft, 'x')]);

    expect(ownership.canStar(draft)).toBe(false);
  });

  it('refuses a turn that entered the page under another conversation', () => {
    create();
    const item = insert();
    observe([seen(item)]);
    route = 'site:conv:c';
    // Inserted while B's turn is still on screen: whose it is is not proven.
    const early = insert();
    observe([seen(item), seen(early, 'other')]);
    item.remove();
    observe([seen(early, 'other')]);
    const later = document.createElement('div');
    early.replaceWith(later);
    ownership.recordInsertions([{ addedNodes: [later] } as unknown as MutationRecord]);
    observe([seen(later, 'other')]);

    expect(ownership.canStar(item)).toBe(false);
    expect(ownership.canStar(early)).toBe(false);
    expect(ownership.canStar(later)).toBe(true);
  });

  it("lets the host's id for a turn's conversation decide, both ways", () => {
    route = '/';
    create(() => (route.startsWith('site:conv:') ? route : null), stated);
    const draft = insert();
    observe([seen(draft, 'x')]);
    route = 'site:conv:c';
    observe([seen(draft, 'x')]);
    expect(ownership.canStar(draft)).toBe(false);

    // The host says the new chat became this conversation.
    draft.setAttribute('data-conv', 'c');
    expect(ownership.canStar(draft)).toBe(true);
    // A turn that entered under this URL, but the host files it elsewhere.
    const other = insert();
    other.setAttribute('data-conv', 'd');
    observe([seen(draft, 'x'), seen(other, 'y')]);
    expect(ownership.canStar(other)).toBe(false);

    // Where the host names conversations, a turn without its id is not starrable,
    // even one that entered the page under this conversation.
    const pending = insert();
    observe([seen(draft, 'x'), seen(pending, 'z')]);
    expect(ownership.canStar(pending)).toBe(false);
    pending.setAttribute('data-conv', 'c');
    expect(ownership.canStar(pending)).toBe(true);
  });

  it('drops a press when the host files the turn elsewhere while its read is pending', async () => {
    create(() => route, stated);
    const element = insert();
    element.setAttribute('data-conv', 'b');
    observe([seen(element)]);
    const release = deferRead();
    void init();

    const toggled = press({ ...turn, element });
    element.setAttribute('data-conv', 'c');
    release([]);

    await toggled;
    expect(addStarredMessage).not.toHaveBeenCalled();
  });

  it('writes the turn as it was when pressed, even if the marker changes meanwhile', async () => {
    create();
    const element = insert();
    observe([seen(element)]);
    const release = deferRead();
    void init();
    const target = { ...turn, element };

    const toggled = press(target);
    target.summary = 'Edited later';
    target.id = 'c-other';
    release([]);
    await toggled;

    expect(addStarredMessage).toHaveBeenCalledWith(
      expect.objectContaining({ turnId: 'c-same', content: 'Same prompt' }),
    );
  });
});

function libraryStar(turnId: string): StarredMessage {
  return {
    turnId,
    conversationId: route,
    conversationUrl: 'https://site/c/b',
    content: turnId,
    starredAt: 1,
  };
}

describe('catalog Library star state', () => {
  beforeEach(() => localStorage.clear());

  it('uses Library stars and leaves ignored page arrays untouched during the first edit', async () => {
    const primaryKey = `gvTimelineStars:site:${route}`;
    const legacyKey = `geminiTimelineStars:${route}`;
    localStorage.setItem(primaryKey, '["c-same"]');
    localStorage.setItem(legacyKey, '["c-old"]');
    seedLibrary([libraryStar('c-library')]);
    create();
    const element = insert();
    observe([seen(element)]);
    await init();
    expect(state.isMarkerStarred('c-library')).toBe(true);
    expect(state.isMarkerStarred('c-same')).toBe(false);
    expect(state.isMarkerStarred('c-old')).toBe(false);
    await press({ ...turn, element });
    expect(state.isMarkerStarred('c-library')).toBe(true);
    expect(state.markers[0].starred).toBe(true);
    expect(addStarredMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: route, turnId: 'c-same' }),
    );
    expect(localStorage.getItem(primaryKey)).toBe('["c-same"]');
    expect(localStorage.getItem(legacyKey)).toBe('["c-old"]');
  });

  it('reflects a Library removal without rewriting stale page arrays', async () => {
    const pageKey = `gvTimelineStars:site:${route}`;
    localStorage.setItem(pageKey, '["c-same"]');
    seedLibrary([libraryStar('c-same')]);
    create();
    await init();
    expect(state.isMarkerStarred('c-same')).toBe(true);
    synchronizeLibrary([]);
    expect(state.isMarkerStarred('c-same')).toBe(false);
    expect(localStorage.getItem(pageKey)).toBe('["c-same"]');
  });

  it('keeps complete Library additions and removals ahead of a pending initial read', async () => {
    create();
    const release = deferRead();
    const pending = init();
    synchronizeLibrary([libraryStar('c-library'), libraryStar('c-new')]);
    release([libraryStar('c-library'), libraryStar('c-removed')]);
    await pending;
    expect(state.isMarkerStarred('c-library')).toBe(true);
    expect(state.isMarkerStarred('c-new')).toBe(true);
    expect(state.isMarkerStarred('c-removed')).toBe(false);
  });

  it('ignores malformed or partial Chrome snapshots without clearing healthy Library stars', async () => {
    const star = libraryStar('c-same');
    seedLibrary([star]);
    create();
    await init();
    for (const value of [
      {},
      { messages: [] },
      { messages: { [route]: null } },
      { messages: { [route]: [star, null] } },
    ]) {
      for (const [listener] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls)
        listener({ [StorageKeys.SAVED_LIBRARY_STARS]: { newValue: value } }, 'local');
      expect(state.isMarkerStarred('c-same')).toBe(true);
    }
  });

  it('refuses star writes when the initial Library read and its retry both fail', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    getStarredMessagesForConversation.mockRejectedValue(new Error('Message port closed'));
    create();
    const element = insert();
    observe([seen(element)]);
    await init();
    await press({ ...turn, element });
    expect(state.markers[0].starred).toBe(false);
    expect(removeStarredMessage).not.toHaveBeenCalled();
    expect(addStarredMessage).not.toHaveBeenCalled();
  });

  it('does not overwrite a newer Library removal with the initial pending snapshot', async () => {
    create();
    const element = insert();
    observe([seen(element)]);
    const release = deferRead();
    const pending = init();
    synchronizeLibrary([]);
    release([libraryStar('c-same')]);
    await pending;
    expect(state.markers[0].starred).toBe(false);
  });

  it('resolves historical hash aliases for every mounted copy and removes their stored records', async () => {
    seedLibrary([libraryStar('c-0-same')]);
    create();
    const element = insert();
    const duplicate = insert();
    ownership.observe([seen(element), seen(duplicate)]);
    state.replaceMarkers([
      {
        id: 'c-same',
        element,
        summary: 'Same prompt',
        assistantSummary: '',
        baseN: 0,
        starred: false,
      },
      {
        id: 'c-same~2',
        element: duplicate,
        summary: 'Same prompt',
        assistantSummary: '',
        baseN: 1,
        starred: false,
      },
    ]);
    await init();
    expect(state.markers.map((marker) => marker.starred)).toEqual([true, true]);
    expect(state.resolveMarkerIdForStorageId('c-0-same')).toBe('c-same');
    await state.toggleStar('c-same~2');
    expect(removeStarredMessage).toHaveBeenCalledWith(route, 'c-0-same');
    expect(state.markers.map((marker) => marker.starred)).toEqual([false, false]);
  });
});
