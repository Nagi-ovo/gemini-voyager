/**
 * A jsdom model of ChatGPT's projects as measured live on 2026-10-18 (zh-CN UI),
 * on top of {@link mountChatGptPage}; `language: 'en'` renders the English UI,
 * with ChatGPT's own English texts where they were taken from its messages:
 * - the sidebar's project group: a header with
 *   `button[data-app-action-sidebar-project-create][aria-label="添加新项目"]`
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
 * - a project page has two button pairs: the view tabs 「聊天」/「来源」
 *   (`role=tab`, ids ending `-chats-tab` / `-sources-tab`, in a `role=tablist`;
 *   the sources view adds `?tab=sources`) and the modes 「聊天」/「工作」 with
 *   `aria-pressed`. The page
 *   often opens in Work mode; in chat mode the composer reads
 *   「在“<name>”中新建聊天」. (The Work-mode label was not measured; the fixture
 *   uses one the bridge cannot know, so the switch must be what decides.)
 * - the sources view has five file inputs; the first in `main` outside any
 *   form takes uploads. A file under a name already listed is ignored without
 *   a word. Each row: an icon, `div[title=<name>]`, kind, `<time datetime>`,
 *   and `button[aria-label="<name> 的操作"][aria-haspopup=menu]`, whose menu
 *   opens on pointerdown; its items draw sprite icons (`#arrow-down-lg-light-16`,
 *   `#trash-light-16`), and 「删除」 removes the file at once, unconfirmed.
 * - ChatGPT's answers, as the page data observer reports them: the sidebar's
 *   projects, a sources view's file list, and the file list in its answer to an
 *   upload (once the row stops uploading) or a removal (shortly after the row goes).
 */
import {
  type ChatGptPageFixture,
  type FixtureLanguage,
  mountChatGptPage,
} from './chatgptPageFixture';
import { type PageDataFeed, createPageDataFeed } from './pageDataFeed';

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
  /** When ChatGPT answers the sidebar's project request; null: never (default: at once). */
  readonly projectsAnswerAfterMs?: number | null;
  /** Whether that answer ends the list (default true); false: more pages to load on demand. */
  readonly projectsComplete?: boolean;
  /**
   * When ChatGPT answers a project's file request after its sources view renders;
   * null: never (default: as the list loads).
   */
  readonly filesAnswerAfterMs?: number | null;
  /** Whether ChatGPT answers an upload or a removal with the project's files (default true). */
  readonly changesAnswered?: boolean;
  /** Whether the browser runs the page data observer (default true; false: Firefox before 128). */
  readonly pageObserver?: boolean;
  /** The UI language (default `zh-CN`). */
  readonly language?: FixtureLanguage;
}

export interface ProjectPageFixture {
  readonly page: ChatGptPageFixture;
  /** What the page data observer reports from ChatGPT's answers. */
  readonly feed: PageDataFeed;
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
const SPRITE = '/cdn/assets/icons-a2f88694b9ccf6a5.svg';

/**
 * The page's texts. The project's Work label was not measured, so each is one
 * the bridge cannot know; the English labels the bridge does not read are guesses.
 */
const TEXTS = {
  'zh-CN': {
    home: '询问 ChatGPT',
    work: '让 ChatGPT 处理一项任务',
    chatIn: (name: string) => `在“${name}”中新建聊天`,
    create: '添加新项目',
    views: ['聊天', '来源'],
    modes: ['聊天', '工作'],
    actions: (name: string) => `${name} 的操作`,
    kind: '文件',
    menu: ['下载', '删除'],
  },
  en: {
    home: 'Ask ChatGPT',
    work: 'Let ChatGPT handle a task',
    chatIn: (name: string) => `New chat in ${name}`,
    create: 'New project',
    views: ['Chats', 'Sources'],
    modes: ['Chat', 'Work'],
    actions: (name: string) => `Actions for ${name}`,
    kind: 'File',
    menu: ['Download', 'Delete'],
  },
  de: {
    home: 'ChatGPT fragen',
    work: 'Lass ChatGPT eine Aufgabe erledigen',
    chatIn: (name: string) => `Neuer Chat in ${name}`,
    create: 'Neues Projekt',
    views: ['Chats', 'Quellen'],
    modes: ['Chat', 'Work'],
    actions: (name: string) => `Aktionen für ${name}`,
    kind: 'Datei',
    menu: ['Herunterladen', 'Löschen'],
  },
} as const;

export function mountProjectPage(options: ProjectPageOptions = {}): ProjectPageFixture {
  const language = options.language ?? 'zh-CN';
  const text = TEXTS[language];
  const page = mountChatGptPage({ route: options.route ?? '/', modeSwitch: 'none', language });
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
  const chatLabel = (name: string): string => text.chatIn(name);
  const feed = createPageDataFeed({ running: options.pageObserver ?? true });
  const answerFiles = (project: FixtureProject): void =>
    feed.files(
      project.id,
      files.map((file) => file.name),
    );

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', '聊天历史');
  document.body.prepend(nav);
  const header = document.querySelector<HTMLElement>('[data-gv-fixture-header]')!;
  // Measured: the chat/Work pair is a role=group in this header, on every page that has it.
  header.setAttribute('data-app-shell-header-obstacle', 'true');
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
    group.innerHTML = `<div><h2>项目</h2><button type="button" data-app-action-sidebar-project-create aria-label="${text.create}"></button></div><div role="list"></div>`;
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
      row.innerHTML = `<span aria-hidden="true"><svg></svg></span><div><div></div><div>${text.kind}</div></div><div><time></time><div><button type="button" aria-haspopup="menu" aria-expanded="false"></button></div></div>`;
      const name = row.querySelector('div > div')!;
      name.setAttribute('title', file.name);
      name.textContent = file.name;
      const time = row.querySelector('time')!;
      if (file.uploadedAt) time.setAttribute('datetime', file.uploadedAt);
      else time.remove();
      row.querySelector('button')!.setAttribute('aria-label', text.actions(file.name));
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
        const project = current();
        if (project && options.changesAnswered !== false) answerFiles(project);
      }, busyMs);
    }, options.uploadShowsAfterMs ?? 800);
  };

  const rowOf = (name: string): HTMLElement | null =>
    Array.from(sources.querySelectorAll<HTMLElement>('li')).find(
      (row) => row.querySelector('[title]')?.getAttribute('title') === name,
    ) ?? null;

  const paintMode = (project: FixtureProject): void => {
    page.composer.setAttribute('aria-label', mode === 'chat' ? chatLabel(project.name) : text.work);
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
      page.composer.setAttribute('aria-label', text.home);
      return;
    }
    document.title = `ChatGPT - ${project.name}`;
    const onSources = new URLSearchParams(location.search).get('tab') === 'sources';
    header.innerHTML = `
      <div data-gv-views role="tablist"><div><button type="button" role="tab" id="_r_c4_-chats-tab">${text.views[0]}</button><button type="button" role="tab" id="_r_c4_-sources-tab">${text.views[1]}</button></div></div>
      ${onSources ? '' : `<div data-gv-modes role="group"><span><button type="button">${text.modes[0]}</button></span><span><button type="button">${text.modes[1]}</button></span></div>`}`;
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
      const answerAfter =
        options.filesAnswerAfterMs === undefined
          ? (options.listLoadsAfterMs ?? 0)
          : options.filesAnswerAfterMs;
      if (answerAfter !== null) setTimeout(() => answerFiles(project), answerAfter);
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
    const name = button.closest('li')!.querySelector('[title]')!.getAttribute('title') ?? '';
    document.querySelector('[role="menu"]')?.remove();
    const menu = document.createElement('div');
    menu.id = `radix-menu-${counts.menuOpens}`;
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `<div role="menuitem" tabindex="-1"><svg><use href="${SPRITE}#arrow-down-lg-light-16"></use></svg>${text.menu[0]}</div><div role="menuitem" tabindex="-1"><svg><use href="${SPRITE}#trash-light-16"></use></svg>${text.menu[1]}</div>`;
    const [download, remove] = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    download.addEventListener('click', () => (counts.downloadClicks += 1));
    remove.addEventListener('click', () => {
      menu.remove();
      if (options.removeWorks === false) return;
      const index = files.findIndex((file) => file.name === name);
      if (index >= 0) files.splice(index, 1);
      renderRows();
      const project = current();
      if (project && options.changesAnswered !== false) setTimeout(() => answerFiles(project), 300);
    });
    document.body.appendChild(menu);
    button.setAttribute('aria-controls', menu.id);
    button.setAttribute('aria-expanded', 'true');
  });

  // The new-project dialog: a React-controlled input and a submit button.
  nav.addEventListener('click', (event) => {
    if (!(event.target as Element).closest?.('button[data-app-action-sidebar-project-create]'))
      return;
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
  const projectsAfter =
    options.projectsAnswerAfterMs === undefined ? 0 : options.projectsAnswerAfterMs;
  if (projectsAfter !== null) {
    setTimeout(
      () =>
        feed.projects(
          projects.map(({ id, name }) => ({ projectId: id, name })),
          options.projectsComplete ?? true,
        ),
      projectsAfter,
    );
  }
  if (!rowsLoaded) {
    setTimeout(() => {
      rowsLoaded = true;
      renderSidebar();
    }, options.sidebarRowsAfterMs);
  }
  render();
  return {
    page,
    feed,
    files: () => files.map((file) => file.name),
    mode: () => mode,
    counts,
    created,
    chatLabel,
  };
}
