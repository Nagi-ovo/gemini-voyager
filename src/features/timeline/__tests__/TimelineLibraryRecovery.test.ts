import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { createStarStore } from '@/features/savedLibrary/starStore';
import type { StarredMessage, StarredMessagesData } from '@/features/savedLibrary/starTypes';
import { createStarredMessagesHandler } from '@/pages/background/starredMessages';
import { createGeminiTimelineStoragePolicy } from '@/pages/content/timeline/GeminiTimelineStorage';

import { TimelineState } from '../TimelineState';
import { createCatalogTimelineStoragePolicy } from '../adapters/catalog/CatalogTimelineStorage';
import { CatalogTurnOwnership } from '../adapters/catalog/CatalogTurnOwnership';
import type { CatalogTimelineConfig } from '../adapters/catalog/config';
import { starConversationId } from '../adapters/catalog/conversationId';

const states: TimelineState[] = [];
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.replaceChildren();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({}));
});
afterEach(() => states.splice(0).forEach((state) => state.destroy()));

describe.each(['gemini', 'chatgpt', 'claude', 'deepseek'])('%s Library recovery', (siteId) => {
  it('a transient initial Library failure does not leave starring disabled after recovery', async () => {
    history.replaceState({}, '', siteId === 'gemini' ? '/app/recovery' : '/c/recovery');
    const conversationId = `${siteId}:conv:recovery`;
    const oldId = siteId === 'gemini' ? 's-1111111111111111' : 'c-old';
    const newId = siteId === 'gemini' ? 's-2222222222222222' : 'c-new';
    const message = (turnId: string): StarredMessage => ({
      turnId,
      conversationId,
      conversationUrl: location.href,
      content: turnId,
      starredAt: 1,
    });
    let data: StarredMessagesData = { messages: { [conversationId]: [message(oldId)] } };
    let healthy = false;
    const handle = createStarredMessagesHandler(
      createStarStore({
        get: async () => {
          if (!healthy) throw new Error('temporary storage failure');
          return {
            [StorageKeys.TIMELINE_STARRED_MESSAGES]: structuredClone(data),
            [StorageKeys.SAVED_LIBRARY_STARS]: structuredClone(data),
          };
        },
        set: async (values) => {
          data = structuredClone(
            values[StorageKeys.TIMELINE_STARRED_MESSAGES],
          ) as StarredMessagesData;
        },
      }),
    );
    const readRequests: string[] = [];
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      request: { type: string },
      callback: (response: unknown) => void,
    ) => {
      if (request.type === 'gv.starred.getAll' || request.type === 'gv.starred.getForConversation')
        readRequests.push(request.type);
      void handle(request)?.then(callback, (error: Error) =>
        callback({ ok: false, error: error.message }),
      );
    }) as typeof chrome.runtime.sendMessage);
    const elements = [oldId, newId].map((id) => {
      const element = document.createElement('div');
      element.className = 'turn';
      element.textContent = id;
      document.body.append(element);
      return element;
    });
    let policy;
    if (siteId === 'gemini') policy = createGeminiTimelineStoragePolicy();
    else {
      const config: CatalogTimelineConfig = {
        siteId,
        siteLabel: siteId,
        turnSelector: '.turn',
        conversationIdPattern: '^/c/([^/?#]+)',
        position: 'right',
        pluginId: `${siteId}.timeline`,
        coachmarkId: 'timeline-style',
      };
      const ownership = new CatalogTurnOwnership({
        routeId: () => location.href.split('#')[0],
        starId: () => starConversationId(config),
      });
      ownership.begin();
      ownership.recordInsertions([{ addedNodes: elements } as unknown as MutationRecord]);
      ownership.observe(elements.map((element, i) => ({ element, hash: i === 0 ? 'old' : 'new' })));
      policy = createCatalogTimelineStoragePolicy(config, ownership);
    }
    const primary =
      siteId === 'gemini'
        ? `geminiTimelineStars:${conversationId}`
        : `gvTimelineStars:${siteId}:${conversationId}`;
    localStorage.setItem(primary, JSON.stringify([oldId]));
    const state = new TimelineState(() => {}, policy);
    states.push(state);
    state.replaceMarkers(
      [oldId, newId].map((id, i) => ({
        id,
        element: elements[i],
        summary: id,
        assistantSummary: '',
        baseN: i,
        starred: false,
      })),
    );
    await state.init();
    expect(readRequests).toHaveLength(1);
    await state.toggleStar(newId);
    expect(data.messages[conversationId].map((star) => star.turnId)).toEqual([oldId]);
    expect(localStorage.getItem(primary)).toBe(JSON.stringify([oldId]));
    healthy = true;
    await state.toggleStar(newId);
    expect(readRequests).toHaveLength(4);
    expect(data.messages[conversationId].map((star) => star.turnId)).toEqual([oldId, newId]);
    expect(JSON.parse(localStorage.getItem(primary)!)).toEqual([oldId]);
    expect(state.markers.map((marker) => marker.starred)).toEqual([true, true]);
  });
});
