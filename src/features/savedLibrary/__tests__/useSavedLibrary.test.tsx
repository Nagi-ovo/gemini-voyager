import { act, useEffect } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { LanguageProvider } from '@/contexts/LanguageContext';
import { StorageKeys } from '@/core/types/common';
import { HIGHLIGHT_STORAGE_NAMESPACE, type HighlightRecordV1 } from '@/core/types/highlight';
import { makeRecord } from '@/pages/content/highlight/__tests__/fixtures';

import type { StarredMessage } from '../starTypes';
import { useSavedLibrary } from '../useSavedLibrary';

vi.mock('webextension-polyfill', () => ({ default: chrome }));

let root: Root;
let container: HTMLElement;
let view: ReturnType<typeof useSavedLibrary>;
let listeners: Set<Parameters<typeof chrome.storage.onChanged.addListener>[0]>;
let stars: StarredMessage[];
let highlights: HighlightRecordV1[];
let pendingRead: ((response: unknown) => void) | undefined;
let holdRead: boolean;
let holdRemoval: boolean;
let pendingRemoval: ((response: unknown) => void) | undefined;
let highlightReadFails: boolean;
let starReadFails: boolean;
let notifyRemovals: boolean;
const originalSend = chrome.runtime.sendMessage;

function Harness({ scope = 'all' }: { scope?: 'all' | (() => Promise<null>) }) {
  const library = useSavedLibrary({ highlightScope: scope, confirmRemoval: false });
  useEffect(() => {
    view = library;
  });
  return <div>{library.items.map((item) => item.content).join('|')}</div>;
}

async function render(scope?: () => Promise<null>) {
  await act(async () => {
    root.render(
      <LanguageProvider>
        <Harness scope={scope} />
      </LanguageProvider>,
    );
  });
}

function snapshot(records: StarredMessage[]) {
  const messages: Record<string, StarredMessage[]> = {};
  for (const record of records) (messages[record.conversationId] ??= []).push(record);
  return { messages };
}

function notify(changes: Record<string, chrome.storage.StorageChange>) {
  for (const listener of listeners) listener(changes, 'local');
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  stars = [
    {
      conversationId: 'gemini:conv:one',
      conversationUrl: 'https://gemini.google.com/app/one',
      turnId: 'one',
      content: 'Saved star',
      starredAt: 1,
    },
  ];
  highlights = [
    makeRecord({
      quote: { exact: 'Saved highlight', prefix: '', suffix: '' },
      position: { start: 0, end: 15 },
      sourceTextHash: 'hash',
    }),
  ];
  listeners = new Set();
  holdRead = false;
  holdRemoval = false;
  highlightReadFails = false;
  starReadFails = false;
  notifyRemovals = false;
  pendingRead = undefined;
  pendingRemoval = undefined;
  vi.mocked(chrome.storage.sync.get).mockImplementation(async () => ({
    [StorageKeys.LANGUAGE]: 'en',
  }));
  vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({}));
  vi.mocked(chrome.storage.onChanged.addListener).mockImplementation((listener) => {
    listeners.add(listener);
  });
  vi.mocked(chrome.storage.onChanged.removeListener).mockImplementation((listener) => {
    listeners.delete(listener);
  });
  chrome.runtime.sendMessage = vi.fn(
    (
      message: {
        type: string;
        payload?: {
          turnId?: string;
          id?: string;
          accountHash?: string;
          platform?: string;
          conversationId?: string;
        };
      },
      callback?: (response: unknown) => void,
    ) => {
      if (message.type === 'gv.starred.getAll') {
        if (starReadFails) callback?.({ ok: false, error: 'Read unavailable' });
        else if (holdRead) pendingRead = callback;
        else callback?.({ ok: true, data: snapshot(stars) });
        return;
      }
      if (message.type === 'gv.highlight.listAll') {
        return highlightReadFails
          ? Promise.reject(new Error('Unavailable'))
          : Promise.resolve({ ok: true, records: highlights });
      }
      if (message.type === 'gv.starred.remove') {
        if (holdRemoval) pendingRemoval = callback;
        else {
          stars = stars.filter((star) => star.turnId !== message.payload?.turnId);
          if (notifyRemovals)
            notify({ [StorageKeys.SAVED_LIBRARY_STARS]: { newValue: snapshot(stars) } });
          callback?.({ ok: true });
        }
        return;
      }
      if (message.type === 'gv.highlight.deleteStored') {
        highlights = highlights.filter(
          (record) =>
            record.id !== message.payload?.id ||
            record.accountHash !== message.payload?.accountHash ||
            record.platform !== message.payload?.platform ||
            record.conversationId !== message.payload?.conversationId,
        );
        if (notifyRemovals) notify({ [`${HIGHLIGHT_STORAGE_NAMESPACE}:index`]: { newValue: {} } });
        return Promise.resolve({ ok: true });
      }
      throw new Error(`Unexpected ${message.type}`);
    },
  ) as unknown as typeof chrome.runtime.sendMessage;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  expect(listeners.size).toBe(0);
  container.remove();
  chrome.runtime.sendMessage = originalSend;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('a delayed refresh cannot reintroduce an acknowledged deleted star', async () => {
  await render();
  const oldStars = [...stars];
  holdRead = true;
  let read: Promise<void>;
  await act(async () => {
    read = view.reload();
  });
  const staleRead = pendingRead;
  holdRead = false;
  await act(async () => {
    expect(await view.remove(view.items.find((item) => item.kind === 'starred')!)).toBe(true);
  });
  await act(async () => {
    staleRead?.({ ok: true, data: snapshot(oldStars) });
    await read;
  });
  expect(container.textContent).not.toContain('Saved star');
  expect(container.textContent).toContain('Saved highlight');
});

it('a failed highlight refresh keeps its last readable rows alongside updated stars', async () => {
  await render();
  highlightReadFails = true;
  stars = [{ ...stars[0], content: 'Updated star' }];
  await act(async () => {
    await view.reload();
  });
  expect(container.textContent).toBe('Saved highlight|Updated star');
  expect(view.error).toBe(true);
});

it('a complete star storage change refreshes rows while compatibility and corrupt events are ignored', async () => {
  await render();
  stars = [{ ...stars[0], content: 'External star' }];
  await act(async () => {
    for (const listener of listeners)
      listener({ [StorageKeys.TIMELINE_STARRED_MESSAGES]: { newValue: snapshot(stars) } }, 'local');
    for (const listener of listeners)
      listener({ [StorageKeys.SAVED_LIBRARY_STARS]: { newValue: { messages: [] } } }, 'local');
  });
  expect(container.textContent).toContain('Saved star');
  await act(async () => {
    for (const listener of listeners)
      listener({ [StorageKeys.SAVED_LIBRARY_STARS]: { newValue: snapshot(stars) } }, 'local');
  });
  expect(container.textContent).toContain('External star');
});

it('deleting an imported highlight keeps the same id in another account', async () => {
  highlights.push({ ...highlights[0], accountHash: 'other-account' });
  await render();
  const item = view.items.find((item) => item.kind === 'highlight')!;
  await act(async () => {
    expect(await view.remove(item)).toBe(true);
  });
  expect(view.items.filter((item) => item.kind === 'highlight')).toHaveLength(1);
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    type: 'gv.highlight.deleteStored',
    payload: {
      platform: item.platform,
      accountHash: item.accountHash,
      conversationId: item.conversationId,
      id: item.id,
    },
  });
  expect(view.items.find((item) => item.kind === 'highlight')?.accountHash).not.toBe(
    item.accountHash,
  );
});

it('an old source removal cannot hide rows after the popup changes source', async () => {
  await render();
  holdRemoval = true;
  let removing: Promise<boolean>;
  await act(async () => {
    removing = view.remove(view.items.find((item) => item.kind === 'starred')!);
  });
  await render(async () => null);
  await act(async () => {
    pendingRemoval?.({ ok: true });
    expect(await removing).toBe(false);
  });
  expect(container.textContent).toContain('Saved star');
});

it('an external addition during removal remains visible after the removal is acknowledged', async () => {
  await render();
  holdRemoval = true;
  let removing: Promise<boolean>;
  await act(async () => {
    removing = view.remove(view.items.find((item) => item.kind === 'starred')!);
  });
  const addition = { ...stars[0], turnId: 'two', content: 'Added elsewhere' };
  stars.push(addition);
  holdRead = true;
  await act(async () => {
    for (const listener of listeners)
      listener({ [StorageKeys.SAVED_LIBRARY_STARS]: { newValue: snapshot(stars) } }, 'local');
  });
  const staleRead = pendingRead;
  const staleStars = [...stars];
  stars = [addition];
  holdRead = false;
  await act(async () => {
    pendingRemoval?.({ ok: true });
    expect(await removing).toBe(true);
  });
  await act(async () => {
    staleRead?.({ ok: true, data: snapshot(staleStars) });
  });
  expect(container.textContent).toContain('Added elsewhere');
  expect(container.textContent).not.toContain('Saved star');
});

it('a failed removal still shows an item another tab deleted meanwhile', async () => {
  stars.push({ ...stars[0], turnId: 'deleted-elsewhere', content: 'Deleted elsewhere' });
  await render();
  expect(container.textContent).toContain('Deleted elsewhere');
  stars = stars.filter((star) => star.turnId !== 'deleted-elsewhere');
  holdRead = true;
  await act(async () => {
    for (const listener of listeners)
      listener({ [StorageKeys.SAVED_LIBRARY_STARS]: { newValue: snapshot(stars) } }, 'local');
  });
  const externalRead = pendingRead;
  const externalSnapshot = snapshot(stars);
  holdRemoval = true;
  let removing: Promise<boolean>;
  await act(async () => {
    removing = view.remove(
      view.items.find((item) => item.kind === 'starred' && item.turnId === 'one')!,
    );
  });
  holdRead = false;
  await act(async () => {
    pendingRemoval?.({ ok: false, error: 'Storage unavailable' });
    expect(await removing).toBe(false);
  });
  await act(async () => {
    externalRead?.({ ok: true, data: externalSnapshot });
  });
  expect(container.textContent).toContain('Saved star');
  expect(container.textContent).not.toContain('Deleted elsewhere');
  expect(view.notice?.error).toBe(true);
  expect(view.loading).toBe(false);
});

it('a deleted star stays gone when the reload after deleting fails', async () => {
  await render();
  starReadFails = true;
  notifyRemovals = true;
  await act(async () => {
    expect(await view.remove(view.items.find((item) => item.kind === 'starred')!)).toBe(true);
  });
  expect(container.textContent).toBe('Saved highlight');
  expect(view.error).toBe(true);
  expect(view.loading).toBe(false);
});

it('a deleted highlight stays gone when the reload after deleting fails', async () => {
  highlights.push({ ...highlights[0], accountHash: 'other-account' });
  await render();
  const item = view.items.find((item) => item.kind === 'highlight')!;
  highlightReadFails = true;
  notifyRemovals = true;
  await act(async () => {
    expect(await view.remove(item)).toBe(true);
  });
  const remaining = view.items.filter((item) => item.kind === 'highlight');
  expect(remaining).toHaveLength(1);
  expect(remaining[0].id).toBe(item.id);
  expect(remaining[0].accountHash).not.toBe(item.accountHash);
  expect(container.textContent).toContain('Saved star');
  expect(view.error).toBe(true);
  expect(view.loading).toBe(false);
});
