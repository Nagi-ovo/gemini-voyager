/**
 * The folder UI surfaces as they exist on main 49bd6eec. Each `bench*` function
 * returns rows with stable surface/dataset/metric names; a rewrite keeps those
 * names and swaps how the surface is mounted, so the tables line up.
 */
import type { FolderData } from '@/core/types/folder';
import { openFolderPicker } from '@/features/plugins/builtin/chatgptFolders/chatgptFolderPicker';
import { ChatGptFolderSection } from '@/features/plugins/builtin/chatgptFolders/chatgptFolderSection';
import { ChatGptHideFiled } from '@/features/plugins/builtin/chatgptFolders/chatgptHideFiled';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { mountFloatingPanel } from '@/pages/content/folder/floatingPanel';

import {
  type DatasetName,
  ROOT_BUCKET_ID,
  createRandom,
  pickBusiestFolder,
  withExpansion,
  withRenamedFolder,
} from '../datasets';
import type { BenchResult } from '../stats';
import { collect, notApplicable } from './collect';
import { createGeminiSidebar } from './geminiSidebar';
import { countElements, sleep } from './timing';

export interface RunCounts {
  /** Mount runs: each one builds and tears down a whole surface. */
  readonly mount: number;
  /** Runs of a single interaction on a mounted surface. */
  readonly interaction: number;
}

/** Each keystroke is one sample: type a word, then clear the field. */
const SEARCH_KEYSTROKES = ['p', 'pr', 'pro', 'proj', ''] as const;

const EXPANSIONS = [
  { expanded: true, label: 'all expanded' },
  { expanded: false, label: 'all collapsed' },
] as const;

function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

// --- Gemini sidebar: FolderSidebarView (shared tree in the nav) -------------

export async function benchGeminiSidebar(
  dataset: DatasetName,
  data: FolderData,
  counts: RunCounts,
): Promise<BenchResult[]> {
  const surface = 'gemini-sidebar (FolderSidebarView)';
  const results: BenchResult[] = [];
  const target = pickBusiestFolder(data);

  for (const { expanded, label } of EXPANSIONS) {
    const shaped = withExpansion(data, expanded);
    results.push(
      await collect({
        surface,
        dataset,
        metric: `mount (${label})`,
        runs: counts.mount,
        setup: () => createGeminiSidebar(shaped),
        action: (sidebar) => sidebar.start(),
        after: (sidebar) => countElements(sidebar.runtime.panel),
        teardown: (sidebar) => sidebar.destroy(),
      }),
    );

    // A rename arrives as a `data` change: the panel rebuilds its list.
    const sidebar = await createGeminiSidebar(shaped);
    await sidebar.start();
    results.push(
      await collect({
        surface,
        dataset,
        metric: `data change: rename one folder (${label})`,
        runs: counts.interaction,
        setup: (run) => {
          sidebar.store.data = withRenamedFolder(sidebar.store.data, target, `Renamed ${run}`);
        },
        action: () => sidebar.refresh(),
      }),
    );
    sidebar.destroy();
  }

  // Search and selection on the fully expanded tree, the largest DOM.
  const sidebar = await createGeminiSidebar(withExpansion(data, true));
  await sidebar.start();
  const panel = sidebar.runtime.panel!;
  const search = panel.querySelector<HTMLInputElement>('.gv-folder-search-input');
  results.push(
    search
      ? await collect({
          surface,
          dataset,
          metric: 'search typing (per keystroke, incl. 200 ms-debounced re-render)',
          runs: counts.interaction * SEARCH_KEYSTROKES.length,
          warmup: SEARCH_KEYSTROKES.length,
          setup: () => undefined,
          action: (_state, run) =>
            typeInto(search, SEARCH_KEYSTROKES[run % SEARCH_KEYSTROKES.length]),
        })
      : notApplicable(surface, dataset, 'search typing', 'search input not rendered'),
  );
  typeInto(search!, '');
  await sleep(300);

  // The tree renders in a shadow root under the panel's list.
  const tree = () => panel.querySelector('.gv-folder-tree-host')?.shadowRoot ?? null;
  const rows = () =>
    Array.from(
      tree()?.querySelectorAll<HTMLElement>(
        `.gv-floating-folder-panel__conv[data-folder-id="${CSS.escape(target)}"]`,
      ) ?? [],
    );
  const first = rows()[0];
  if (first && rows().length > 1) {
    // Long-press enters multi-select; later clicks toggle rows in that folder.
    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(650);
    first.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    const others = rows().slice(1);
    const engaged = tree()?.querySelector('.gv-floating-folder-panel__conv--selected') != null;
    const toggle = await collect({
      surface,
      dataset,
      metric: 'selection toggle (multi-select click)',
      runs: counts.interaction,
      setup: () => undefined,
      action: (_state, run) => {
        const row = others[Math.floor(run / 2) % others.length];
        row.querySelector<HTMLAnchorElement>('a.gv-floating-folder-panel__conv-title')?.click();
      },
    });
    results.push(engaged ? toggle : { ...toggle, note: 'multi-select did not engage' });
  } else {
    results.push(
      notApplicable(surface, dataset, 'selection toggle', 'busiest folder has under two rows'),
    );
  }
  sidebar.destroy();
  return results;
}

// --- Shared floating FolderTree (floating panel) -----------------------------

const noTreeActions = {
  onNavigate: () => {},
  onCreateFolder: () => {},
  onRenameFolder: () => {},
  onDeleteFolder: () => {},
  onRemoveConversation: () => {},
  onToggleStar: () => {},
  onToggleFolderPinned: () => {},
  onMoveConversation: () => {},
  onSetFolderColor: () => {},
};

export async function benchFloatingTree(
  dataset: DatasetName,
  data: FolderData,
  counts: RunCounts,
): Promise<BenchResult[]> {
  const surface = 'floating panel (FolderTree)';
  const results: BenchResult[] = [];
  const target = pickBusiestFolder(data);
  const mount = (shaped: FolderData) =>
    mountFloatingPanel({ data: shaped, cloudActions: false, ...noTreeActions });

  for (const { expanded, label } of EXPANSIONS) {
    const shaped = withExpansion(data, expanded);
    results.push(
      await collect({
        surface,
        dataset,
        metric: `mount (${label})`,
        runs: counts.mount,
        setup: () => ({ handle: null as ReturnType<typeof mount> | null }),
        action: (state) => {
          state.handle = mount(shaped);
        },
        after: (state) => countElements(state.handle?.element),
        teardown: (state) => state.handle?.destroy(),
      }),
    );

    const handle = mount(shaped);
    let current = shaped;
    results.push(
      await collect({
        surface,
        dataset,
        metric: `data change: rename one folder (${label})`,
        runs: counts.interaction,
        setup: (run) => {
          current = withRenamedFolder(current, target, `Renamed ${run}`);
        },
        action: () => handle.update(current),
      }),
    );
    handle.destroy();
  }

  const handle = mount(withExpansion(data, true));
  const caret = () =>
    handle.element.shadowRoot?.querySelector<HTMLButtonElement>('.gv-floating-folder-panel__caret');
  results.push(
    await collect({
      surface,
      dataset,
      metric: 'toggle one folder open/closed',
      runs: counts.interaction,
      setup: () => undefined,
      action: () => caret()?.click(),
    }),
  );
  handle.destroy();
  results.push(
    notApplicable(surface, dataset, 'search typing', 'the floating tree has no search'),
    notApplicable(surface, dataset, 'selection toggle', 'the floating tree has no selection'),
  );
  return results;
}

// --- ChatGPT sidebar section: the same FolderTree, no controller -------------

export async function benchChatGptSection(
  dataset: DatasetName,
  data: FolderData,
  counts: RunCounts,
): Promise<BenchResult[]> {
  const surface = 'chatgpt section (FolderTree)';
  const results: BenchResult[] = [];
  const target = pickBusiestFolder(data);
  const container = document.createElement('nav');
  container.style.cssText = 'display:block;width:260px;height:100vh;overflow:auto;';
  document.body.append(container);

  for (const { expanded, label } of EXPANSIONS) {
    const shaped = withExpansion(data, expanded);
    results.push(
      await collect({
        surface,
        dataset,
        metric: `mount (${label})`,
        runs: counts.mount,
        setup: () => ({ section: null as ChatGptFolderSection | null }),
        action: (state) => {
          state.section = new ChatGptFolderSection(shaped, ROOT_BUCKET_ID, noTreeActions);
          container.append(state.section.element);
        },
        after: (state) => countElements(state.section?.element),
        teardown: (state) => state.section?.destroy(),
      }),
    );

    const section = new ChatGptFolderSection(shaped, ROOT_BUCKET_ID, noTreeActions);
    container.append(section.element);
    let current = shaped;
    results.push(
      await collect({
        surface,
        dataset,
        metric: `data change: rename one folder (${label})`,
        runs: counts.interaction,
        setup: (run) => {
          current = withRenamedFolder(current, target, `Renamed ${run}`);
        },
        action: () => section.update(current),
      }),
    );
    section.destroy();
  }
  container.remove();
  results.push(
    notApplicable(surface, dataset, 'search typing', 'the section has no search'),
    notApplicable(surface, dataset, 'selection toggle', 'the section has no selection'),
  );
  return results;
}

// --- ChatGPT "Move to folder" picker -----------------------------------------

export async function benchChatGptPicker(
  dataset: DatasetName,
  data: FolderData,
  counts: RunCounts,
): Promise<BenchResult[]> {
  const surface = 'chatgpt folder picker';
  const results: BenchResult[] = [];
  const host = () => document.querySelector<HTMLElement>('.gv-chatgpt-folder-picker');
  results.push(
    await collect({
      surface,
      dataset,
      metric: 'mount (flat list, no expansion state)',
      runs: counts.mount,
      setup: () => ({ handle: null as ReturnType<typeof openFolderPicker> | null }),
      action: (state) => {
        state.handle = openFolderPicker(data, () => {});
      },
      after: () => countElements(host()),
      teardown: (state) => state.handle?.close(),
    }),
  );

  const handle = openFolderPicker(data, () => {});
  const search = host()?.shadowRoot?.querySelector<HTMLInputElement>('input.search');
  results.push(
    search
      ? await collect({
          surface,
          dataset,
          metric: 'search typing (per keystroke)',
          runs: counts.interaction * SEARCH_KEYSTROKES.length,
          warmup: SEARCH_KEYSTROKES.length,
          setup: () => undefined,
          action: (_state, run) =>
            typeInto(search, SEARCH_KEYSTROKES[run % SEARCH_KEYSTROKES.length]),
        })
      : notApplicable(surface, dataset, 'search typing', 'search input not found'),
  );
  handle.close();
  results.push(
    notApplicable(surface, dataset, 'data change', 'the picker renders a snapshot when opened'),
    notApplicable(surface, dataset, 'selection toggle', 'picking a folder closes the picker'),
  );
  return results;
}

// --- ChatGPT hide-filed: row markers under one constant rule -----------------

/** Recents rows as ChatGPT renders them, enough of them to fill a long sidebar. */
const RECENTS_ROWS = 500;
const PAGE_ROWS = 28;

export async function benchHideFiledStyle(
  dataset: DatasetName,
  chatgptData: FolderData,
  counts: RunCounts,
): Promise<BenchResult[]> {
  const surface = 'chatgpt hide-filed (row markers + constant rule)';
  const filed = [
    ...new Set(
      Object.values(chatgptData.folderContents).flatMap((bucket) =>
        bucket.map((ref) => ref.conversationId.replace(/^chatgpt:conv:/, '')),
      ),
    ),
  ];
  const random = createRandom(0x51de);
  const uuid = () =>
    Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16))
      .join('')
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  // The watcher hands `sync` the whole sidebar; rows match only under Recents.
  const nav = document.createElement('nav');
  const recents = document.createElement('div');
  recents.setAttribute('data-sidebar-project-container-id', 'chats');
  nav.append(recents);
  const addRow = (index: number) => {
    const row = document.createElement('div');
    row.setAttribute('role', 'listitem');
    const link = document.createElement('a');
    const id = index % 2 === 0 && filed.length ? filed[index % filed.length] : uuid();
    link.setAttribute('href', `/c/${id}`);
    link.textContent = `Conversation ${index}`;
    row.append(link);
    recents.append(row);
  };
  for (let i = 0; i < RECENTS_ROWS; i++) addRow(i);
  document.body.append(nav);
  const scope = new PluginScope();
  const hideFiled = new ChatGptHideFiled(scope);
  const style = document.querySelector<HTMLStyleElement>('style[data-gv-chatgpt-hide-filed]')!;

  const hiddenRows = () =>
    Array.from(recents.children).filter((row) => getComputedStyle(row).display === 'none').length;
  const results: BenchResult[] = [];
  // A store notification: rebuild the filed set, then a row pass marks every
  // filed row. The forced layout restyles the newly hidden rows.
  const marked = await collect({
    surface,
    dataset,
    metric: `mark rows (${filed.length} ids) in ${RECENTS_ROWS} rows`,
    runs: counts.interaction,
    setup: () => {
      hideFiled.update([]);
      hideFiled.sync(nav);
    },
    action: () => {
      hideFiled.update(filed);
      hideFiled.sync(nav);
    },
  });
  // Sanity check that the markers and rule match the fake rows: about half are filed.
  results.push({ ...marked, note: `hides ${hiddenRows()} of ${RECENTS_ROWS} rows` });
  results.push(
    await collect({
      surface,
      dataset,
      metric: `reconcile unchanged marks (${filed.length} ids) in ${RECENTS_ROWS} rows`,
      runs: counts.interaction,
      setup: () => undefined,
      action: () => hideFiled.sync(nav),
    }),
  );
  results.push(
    await collect({
      surface,
      dataset,
      metric: `restyle ${RECENTS_ROWS} marked rows under the constant rule`,
      runs: counts.interaction,
      setup: () => undefined,
      action: () => {
        style.disabled = !style.disabled;
      },
    }),
  );
  style.disabled = false;
  let next = RECENTS_ROWS;
  results.push(
    await collect({
      surface,
      dataset,
      metric: `append a page of ${PAGE_ROWS} rows and reconcile marks`,
      runs: counts.interaction,
      setup: () => undefined,
      action: () => {
        for (let i = 0; i < PAGE_ROWS; i++) addRow(next++);
        hideFiled.sync(nav);
      },
    }),
  );
  await scope.dispose();
  nav.remove();
  return results;
}
