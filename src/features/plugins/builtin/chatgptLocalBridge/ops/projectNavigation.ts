/**
 * `project.list` (passive), `project.create` and `project.open` (leased): the
 * sidebar's projects, its new-project dialog, and moving the tab to a project
 * in-app (the sidebar's own link first, the History API when the sidebar does
 * not list it; never a reload).
 *
 * `project.open` with the chat view ends in chat mode or fails: a project page
 * that opens in Work is switched with its own 「聊天」, and 「工作」 is never
 * pressed. `project.create` cannot take its submit back: once pressed, a
 * project that never shows is `unverified` with `created: 'unknown'`, so the
 * caller lists the projects before it tries again.
 */
import type {
  ProjectCreateParams,
  ProjectCreateResult,
  ProjectListParams,
  ProjectListResult,
  ProjectOpenParams,
  ProjectOpenResult,
} from '@/features/bridge/protocol';
import type { ProjectsSection } from '@/features/plugins/sites/sections/projectsData';
import type { SiteAdapter } from '@/features/plugins/types';
import { isRendered } from '@/pages/content/export/adapter/chatgptThread';

import type { OpContext } from '../opContext';
import type { PageData } from '../pageData/store';
import { readMode, readPageLanguage, switchProjectToChat } from './conversationReady';
import { requirePageObserver } from './pageObserver';
import { findComposerField } from './pageReaders';
import {
  ensureSourcesView,
  findCreateButton,
  findViewSwitch,
  isSourcesView,
  projectPageIdOf,
  projectPathOf,
  requireProjectsData,
  sidebarProjects,
  timeLeft,
  titleName,
} from './projectPage';

const SIDEBAR_TIMEOUT_MS = 10_000;
/** How long ChatGPT may take to answer the sidebar's project request after the page loaded. */
const PROJECTS_TIMEOUT_MS = 20_000;
const DIALOG_TIMEOUT_MS = 5_000;
const SUBMIT_ENABLED_TIMEOUT_MS = 3_000;
const CREATED_TIMEOUT_MS = 20_000;
const ROUTE_TIMEOUT_MS = 10_000;
const PAGE_TIMEOUT_MS = 15_000;
const MODE_TIMEOUT_MS = 5_000;

export async function runProjectList(
  ctx: OpContext,
  _params: ProjectListParams,
  adapter: SiteAdapter | null,
  pageData: PageData,
): Promise<ProjectListResult> {
  const data = requireProjectsData(ctx, adapter);
  const started = ctx.now();
  await requirePageObserver(ctx, pageData);
  // Rows render in batches; a quiet 750 ms once passed for the whole list. ChatGPT's own
  // answer says when the list is whole.
  const listed = await ctx.waitFor(() => pageData.projects(), {
    timeoutMs: timeLeft(ctx, PROJECTS_TIMEOUT_MS),
  });
  const shown = sidebarProjects(data).map(({ projectId, name }) => ({ projectId, name }));
  const evidence = { items: shown.length, waitedMs: ctx.now() - started };
  if (!listed) {
    ctx.fail('unverified', "ChatGPT's project list did not arrive.", {
      ...evidence,
      reason: 'list-unconfirmed',
    });
  }
  if (!listed.complete) {
    ctx.fail(
      'unverified',
      'This account has more than 20 projects; ChatGPT loads the rest only on demand, so the list cannot be confirmed whole. Remove some projects, or name the project by its g-p- id.',
      { ...evidence, listed: listed.projects.length, reason: 'too-many-projects' },
    );
  }
  // A project made in this tab shows in the sidebar before ChatGPT is asked for the list again.
  const known = new Set(listed.projects.map((project) => project.projectId));
  const projects = [
    ...listed.projects,
    ...shown.filter((project) => !known.has(project.projectId)),
  ];
  return { projects, evidence: { ...evidence, items: projects.length } };
}

/** React keeps the input's value itself: set it through the native setter, then tell it. */
function typeInto(ctx: OpContext, input: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) ctx.fail('unverified', 'The name input could not be filled.', { stage: 'fill' });
  ctx.guard();
  setter.call(input, text);
  ctx.dispatch(input, new Event('input', { bubbles: true }));
}

function createDialog(data: ProjectsSection) {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>(data.createDialog.dialog));
  for (const dialog of dialogs) {
    const input = dialog.querySelector<HTMLInputElement>(data.createDialog.nameInput);
    const submit = dialog.querySelector<HTMLButtonElement>(data.createDialog.submit);
    if (input && submit && isRendered(input)) return { dialog, input, submit };
  }
  return null;
}

export async function runProjectCreate(
  ctx: OpContext,
  params: ProjectCreateParams,
  adapter: SiteAdapter | null,
): Promise<ProjectCreateResult> {
  const data = requireProjectsData(ctx, adapter);
  if (createDialog(data)) {
    ctx.fail('composer-busy', 'A new-project dialog is already open.', { reason: 'dialog-open' });
  }
  const button = await ctx.waitFor(() => findCreateButton(data), {
    timeoutMs: timeLeft(ctx, SIDEBAR_TIMEOUT_MS),
  });
  if (!button) ctx.fail('selector-missing', "The sidebar's new-project button was not found.");
  const startRoute = location.pathname;
  ctx.click(button);
  const form = await ctx.waitFor(() => createDialog(data), {
    timeoutMs: timeLeft(ctx, DIALOG_TIMEOUT_MS),
  });
  if (!form) ctx.fail('selector-missing', 'The new-project dialog did not open.');
  typeInto(ctx, form.input, params.name);
  const ready = await ctx.waitFor(
    () =>
      form.input.value === params.name &&
      !form.submit.disabled &&
      form.submit.getAttribute('aria-disabled') !== 'true',
    { timeoutMs: timeLeft(ctx, SUBMIT_ENABLED_TIMEOUT_MS) },
  );
  if (!ready) {
    ctx.fail('unverified', 'The dialog did not take the name.', {
      stage: 'fill',
      value: form.input.value,
    });
  }
  ctx.click(form.submit);
  // The route moves to a project nobody can name yet: only watching from here on.
  ctx.endPageEvents();
  const created = await ctx.waitFor(
    () => {
      const projectId = projectPageIdOf(data);
      if (!projectId || location.pathname === startRoute) return null;
      return titleName(data) === params.name ? projectId : null;
    },
    { timeoutMs: timeLeft(ctx, CREATED_TIMEOUT_MS) },
  );
  if (!created) {
    ctx.fail('unverified', 'The new project could not be confirmed.', {
      created: 'unknown',
      route: location.pathname,
      title: document.title,
    });
  }
  return {
    projectId: created,
    name: params.name,
    url: location.href,
    evidence: { title: document.title },
  };
}

/** Move to the project's page in-app; the route the op now holds. */
async function goToProject(
  ctx: OpContext,
  data: ProjectsSection,
  projectId: string,
): Promise<{ via: 'already' | 'link' | 'history' }> {
  if (projectPageIdOf(data) === projectId) return { via: 'already' };
  const listed = sidebarProjects(data).find((project) => project.projectId === projectId);
  let via: 'link' | 'history';
  if (listed?.link && isRendered(listed.link)) {
    const path = listed.link.getAttribute('href')?.split(/[?#]/)[0] ?? '';
    ctx.allowRoute(path);
    ctx.click(listed.link);
    via = 'link';
  } else {
    // No link to it: project rows are buttons that toggle their chat list, and the sidebar
    // may not show every project. The router follows a pushed route and popstate.
    const path = projectPathOf(data, projectId);
    ctx.allowRoute(path);
    ctx.guard();
    history.pushState(history.state, '', path);
    ctx.dispatch(window, new PopStateEvent('popstate', { state: history.state }));
    via = 'history';
  }
  const arrived = await ctx.waitFor(() => projectPageIdOf(data) === projectId, {
    timeoutMs: timeLeft(ctx, ROUTE_TIMEOUT_MS),
  });
  if (!arrived) {
    ctx.fail('unverified', 'The tab did not move to the project.', {
      via,
      route: location.pathname,
    });
  }
  // The router may settle on its own spelling of the project's page.
  ctx.allowRoute(location.pathname);
  return { via };
}

export async function runProjectOpen(
  ctx: OpContext,
  params: ProjectOpenParams,
  adapter: SiteAdapter | null,
): Promise<ProjectOpenResult> {
  const data = requireProjectsData(ctx, adapter);
  const { via } = await goToProject(ctx, data, params.projectId);
  // A project page shows its chat/sources pair; a route ChatGPT cannot resolve never does.
  const views = await ctx.waitFor(() => findViewSwitch(data), {
    timeoutMs: timeLeft(ctx, PAGE_TIMEOUT_MS),
  });
  if (!views) {
    ctx.fail('not-found', 'ChatGPT shows no such project.', {
      projectId: params.projectId,
      title: document.title,
    });
  }
  const evidence = { via, lang: readPageLanguage() };
  if (params.view === 'sources') {
    await ensureSourcesView(ctx, data);
    return {
      projectId: params.projectId,
      url: location.href,
      view: 'sources',
      name: titleName(data),
      evidence,
    };
  }
  if (isSourcesView(data)) {
    ctx.click(views.chat);
    const back = await ctx.waitFor(() => !isSourcesView(data), {
      timeoutMs: timeLeft(ctx, PAGE_TIMEOUT_MS),
    });
    if (!back) ctx.fail('selector-missing', "The project's chat view did not open.");
  }
  // The composer and its mode render after the view.
  const settled = await ctx.waitFor(
    () => {
      const field = findComposerField(adapter);
      if (!field) return null;
      const read = readMode(field, adapter);
      return read.mode === 'unknown' ? null : read;
    },
    { timeoutMs: timeLeft(ctx, PAGE_TIMEOUT_MS) },
  );
  if (!settled) {
    const field = findComposerField(adapter);
    ctx.fail('mode-unknown', 'Could not confirm the project page is in chat mode.', {
      composerLabels: field ? readMode(field, adapter).labels : [],
      lang: readPageLanguage(),
    });
  }
  let switchedMode: ProjectOpenResult['switchedMode'];
  let labels = settled.labels;
  if (settled.mode === 'work') {
    const field = await switchProjectToChat(ctx, adapter, MODE_TIMEOUT_MS);
    labels = readMode(field, adapter).labels;
    switchedMode = { from: 'work', to: 'chat' };
  }
  return {
    projectId: params.projectId,
    url: location.href,
    view: 'chat',
    name: titleName(data),
    ...(switchedMode ? { switchedMode } : {}),
    evidence: { ...evidence, composerLabels: labels },
  };
}
