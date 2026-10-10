/**
 * Pins how AI Studio places a dropped prompt and merges an imported file today.
 * A prompt lives in exactly one bucket: a drop removes it from every other
 * bucket (root, folders and orphans), appends without a sortIndex and keeps a
 * record the target already holds. Import merges folder buckets only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AISTUDIO_ROOT_BUCKET_ID } from '@/features/folder/constants';
import { toastDriver } from '@/tests/toastDriver';

import { AIStudioFolderManager } from '../aistudio';
import type { TreeActions } from '../floatingTree/shared';
import type { ConversationReference, FolderData } from '../types';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: { get: vi.fn(), set: vi.fn() },
      local: { get: vi.fn(), set: vi.fn() },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      id: 'test-extension-id',
      lastError: null,
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      sendMessage: vi.fn(),
    },
  },
}));

const NOW = 1_700_000_000_000;
const ROOT = AISTUDIO_ROOT_BUCKET_ID;

type Internals = {
  dataSession: { ready: boolean };
  data: FolderData;
  save: () => Promise<boolean>;
  render: () => void;
  replaceData: (data: FolderData) => Promise<boolean>;
  treeActions: () => TreeActions;
  library: { mountDropZone: () => void };
  transfer: { importFile: () => void };
  destroy: () => void;
};

const managers: Internals[] = [];

function createManager(initial: FolderData): Internals {
  const internals = new AIStudioFolderManager() as unknown as Internals;
  internals.dataSession.ready = true;
  internals.data = structuredClone(initial);
  internals.save = vi.fn().mockResolvedValue(true);
  internals.render = vi.fn();
  managers.push(internals);
  return internals;
}

function folder(id: string, parentId: string | null = null) {
  return { id, name: `Folder ${id}`, parentId, isExpanded: true, createdAt: 1, updatedAt: 1 };
}

function prompt(id: string, extra: Partial<ConversationReference> = {}): ConversationReference {
  return {
    conversationId: id,
    title: `Prompt ${id}`,
    url: `/prompts/${id}`,
    addedAt: 10,
    ...extra,
  };
}

function dropEvent(payload: unknown): DragEvent {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
  const json = JSON.stringify(payload);
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: (type: string) => (type === 'application/json' ? json : '') },
  });
  return event;
}

function ids(manager: Internals): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(manager.data.folderContents).map(([key, list]) => [
      key,
      list.map((c) => c.conversationId),
    ]),
  );
}

const initial: FolderData = {
  folders: [folder('a'), folder('b'), folder('child', 'a')],
  folderContents: {
    a: [prompt('p1'), prompt('p2')],
    b: [prompt('p3', { customTitle: true, title: 'Renamed', lastOpenedAt: 5 })],
    child: [],
    [ROOT]: [prompt('p4'), prompt('p1')],
    orphan: [prompt('p1')],
  },
};

/** Each entry point with the AI Studio drop semantics, driven through its own DOM. */
const dropTargets: Array<{
  name: string;
  drop: (manager: Internals, target: string | null, payload: unknown) => Promise<void>;
}> = [
  {
    name: 'sidebar tree',
    drop: async (manager, target, payload) => {
      manager.treeActions().onDrop!(dropEvent(payload), target ?? ROOT);
      await vi.advanceTimersByTimeAsync(0);
    },
  },
  {
    name: 'library floating drop zone',
    drop: async (manager, target, payload) => {
      const table = document.createElement('table');
      table.className = 'mat-mdc-table';
      table.innerHTML = '<tr class="mat-mdc-row"><td><a href="/prompts/row">Row</a></td></tr>';
      document.body.appendChild(table);
      manager.library.mountDropZone();
      table.querySelector('tr')!.dispatchEvent(new Event('dragstart', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(0);
      const item =
        target === null || target === ROOT
          ? document.querySelector<HTMLElement>('.gv-library-root-item')
          : document.querySelector<HTMLElement>(
              `.gv-library-folder-item[data-folder-id="${target}"]`,
            );
      item!.dispatchEvent(dropEvent(payload));
      await vi.advanceTimersByTimeAsync(0);
    },
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  for (const internals of managers.splice(0)) {
    try {
      internals.destroy();
    } catch {}
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe.each(dropTargets)('AI Studio $name', ({ drop }) => {
  it('moves a prompt into a folder, removing it from every other bucket', async () => {
    const manager = createManager(initial);
    await drop(manager, 'b', {
      type: 'conversation',
      conversationId: 'p1',
      title: '  New   name ',
    });

    expect(ids(manager)).toEqual({
      a: ['p2'],
      b: ['p3', 'p1'],
      child: [],
      [ROOT]: ['p4'],
      orphan: [],
    });
    // The stored record moves as stored; the payload title is not applied.
    expect(manager.data.folderContents.b[1]).toEqual(prompt('p1'));
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('keeps the record a folder already holds and still clears the others', async () => {
    const manager = createManager(initial);
    await drop(manager, 'a', {
      type: 'conversation',
      conversationId: 'p1',
      title: 'Other',
      url: 'https://aistudio.google.com/prompts/p1',
    });

    expect(ids(manager)).toEqual({
      a: ['p1', 'p2'],
      b: ['p3'],
      child: [],
      [ROOT]: ['p4'],
      orphan: [],
    });
    expect(manager.data.folderContents.a[0]).toEqual(prompt('p1'));
  });

  it('moves a prompt to the root bucket with its stored record', async () => {
    const manager = createManager(initial);
    const stored = manager.data.folderContents.b[0];
    await drop(manager, null, {
      type: 'conversation',
      conversationId: 'p3',
      title: '',
      url: '/prompts/p3',
    });

    expect(ids(manager)).toEqual({
      a: ['p1', 'p2'],
      b: [],
      child: [],
      [ROOT]: ['p4', 'p1', 'p3'],
      orphan: ['p1'],
    });
    // The rename and open time travel with the move.
    expect(manager.data.folderContents[ROOT][2]).toEqual(
      prompt('p3', { customTitle: true, title: 'Renamed', lastOpenedAt: 5 }),
    );
    expect(manager.data.folderContents[ROOT][2]).not.toBe(stored);
  });

  it('carries the copy from the bucket the prompt was dragged out of', async () => {
    const fromA = prompt('p5', { title: 'Copy A', lastOpenedAt: 1 });
    const fromB = prompt('p5', {
      title: 'Copy B',
      customTitle: true,
      starred: true,
      lastOpenedAt: 7,
    });
    const manager = createManager({
      folders: [folder('a'), folder('b'), folder('c')],
      folderContents: { a: [fromA], b: [fromB], c: [] },
    });
    await drop(manager, 'c', {
      type: 'conversation',
      conversationId: 'p5',
      title: 'Copy B',
      url: '/prompts/p5',
      sourceFolderId: 'b',
    });

    expect(ids(manager)).toEqual({ a: [], b: [], c: ['p5'] });
    expect(manager.data.folderContents.c[0]).toEqual(fromB);
  });

  // A drag payload is page-readable data: an inherited key is no source bucket.
  it.each(['b', '__proto__', 'constructor'])(
    'falls back to any stored copy when source %s does not hold the prompt',
    async (sourceFolderId) => {
      const fromA = prompt('p5', { title: 'Copy A', lastOpenedAt: 1 });
      const manager = createManager({
        folders: [folder('a'), folder('b'), folder('c')],
        folderContents: { a: [fromA], b: [], c: [] },
      });
      await drop(manager, 'c', {
        type: 'conversation',
        conversationId: 'p5',
        title: 'Payload',
        sourceFolderId,
      });

      expect(ids(manager)).toEqual({ a: [], b: [], c: ['p5'] });
      expect(manager.data.folderContents.c[0]).toEqual(fromA);
    },
  );

  it('builds the record from the payload only for a prompt no bucket holds', async () => {
    const manager = createManager(initial);
    await drop(manager, 'a', {
      type: 'conversation',
      conversationId: 'p9',
      title: '  ',
      url: '/prompts/p9',
    });
    expect(manager.data.folderContents.a[2]).toEqual({
      conversationId: 'p9',
      title: 'Untitled',
      url: '/prompts/p9',
      addedAt: NOW,
    });
  });

  it('creates a missing target bucket and never adds a sortIndex', async () => {
    const manager = createManager({ folders: [folder('a')], folderContents: {} });
    await drop(manager, 'a', { type: 'conversation', conversationId: 'p9', title: 'P9' });
    expect(manager.data.folderContents).toEqual({
      a: [{ conversationId: 'p9', title: 'P9', url: '', addedAt: NOW }],
    });
  });
});

describe('AI Studio sidebar drop zone', () => {
  it('treats the root bucket id as the root target', async () => {
    const manager = createManager(initial);
    await dropTargets[0].drop(manager, ROOT, {
      type: 'conversation',
      conversationId: 'p2',
      title: 'P2',
    });
    expect(ids(manager)[ROOT]).toEqual(['p4', 'p1', 'p2']);
    expect(ids(manager).a).toEqual(['p1']);
    expect(manager.render).toHaveBeenCalled();
  });

  it('saves even when the drop changes nothing', async () => {
    const manager = createManager({
      folders: [folder('a')],
      folderContents: { a: [prompt('p1')] },
    });
    await dropTargets[0].drop(manager, 'a', {
      type: 'conversation',
      conversationId: 'p1',
      title: '',
    });
    expect(manager.data.folderContents).toEqual({ a: [prompt('p1')] });
    expect(manager.save).toHaveBeenCalledTimes(1);
  });
});

describe('AI Studio library floating drop zone', () => {
  const lastNotice = () => toastDriver.all().at(-1);

  it('confirms the move after saving', async () => {
    const manager = createManager(initial);
    await dropTargets[1].drop(manager, 'b', {
      type: 'conversation',
      conversationId: 'p2',
      title: 'P2',
    });
    expect(lastNotice()).toMatchObject({ message: 'Added to "Folder b"', tone: 'info' });
    await dropTargets[1].drop(manager, null, {
      type: 'conversation',
      conversationId: 'p2',
      title: 'P2',
    });
    expect(lastNotice()).toMatchObject({ message: 'Saved to Uncategorized', tone: 'info' });
  });
});

describe('AI Studio import', () => {
  async function importText(manager: Internals, text: string): Promise<void> {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const createElement = vi.spyOn(document, 'createElement');
    manager.transfer.importFile();
    const input = createElement.mock.results
      .map((result) => result.value as HTMLElement)
      .find((element): element is HTMLInputElement => element instanceof HTMLInputElement)!;
    createElement.mockRestore();
    const file = { text: async () => text } as unknown as File;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await vi.advanceTimersByTimeAsync(0);
  }

  function imported(manager: Internals): FolderData {
    return vi.mocked(manager.replaceData).mock.calls[0][0];
  }

  const lastNotice = () => toastDriver.all().at(-1);

  const exported = {
    format: 'gemini-voyager.folders.v1',
    exportedAt: '2026-01-01T00:00:00.000Z',
    data: {
      folders: [folder('a'), folder('new')],
      folderContents: {
        a: [prompt('p1', { title: 'Imported p1' }), prompt('p5'), prompt('p5')],
        new: [prompt('p6')],
        [ROOT]: [prompt('p7')],
        stray: [prompt('p8')],
      },
    },
  };

  it('merges folder buckets only, appending unseen prompts', async () => {
    const manager = createManager({
      folders: [folder('a')],
      folderContents: { a: [prompt('p1')], [ROOT]: [prompt('p4')] },
    });
    manager.replaceData = vi.fn().mockResolvedValue(true);

    await importText(manager, JSON.stringify(exported));

    expect(imported(manager)).toEqual({
      folders: [folder('a'), folder('new')],
      folderContents: {
        a: [prompt('p1'), prompt('p5'), prompt('p5')],
        new: [prompt('p6')],
        [ROOT]: [prompt('p4')],
      },
    });
    // The counts are what the merge added; the file's repeated prompts count as they are
    // appended. A file repeating a folder id is refused (aistudioPersistence.test.ts).
    expect(lastNotice()).toMatchObject({
      message: '✓ Imported 1 folders, 3 conversations',
      tone: 'success',
    });
  });

  it('drafts the merge on a copy that shares nothing with live data', async () => {
    const manager = createManager({
      folders: [folder('a')],
      folderContents: { a: [prompt('p1')] },
    });
    manager.replaceData = vi.fn().mockResolvedValue(true);
    const live = manager.data;
    await importText(
      manager,
      JSON.stringify({ folders: [folder('a')], folderContents: { a: [prompt('p2')] } }),
    );
    const draft = imported(manager);
    expect(draft.folders[0]).not.toBe(live.folders[0]);
    expect(draft.folderContents.a[0]).not.toBe(live.folderContents.a[0]);
    expect(live.folderContents.a).toEqual([prompt('p1')]);
  });

  it('accepts bare folder data without the export envelope', async () => {
    const manager = createManager({ folders: [], folderContents: {} });
    manager.replaceData = vi.fn().mockResolvedValue(true);
    await importText(
      manager,
      JSON.stringify({ folders: [folder('x')], folderContents: { x: [prompt('p1')] } }),
    );
    expect(imported(manager)).toEqual({
      folders: [folder('x')],
      folderContents: { x: [prompt('p1')] },
    });
  });

  it('gives a new folder an empty bucket and keeps malformed entries', async () => {
    const manager = createManager({ folders: [], folderContents: {} });
    manager.replaceData = vi.fn().mockResolvedValue(true);
    const nameless = { id: 'n', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 };
    await importText(
      manager,
      JSON.stringify({
        format: 'gemini-voyager.folders.v1',
        data: {
          folders: [folder('e'), nameless],
          folderContents: { n: [{ conversationId: 'p1', title: '' }] },
        },
      }),
    );
    expect(imported(manager)).toEqual({
      folders: [folder('e'), nameless],
      folderContents: { e: [], n: [{ conversationId: 'p1', title: '' }] },
    });
  });

  it('replaces an orphan bucket that a new folder takes over', async () => {
    const manager = createManager({ folders: [], folderContents: { x: [prompt('old')] } });
    manager.replaceData = vi.fn().mockResolvedValue(true);
    await importText(
      manager,
      JSON.stringify({ folders: [folder('x')], folderContents: { x: [prompt('p1')] } }),
    );
    expect(imported(manager).folderContents).toEqual({ x: [prompt('p1')] });
  });

  it('rejects a payload without folders and reports unparsable text', async () => {
    const manager = createManager({ folders: [], folderContents: {} });
    manager.replaceData = vi.fn().mockResolvedValue(true);
    await importText(manager, JSON.stringify({ data: { folders: 'no', folderContents: {} } }));
    expect(lastNotice()).toMatchObject({
      message: 'Invalid file format. Please select a valid folder configuration file.',
      tone: 'error',
    });
    await importText(manager, 'not json {}');
    expect(lastNotice()?.message).toMatch(/^✗ Import failed: SyntaxError: /);
    expect(lastNotice()?.tone).toBe('error');
    expect(manager.replaceData).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
});
