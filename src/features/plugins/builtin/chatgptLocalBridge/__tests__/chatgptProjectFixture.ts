/**
 * A jsdom model of ChatGPT's projects as measured live on 2026-10-18 (zh-CN UI),
 * on top of {@link mountChatGptPage}:
 * - the sidebar's project group: a header with `button[aria-label="添加新项目"]`
 *   and a `role=list` of `role=listitem` entries. A project's entry is no link:
 *   `div[data-sidebar-project-container-id="project:<id>"]` holds a
 *   `div[role=button][aria-expanded]` row carrying
 *   `data-app-action-sidebar-project-{row,id,label}` and an `aria-labelledby`
 *   span with the name, then links to the project's chats
 *   (`/g/<id>-<slug>/c/<id>`); pressing the row toggles that chat list;
 * - the new-project dialog (`role=dialog`, `input[name=project-name]` controlled
 *   by React, a submit button disabled until a name is typed); submitting moves
 *   the route in-app to the new project's page and its title to
 *   `ChatGPT - <name>`;
 * - a project page has two button pairs: views 「聊天」/「来源」 (the sources view
 *   adds `?tab=sources`) and modes 「聊天」/「工作」 with `aria-pressed`. The page
 *   often opens in Work mode; in chat mode the composer reads
 *   「在“<name>”中新建聊天」. (The Work-mode label was not measured; the fixture
 *   uses one the bridge cannot know, so the switch must be what decides.)
 * - the sources view has five file inputs; the first in `main` outside any
 *   form takes uploads. A file under a name already listed is ignored without
 *   a word. Each row: name, kind, `<time datetime>`, and
 *   `button[aria-label="<name> 的操作"][aria-haspopup=menu]`, whose menu opens
 *   on pointerdown and whose 「删除」 removes the file at once, unconfirmed.
 */
import { type ChatGptPageFixture, mountChatGptPage } from './chatgptPageFixture';

export interface FixtureProject {
  readonly id: string;
  readonly name: string;
}

export const PROJECT_A: FixtureProject = { id: `g-p-${'a1'.repeat(16)}`, name: '论文 Q3' };
export const PROJECT_B: FixtureProject = { id: `g-p-${'b2'.repeat(16)}`, name: '实验记录' };
export const NEW_PROJECT_ID = `g-p-${'c3'.repeat(16)}`;

export interface FixtureFile {
  readonly name: string;
  readonly uploadedAt?: string | null;
}

export type ProjectMode = 'chat' | 'work';

export interface ProjectPageOptions {
  readonly route?: string;
  /** The sidebar's projects; default A and B. */
  readonly projects?: readonly FixtureProject[];
  /** Render the sidebar's project group at all (default true). */
  readonly projectGroup?: boolean;
  /** Delay before the project rows render under the group's header (default: at once). */
  readonly sidebarRowsAfterMs?: number;
  /** Where a project row names its project: its label attribute (default) or only its labelling span. */
  readonly rowNames?: 'attribute' | 'labelledby';
  /** The project page's mode when it renders (default `work`, as often seen live). */
  readonly mode?: ProjectMode;
  /** Whether the chat mode button switches the page (default true). */
  readonly switchWorks?: boolean;
  /** Files of every project page (default none). */
  readonly files?: readonly FixtureFile[];
  /** Delay before a navigated page renders (default 200 ms). */
  readonly renderDelayMs?: number;
  /** Delay before an upload's row shows; null: ChatGPT never shows it (default 800 ms). */
  readonly uploadShowsAfterMs?: number | null;
  /** How long a new row stays `aria-busy` (default 0). */
  readonly uploadBusyMs?: number;
  /** Delay before the sources view lists its rows (default: at once). */
  readonly listLoadsAfterMs?: number;
  /** Whether 「删除」 removes the row (default true). */
  readonly removeWorks?: boolean;
  /** Delay before a created project's route; null: the route never changes (default 600 ms). */
  readonly createRoutesAfterMs?: number | null;
}

export interface ProjectPageFixture {
  readonly page: ChatGptPageFixture;
  files(): string[];
  mode(): ProjectMode;
  readonly counts: {
    workClicks: number;
    downloadClicks: number;
    linkClicks: number;
    rowToggles: number;
    menuOpens: number;
    wrongInputChanges: number;
    uploadChanges: number;
    ignoredUploads: number;
  };
  readonly created: FixtureProject[];
  /** The project page's composer label in chat mode. */
  chatLabel(name: string): string;
}

const PROJECT_PAGE = /^\/g\/(g-p-[0-9a-f]{32})(?:-[^/]*)?\/project\/?$/;
const WORK_LABEL = '让 ChatGPT 处理一项任务';
const HOME_LABEL = '询问 ChatGPT';

export function mountProjectPage(options: ProjectPageOptions = {}): ProjectPageFixture {
  const page = mountChatGptPage({ route: options.route ?? '/', modeSwitch: 'none' });
  const projects = [...(options.projects ?? [PROJECT_A, PROJECT_B])];
  const files: FixtureFile[] = [...(options.files ?? [])];
  const delay = options.renderDelayMs ?? 200;
  let mode: ProjectMode = options.mode ?? 'work';
  let listLoaded = options.listLoadsAfterMs === undefined;
  let rowsLoaded = options.sidebarRowsAfterMs === undefined;
  const counts = {
    workClicks: 0,
    downloadClicks: 0,
    linkClicks: 0,
    rowToggles: 0,
    menuOpens: 0,
    wrongInputChanges: 0,
    uploadChanges: 0,
    ignoredUploads: 0,
  };
  const created: FixtureProject[] = [];
  const chatLabel = (name: string): string => `在“${name}”中新建聊天`;

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', '聊天历史');
  document.body.prepend(nav);
  const header = document.querySelector<HTMLElement>('[data-gv-fixture-header]')!;
  const main = document.querySelector('main')!;
  const sources = document.createElement('section');
  main.prepend(sources);

  const renderSidebar = (): void => {
    nav.innerHTML = `
      <div data-gv-projects></div>
      <div role="list">
        <div role="listitem"><a href="/g/${PROJECT_A.id}-lun-wen/c/c9d8e7f6-0000-4000-8000-000000000009"><span>项目里的聊天</span></a></div>
        <div role="listitem"><a href="/c/old-chat-1"><span>旧聊天</span></a></div>
      </div>`;
    if (options.projectGroup === false) return;
    const group = nav.querySelector('[data-gv-projects]')!;
    group.innerHTML =
      '<div><h2>项目</h2><button type="button" aria-label="添加新项目"></button></div><div role="list"></div>';
    (rowsLoaded ? projects : []).forEach((project, index) => {
      const item = document.createElement('div');
      item.setAttribute('role', 'listitem');
      const labelId = `gv-fixture-project-label-${index}`;
      item.innerHTML = `
        <div><div data-sidebar-project-kind="local" data-sidebar-project-container-id="project:${project.id}">
          <div><div role="button" tabindex="0" aria-expanded="true" data-app-action-sidebar-project-row
              data-app-action-sidebar-project-id="${project.id}" aria-labelledby="${labelId}">
            <svg></svg><span id="${labelId}"></span>
          </div></div>
          <div role="list">
            <div role="listitem"><a href="/g/${project.id}-slug/c/c9d8e7f6-0000-4000-8000-00000000000${index}"><span>项目里的聊天</span></a></div>
          </div>
        </div></div>`;
      const row = item.querySelector<HTMLElement>('[data-app-action-sidebar-project-row]')!;
      if ((options.rowNames ?? 'attribute') === 'attribute') {
        row.setAttribute('data-app-action-sidebar-project-label', project.name);
      }
      item.querySelector(`#${labelId}`)!.textContent = project.name;
      row.addEventListener('click', () => {
        counts.rowToggles += 1;
        row.setAttribute('aria-expanded', String(row.getAttribute('aria-expanded') !== 'true'));
      });
      group.querySelector('[role="list"]')!.appendChild(item);
    });
  };

  const current = (): FixtureProject | null => {
    const id = PROJECT_PAGE.exec(location.pathname)?.[1];
    return projects.find((project) => project.id === id) ?? null;
  };

  const renderRows = (): void => {
    sources.innerHTML = `
      <input type="file" data-gv-upload />
      <input type="file" accept="image/*" />
      <input type="file" multiple />
      <input type="file" accept=".pdf" />
      <ul></ul>`;
    const list = sources.querySelector('ul')!;
    for (const file of listLoaded ? files : []) {
      const row = document.createElement('li');
      row.innerHTML = `<div></div><div>文件</div><time></time><button type="button" aria-haspopup="menu" aria-expanded="false"></button>`;
      row.querySelector('div')!.textContent = file.name;
      const time = row.querySelector('time')!;
      if (file.uploadedAt) time.setAttribute('datetime', file.uploadedAt);
      else time.remove();
      row.querySelector('button')!.setAttribute('aria-label', `${file.name} 的操作`);
      list.appendChild(row);
    }
    sources.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input, index) => {
      let held: File[] = [];
      Object.defineProperty(input, 'files', {
        configurable: true,
        get: () => held,
        set: (next: File[]) => {
          held = [...next];
        },
      });
      input.addEventListener('change', () => {
        if (index !== 0) {
          counts.wrongInputChanges += 1;
          return;
        }
        counts.uploadChanges += 1;
        for (const file of held) upload(file.name);
      });
    });
  };

  const upload = (name: string): void => {
    // Measured: ChatGPT keeps the old file and says nothing.
    if (files.some((file) => file.name === name)) {
      counts.ignoredUploads += 1;
      return;
    }
    if (options.uploadShowsAfterMs === null) return;
    setTimeout(() => {
      files.push({ name, uploadedAt: null });
      renderRows();
      const row = rowOf(name);
      const busyMs = options.uploadBusyMs ?? 0;
      if (row && busyMs > 0) row.setAttribute('aria-busy', 'true');
      setTimeout(() => {
        const index = files.findIndex((file) => file.name === name);
        if (index >= 0) files[index] = { name, uploadedAt: '2026-10-18T09:30:00.000Z' };
        renderRows();
      }, busyMs);
    }, options.uploadShowsAfterMs ?? 800);
  };

  const rowOf = (name: string): HTMLElement | null =>
    Array.from(sources.querySelectorAll<HTMLElement>('li')).find(
      (row) => row.querySelector('div')?.textContent === name,
    ) ?? null;

  const paintMode = (project: FixtureProject): void => {
    page.composer.setAttribute(
      'aria-label',
      mode === 'chat' ? chatLabel(project.name) : WORK_LABEL,
    );
    const [chat, work] = Array.from(
      header.querySelectorAll<HTMLButtonElement>('[data-gv-modes] button'),
    );
    chat?.setAttribute('aria-pressed', String(mode === 'chat'));
    work?.setAttribute('aria-pressed', String(mode === 'work'));
  };

  const render = (): void => {
    const project = current();
    header.replaceChildren();
    sources.replaceChildren();
    if (!project) {
      document.title = 'ChatGPT';
      page.composer.setAttribute('aria-label', HOME_LABEL);
      return;
    }
    document.title = `ChatGPT - ${project.name}`;
    const onSources = new URLSearchParams(location.search).get('tab') === 'sources';
    header.innerHTML = `
      <div data-gv-views><button type="button">聊天</button><button type="button">来源</button></div>
      ${onSources ? '' : '<div data-gv-modes><span><button type="button">聊天</button></span><span><button type="button">工作</button></span></div>'}`;
    const [chatView, sourcesView] = Array.from(
      header.querySelectorAll<HTMLButtonElement>('[data-gv-views] button'),
    );
    const base = `/g/${project.id}/project`;
    chatView.addEventListener('click', () => navigate(base));
    sourcesView.addEventListener('click', () => navigate(`${base}?tab=sources`));
    if (onSources) {
      renderRows();
      if (!listLoaded) {
        setTimeout(() => {
          listLoaded = true;
          renderRows();
        }, options.listLoadsAfterMs);
      }
      return;
    }
    const [chatMode, workMode] = Array.from(
      header.querySelectorAll<HTMLButtonElement>('[data-gv-modes] button'),
    );
    chatMode.addEventListener('click', () => {
      if (options.switchWorks === false) return;
      // ChatGPT re-labels the composer a moment after the click.
      setTimeout(() => {
        mode = 'chat';
        paintMode(project);
      }, 300);
    });
    workMode.addEventListener('click', () => {
      counts.workClicks += 1;
      mode = 'work';
      paintMode(project);
    });
    paintMode(project);
  };

  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRender = (): void => {
    header.replaceChildren();
    sources.replaceChildren();
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, delay);
  };
  const navigate = (href: string): void => {
    history.pushState(null, '', href);
    scheduleRender();
  };

  // React Router: an in-app link changes the route without loading a document.
  document.addEventListener('click', (event) => {
    const link = (event.target as Element).closest?.('nav a[href]');
    if (!link) return;
    event.preventDefault();
    counts.linkClicks += 1;
    navigate(link.getAttribute('href')!);
  });
  window.addEventListener('popstate', scheduleRender);

  // The row menu opens on pointerdown, like Radix menus.
  document.addEventListener('pointerdown', (event) => {
    const button = (event.target as Element).closest?.('li button[aria-haspopup="menu"]');
    if (!button || (event as MouseEvent).button !== 0) return;
    counts.menuOpens += 1;
    const name = button.closest('li')!.querySelector('div')!.textContent ?? '';
    document.querySelector('[role="menu"]')?.remove();
    const menu = document.createElement('div');
    menu.id = `radix-menu-${counts.menuOpens}`;
    menu.setAttribute('role', 'menu');
    menu.innerHTML =
      '<div role="menuitem" tabindex="-1">下载</div><div role="menuitem" tabindex="-1">删除</div>';
    const [download, remove] = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    download.addEventListener('click', () => (counts.downloadClicks += 1));
    remove.addEventListener('click', () => {
      menu.remove();
      if (options.removeWorks === false) return;
      const index = files.findIndex((file) => file.name === name);
      if (index >= 0) files.splice(index, 1);
      renderRows();
    });
    document.body.appendChild(menu);
    button.setAttribute('aria-controls', menu.id);
    button.setAttribute('aria-expanded', 'true');
  });

  // The new-project dialog: a React-controlled input and a submit button.
  nav.addEventListener('click', (event) => {
    if (!(event.target as Element).closest?.('button[aria-label="添加新项目"]')) return;
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = `<h2>创建项目</h2><form><input name="project-name" value="" /><button type="submit" disabled>创建项目</button></form>`;
    const input = dialog.querySelector('input')!;
    const submit = dialog.querySelector<HTMLButtonElement>('button')!;
    input.addEventListener('input', () => (submit.disabled = input.value.trim() === ''));
    dialog.querySelector('form')!.addEventListener('submit', (event) => event.preventDefault());
    submit.addEventListener('click', () => {
      const name = input.value.trim();
      if (options.createRoutesAfterMs === null) return;
      setTimeout(() => {
        dialog.remove();
        const project = { id: NEW_PROJECT_ID, name };
        projects.push(project);
        created.push(project);
        renderSidebar();
        navigate(`/g/${project.id}/project`);
      }, options.createRoutesAfterMs ?? 600);
    });
    document.body.appendChild(dialog);
  });

  renderSidebar();
  if (!rowsLoaded) {
    setTimeout(() => {
      rowsLoaded = true;
      renderSidebar();
    }, options.sidebarRowsAfterMs);
  }
  render();
  return {
    page,
    files: () => files.map((file) => file.name),
    mode: () => mode,
    counts,
    created,
    chatLabel,
  };
}
