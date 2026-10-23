import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import { ExportFormat } from '../../../../features/export/types/export';
import type { ConversationCollector } from '../conversationCollector';
import { createExportRunner } from '../exportRun';
import type { ExportSite } from '../exportSite';
import { PENDING_EXPORT_SESSION_KEY, createPendingExportState } from '../pendingExportState';

/** Gemini-like history: the top user turn is `.u`, which the page renders late. */
function historySite(): ExportSite {
  const page = {
    collectChatPairs: () => [],
    collectSelectionMessages: () => [],
    turnsForMessageIds: () => [],
    assistantMessageIdFor: () => null,
    topUserElement: () => document.querySelector<HTMLElement>('.u'),
    conversationRoot: () => document.body,
    snapshotOpenCanvasDocs: vi.fn(),
    releaseCanvasDocs: vi.fn(),
  } as ConversationCollector;
  return {
    id: 'test',
    label: 'Test Chat',
    entryPoints: { kind: 'toolbar' },
    title: () => 'A conversation',
    page,
    turns: { scrollsWhileBuilding: false, messages: () => [], build: async () => [] },
    history: { userSelectors: () => ['.u'], assistantSelectors: () => ['.a'] },
  };
}

/** A run that already clicked once and was cut short by the reload. */
function storeReloadedRun(): string {
  const state = JSON.stringify({
    ...createPendingExportState(ExportFormat.JSON, location.href, Date.now()),
    attempt: 1,
  });
  sessionStorage.setItem(PENDING_EXPORT_SESSION_KEY, state);
  return state;
}

beforeEach(() => {
  document.body.innerHTML = '';
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  sessionStorage.clear();
});

describe('a resumed export switched off while the page is still loading', () => {
  it.each([
    ['its mount aborts', (owner: AbortController) => owner.abort()],
    ['the runner is cancelled', (_owner: AbortController, cancel: () => void) => cancel()],
  ] as const)(
    'does not click the top turn, which could reload Gemini, when %s',
    async (_label, switchOff) => {
      const stored = storeReloadedRun();
      const runner = createExportRunner({ site: historySite() });
      const owner = new AbortController();
      const resuming = runner.resumePending(owner.signal);
      // Its progress shows as it starts waiting for the reloaded page's first user turn.
      await vi.waitFor(() => expect(toastDriver.all()).not.toHaveLength(0), { timeout: 5000 });

      switchOff(owner, runner.cancel);
      const top = document.createElement('div');
      top.className = 'u';
      top.scrollIntoView = vi.fn();
      const click = vi.spyOn(top, 'click');
      document.body.appendChild(top);
      await resuming;

      expect(click).not.toHaveBeenCalled();
      // Nothing re-persisted for another reload.
      expect(sessionStorage.getItem(PENDING_EXPORT_SESSION_KEY)).toBe(stored);
    },
  );
});
