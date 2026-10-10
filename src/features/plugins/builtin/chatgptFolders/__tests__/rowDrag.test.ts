// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
/**
 * Dragging a row of ChatGPT's own sidebar onto a Voyager folder, against the
 * real store, section and panel. The drag is the pointer gesture ChatGPT's own
 * row drag runs on. jsdom has no layout, so `screen` stands in for the
 * browser's hit testing (`elementsFromPoint`).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { treeDriver } from '@/pages/content/folder/floatingTree/__tests__/treeDriver';
import { toastDriver } from '@/tests/toastDriver';
import { initI18n } from '@/utils/i18n';

import { activateChatGptFolders } from '../index';
import { type SidebarFixture, makeRows, mountSidebarFixture } from './chatgptSidebarFixture';
import { type MemoryStorage, createMemoryStorage, settle } from './memoryStorage';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: { id: 'test-extension-id' },
    i18n: { getUILanguage: () => 'en' },
  },
}));

const KEY = StorageKeys.FOLDER_DATA_CHATGPT;
const ROWS = makeRows(4);
const TARGET = ROWS[2];
const FILED = {
  conversationId: `chatgpt:conv:${TARGET.id}`,
  title: TARGET.title,
  url: `https://chatgpt.com/c/${TARGET.id}`,
};
const DATA: FolderData = {
  folders: [
    {
      id: 'work',
      name: 'Work',
      parentId: null,
      isExpanded: true,
      sortIndex: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'trips',
      name: 'Trips',
      parentId: null,
      isExpanded: true,
      sortIndex: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  folderContents: { work: [], trips: [], [ROOT_CONVERSATIONS_ID]: [] },
};
const HIGHLIGHT = 'gv-floating-folder-panel__drop-target';

type Point = { readonly x: number; readonly y: number };

/**
 * The browser's hit testing, for jsdom: `place` stacks elements (top first) at
 * a point of their own, where `elementsFromPoint` finds each with its ancestors
 * and hosts, under the row being dragged (dnd-kit carries it along under the
 * pointer). Each root sees the stack retargeted to itself, as browsers do.
 */
function fakeScreen() {
  const spots = new Map<string, readonly Element[]>();
  let free = 100;
  let carried: Element | null = null;

  const withAncestors = (element: Element): Element[] => {
    const chain: Element[] = [];
    for (let node: Node | null = element; node;) {
      if (node instanceof Element) chain.push(node);
      node = node instanceof ShadowRoot ? node.host : node.parentNode;
    }
    return chain;
  };
  const stackAt = (x: number, y: number): Element[] => {
    const hits = spots.get(`${x},${y}`) ?? [];
    if (hits.length === 0) return [];
    return [...(carried ? [carried] : []), ...hits.flatMap(withAncestors)];
  };
  const retarget = (element: Element, scope: Document | ShadowRoot): Element => {
    let current = element;
    for (let root = current.getRootNode(); root !== scope && root instanceof ShadowRoot;) {
      current = root.host;
      root = current.getRootNode();
    }
    return current;
  };
  function elementsFromPoint(this: Document | ShadowRoot, x: number, y: number): Element[] {
    return [...new Set(stackAt(x, y).map((element) => retarget(element, this)))];
  }
  const prototypes = [Document.prototype, ShadowRoot.prototype];
  const saved = prototypes.map((proto) =>
    Object.getOwnPropertyDescriptor(proto, 'elementsFromPoint'),
  );
  for (const proto of prototypes) {
    Object.defineProperty(proto, 'elementsFromPoint', {
      value: elementsFromPoint,
      configurable: true,
    });
  }

  return {
    place(elements: Element | readonly Element[], at: Point = { x: (free += 50), y: 300 }): Point {
      spots.set(`${at.x},${at.y}`, elements instanceof Element ? [elements] : elements);
      return at;
    },
    carry(element: Element | null): void {
      carried = element;
    },
    restore(): void {
      prototypes.forEach((proto, index) => {
        const descriptor = saved[index];
        if (descriptor) Object.defineProperty(proto, 'elementsFromPoint', descriptor);
        else Reflect.deleteProperty(proto, 'elementsFromPoint');
      });
    },
  };
}

let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
let scope: PluginScope;
let sidebar: SidebarFixture;
let screen: ReturnType<typeof fakeScreen>;

beforeAll(async () => {
  memory = createMemoryStorage();
  originalStorage = globalThis.chrome.storage;
  globalThis.chrome.storage = memory.api;
  await initI18n();
  globalThis.chrome.storage = originalStorage;
});

beforeEach(() => {
  memory = createMemoryStorage();
  originalStorage = globalThis.chrome.storage;
  globalThis.chrome.storage = memory.api;
  memory.values.local.set(KEY, structuredClone(DATA));
  scope = new PluginScope();
  sidebar = mountSidebarFixture(ROWS);
  screen = fakeScreen();
});

afterEach(async () => {
  await scope.dispose();
  screen.restore();
  sidebar.destroy();
  document.body.replaceChildren();
  globalThis.chrome.storage = originalStorage;
});

async function nextPass(): Promise<void> {
  await settle(5);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await settle(20);
}

function shadowOf(selector: string): ShadowRoot {
  const host = document.querySelector<HTMLElement>(selector);
  if (!host?.shadowRoot) throw new Error(`${selector} is not mounted`);
  return host.shadowRoot;
}

async function activate() {
  await activateChatGptFolders(scope);
  await nextPass();
  const root = shadowOf('.gv-chatgpt-folder-section');
  return { view: treeDriver({ root, rootBucketId: ROOT_CONVERSATIONS_ID }), root };
}

function link(id: string): HTMLAnchorElement {
  return sidebar.row(id).querySelector('a')!;
}

const START: Point = { x: 20, y: 40 };

function pointer(type: string, target: EventTarget, at: Point): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    isPrimary: true,
    pointerId: 1,
    clientX: at.x,
    clientY: at.y,
  });
  target.dispatchEvent(event);
  return event;
}

/** Presses a row's title, as a drag of it starts. */
function pressRow(id: string, at: Point = START): PointerEvent {
  screen.carry(link(id));
  return pointer('pointerdown', link(id).querySelector('[data-thread-title]')!, at);
}

// Sent to the pressed link: dnd-kit's dragged row and pointer capture keep the
// events' target on the row wherever the pointer is.
function moveTo(id: string, at: Point): void {
  pointer('pointermove', link(id), { x: at.x - 30, y: at.y });
  pointer('pointermove', link(id), at);
}

function releaseAt(id: string, at: Point): PointerEvent {
  return pointer('pointerup', link(id), at);
}

/** Presses a row, drags it over `target` and lets go there. */
function dragRowOnto(id: string, target: Element): void {
  pressRow(id);
  const at = screen.place(target);
  moveTo(id, at);
  releaseAt(id, at);
}

function stored(): FolderData {
  return memory.values.local.get(KEY) as FolderData;
}

function folderWrites(): number {
  return memory.writes.filter((write) => write.area === 'local' && write.key === KEY).length;
}

function status(): string {
  return toastDriver.messages().join('\n');
}

describe('dragging a ChatGPT sidebar row onto a folder', () => {
  it('dragging a recents row onto a folder files it', async () => {
    const { view } = await activate();

    dragRowOnto(TARGET.id, view.folderNameElement('Trips'));
    await nextPass();

    expect(stored().folderContents.trips).toEqual([expect.objectContaining(FILED)]);
    expect(stored().folderContents.work).toEqual([]);
    expect(view.outline()).toEqual(['Work', 'Trips', `  · ${TARGET.title}`]);
    expect(status()).toBe('Added to folder.');
  });

  it('puts the row after what the folder already holds, as on Gemini', async () => {
    const other = ROWS[0];
    const held = {
      conversationId: `chatgpt:conv:${other.id}`,
      title: other.title,
      url: `https://chatgpt.com/c/${other.id}`,
      addedAt: 1,
      sortIndex: 0,
    };
    memory.values.local.set(KEY, {
      ...structuredClone(DATA),
      folderContents: { ...DATA.folderContents, trips: [held] },
    });
    const { view } = await activate();

    dragRowOnto(TARGET.id, view.folderNameElement('Trips'));
    await nextPass();

    const order = stored().folderContents.trips.toSorted(
      (a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0),
    );
    expect(order.map((c) => c.conversationId)).toEqual([held.conversationId, FILED.conversationId]);
    expect(view.outline()).toEqual(['Work', 'Trips', `  · ${other.title}`, `  · ${TARGET.title}`]);
  });

  it('lights the folder under a dragged row, and only while it is there', async () => {
    const { view } = await activate();
    const work = screen.place(view.folderNameElement('Work'));
    const trips = screen.place(view.folderNameElement('Trips'));

    pressRow(TARGET.id);
    moveTo(TARGET.id, work);
    expect(view.folderRow('Work').classList.contains(HIGHLIGHT)).toBe(true);
    moveTo(TARGET.id, trips);
    expect(view.folderRow('Work').classList.contains(HIGHLIGHT)).toBe(false);
    expect(view.folderRow('Trips').classList.contains(HIGHLIGHT)).toBe(true);
    releaseAt(TARGET.id, trips);

    expect(view.folderRow('Trips').classList.contains(HIGHLIGHT)).toBe(false);
  });

  it('writes nothing and says so when the row is dragged onto the folder it is already in', async () => {
    memory.values.local.set(KEY, {
      ...structuredClone(DATA),
      folderContents: { ...DATA.folderContents, trips: [{ ...FILED, addedAt: 1, sortIndex: 0 }] },
    });
    const { view } = await activate();
    const before = folderWrites();

    dragRowOnto(TARGET.id, view.folderNameElement('Trips'));
    await nextPass();

    expect(folderWrites()).toBe(before);
    expect(stored().folderContents.trips).toEqual([{ ...FILED, addedAt: 1, sortIndex: 0 }]);
    expect(status()).toBe('Already in this folder.');
  });

  it('dragging a recents row onto a floating panel folder files it', async () => {
    memory.values.local.set(StorageKeys.CHATGPT_FOLDER_PANEL, { open: true });
    // The panel stands in only while there is no Recents to put the section
    // by: here the sidebar lists the rows under a Project instead.
    sidebar.sidebar
      .querySelector('[data-sidebar-project-container-id="chats"]')!
      .setAttribute('data-sidebar-project-container-id', 'g-p-trips');
    await activateChatGptFolders(scope);
    await nextPass();
    const panel = treeDriver({
      root: shadowOf('.gv-floating-folder-panel'),
      rootBucketId: ROOT_CONVERSATIONS_ID,
    });

    dragRowOnto(TARGET.id, panel.folderNameElement('Work'));
    await nextPass();

    expect(stored().folderContents.work).toEqual([expect.objectContaining(FILED)]);
  });

  it('a click without movement files nothing and still opens the chat', async () => {
    const { view } = await activate();
    const before = folderWrites();
    // A folder right where the press is, so only the missing movement keeps it out.
    screen.place(view.folderNameElement('Trips'), START);

    const down = pressRow(TARGET.id);
    const up = releaseAt(TARGET.id, START);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link(TARGET.id).dispatchEvent(click);
    await nextPass();

    expect(folderWrites()).toBe(before);
    expect([down.defaultPrevented, up.defaultPrevented, click.defaultPrevented]).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('a press that moves less than the drag threshold files nothing', async () => {
    const { view } = await activate();
    const before = folderWrites();
    const nearby = screen.place(view.folderNameElement('Trips'), { x: START.x + 3, y: START.y });

    pressRow(TARGET.id);
    pointer('pointermove', link(TARGET.id), nearby);
    releaseAt(TARGET.id, nearby);
    await nextPass();

    expect(folderWrites()).toBe(before);
    expect(view.folderRow('Trips').classList.contains(HIGHLIGHT)).toBe(false);
  });

  it.each([
    ['pointercancel', () => pointer('pointercancel', link(TARGET.id), START)],
    [
      'Escape',
      () =>
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    ],
    ['the window losing focus', () => window.dispatchEvent(new FocusEvent('blur'))],
  ])('%s mid-drag files nothing', async (_cause, interrupt) => {
    const { view } = await activate();
    const before = folderWrites();
    const trips = screen.place(view.folderNameElement('Trips'));

    pressRow(TARGET.id);
    moveTo(TARGET.id, trips);
    interrupt();
    expect(view.folderRow('Trips').classList.contains(HIGHLIGHT)).toBe(false);
    releaseAt(TARGET.id, trips);
    await nextPass();

    expect(folderWrites()).toBe(before);
  });

  it('releasing a dragged row outside a folder files nothing', async () => {
    const { view } = await activate();
    const before = folderWrites();
    const elsewhere = screen.place(document.body);

    pressRow(TARGET.id);
    moveTo(TARGET.id, screen.place(view.folderNameElement('Trips')));
    moveTo(TARGET.id, elsewhere);
    expect(view.folderRow('Trips').classList.contains(HIGHLIGHT)).toBe(false);
    releaseAt(TARGET.id, elsewhere);
    await nextPass();

    expect(folderWrites()).toBe(before);
  });

  it('releasing a dragged row on the section heading files it at the root, as on Gemini', async () => {
    const { root } = await activate();
    const heading = root.querySelector<HTMLElement>('.gv-chatgpt-folder-section__header')!;
    const at = screen.place(heading);

    pressRow(TARGET.id);
    moveTo(TARGET.id, at);
    expect(heading.classList.contains(HIGHLIGHT)).toBe(true);
    releaseAt(TARGET.id, at);
    await nextPass();

    expect(heading.classList.contains(HIGHLIGHT)).toBe(false);
    expect(stored().folderContents[ROOT_CONVERSATIONS_ID]).toEqual([
      expect.objectContaining(FILED),
    ]);
  });

  it('a conversation link outside the sidebar does not drag into folders', async () => {
    const { view } = await activate();
    const before = folderWrites();
    const inChat = document.createElement('a');
    inChat.href = `/c/${TARGET.id}`;
    document.body.append(inChat);
    const trips = screen.place(view.folderNameElement('Trips'));

    pointer('pointerdown', inChat, START);
    pointer('pointermove', inChat, trips);
    pointer('pointerup', inChat, trips);
    await nextPass();

    expect(folderWrites()).toBe(before);
  });

  it("ChatGPT's own row drag still sees every pointer event, uncancelled", async () => {
    const { view } = await activate();
    const seen: string[] = [];
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
      sidebar.sidebar.addEventListener(type, (event) => {
        if (!event.defaultPrevented) seen.push(type);
      });
    }

    dragRowOnto(TARGET.id, view.folderNameElement('Trips'));

    expect(seen).toEqual(['pointerdown', 'pointermove', 'pointermove', 'pointerup']);
  });

  it('turning the plugin off mid-drag files nothing and clears the highlight', async () => {
    const { view } = await activate();
    const before = folderWrites();
    const trips = screen.place(view.folderNameElement('Trips'));
    pressRow(TARGET.id);
    moveTo(TARGET.id, trips);
    const lit = view.folderRow('Trips');

    await scope.dispose();
    releaseAt(TARGET.id, trips);
    await nextPass();

    expect(lit.classList.contains(HIGHLIGHT)).toBe(false);
    expect(folderWrites()).toBe(before);
  });

  it('still moves a folder row dropped on another folder', async () => {
    memory.values.local.set(KEY, {
      ...structuredClone(DATA),
      folderContents: { ...DATA.folderContents, work: [{ ...FILED, addedAt: 1, sortIndex: 0 }] },
    });
    const { view } = await activate();

    view.drop(view.folderRow('Trips'), view.dragRow('work', TARGET.title));
    await nextPass();

    expect(stored().folderContents.work).toEqual([]);
    expect(stored().folderContents.trips).toEqual([expect.objectContaining(FILED)]);
  });
});
