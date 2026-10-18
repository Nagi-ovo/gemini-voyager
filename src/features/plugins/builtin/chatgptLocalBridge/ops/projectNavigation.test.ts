// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PROJECT_OP_NAMES, isOpName } from '@/features/bridge/protocol';

import {
  NEW_PROJECT_ID,
  PROJECT_A,
  PROJECT_B,
  type ProjectPageFixture,
  type ProjectPageOptions,
  mountProjectPage,
} from '../__tests__/chatgptProjectFixture';
import { type Harness, createHarness, errorCode } from '../__tests__/harness';

vi.mock('@/core/utils/userEvent', () => ({ isUserEvent: vi.fn(() => false) }));
vi.mock('@/utils/i18n', () => ({ getCurrentLanguage: vi.fn(async () => 'zh') }));

/** The project ops run once their registration lists them in `OpName`. */
const registered = PROJECT_OP_NAMES.every((op) => isOpName(op));

let fixture: ProjectPageFixture;
let bridge: Harness;

function mount(options: ProjectPageOptions = {}): void {
  fixture = mountProjectPage(options);
  bridge = createHarness();
}

const pagePath = (id: string): string => `/g/${id}/project`;

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  const running = bridge?.runtime.runningTaskId;
  if (running) bridge.runtime.abort(running);
  document.querySelector('[role="dialog"]')?.remove();
  vi.useRealTimers();
});

describe.runIf(registered)('Local Bridge project.list', () => {
  it('lists the projects when their sidebar rows are not links', async () => {
    mount();
    bridge.start('project.list', {});
    await vi.advanceTimersByTimeAsync(2_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: {
        projects: [
          { projectId: PROJECT_A.id, name: PROJECT_A.name },
          { projectId: PROJECT_B.id, name: PROJECT_B.name },
        ],
      },
    });
    expect(fixture.page.events().clicks).toBe(0);
  });

  it('names a row by the span its aria-labelledby points at when it has no label attribute', async () => {
    mount({ rowNames: 'labelledby' });
    bridge.start('project.list', {});
    await vi.advanceTimersByTimeAsync(2_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { projects: [{ name: PROJECT_A.name }, { name: PROJECT_B.name }] },
    });
  });

  it("waits for ChatGPT's answer instead of taking the rows shown so far as the whole list", async () => {
    mount({ projectsAnswerAfterMs: 6_000 });
    bridge.start('project.list', {});
    await vi.advanceTimersByTimeAsync(2_000);
    expect(bridge.outcome()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { projects: [{ projectId: PROJECT_A.id }, { projectId: PROJECT_B.id }] },
    });
  });

  it('lists every project ChatGPT names, even before the sidebar renders its rows', async () => {
    mount({ sidebarRowsAfterMs: 60_000 });
    bridge.start('project.list', {});
    await vi.advanceTimersByTimeAsync(1_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: {
        projects: [
          { projectId: PROJECT_A.id, name: PROJECT_A.name },
          { projectId: PROJECT_B.id, name: PROJECT_B.name },
        ],
      },
    });
  });

  it('reports an account with no projects as an empty list once ChatGPT says so', async () => {
    mount({ projects: [] });
    bridge.start('project.list', {});
    await vi.advanceTimersByTimeAsync(1_000);

    expect(bridge.outcome()).toMatchObject({ ok: true, data: { projects: [] } });
  });

  it("keeps a sidebar project ChatGPT's earlier answer did not name, such as one made in this tab", async () => {
    mount();
    await vi.advanceTimersByTimeAsync(100);
    fixture.feed.projects([{ projectId: PROJECT_A.id, name: PROJECT_A.name }]);
    bridge.start('project.list', {});
    await vi.advanceTimersByTimeAsync(1_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { projects: [{ projectId: PROJECT_A.id }, { projectId: PROJECT_B.id }] },
    });
  });

  it('refuses a list ChatGPT has more pages of, instead of a partial one', async () => {
    mount({ projectsComplete: false });
    bridge.start('project.list', {});
    await vi.advanceTimersByTimeAsync(1_000);

    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('unverified');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({
      reason: 'too-many-projects',
    });
  });

  it("fails unverified, never an empty list, when ChatGPT's project answer never arrives", async () => {
    mount({ projectsAnswerAfterMs: null });
    bridge.start('project.list', {});
    await vi.advanceTimersByTimeAsync(25_000);

    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('unverified');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({
      reason: 'list-unconfirmed',
    });
  });
});

describe.runIf(registered)('Local Bridge project.create', () => {
  it("types the name into the dialog, submits once, and reports the new project's route", async () => {
    mount();
    bridge.start('project.create', { name: '新项目 2026' });
    await vi.advanceTimersByTimeAsync(3_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: {
        projectId: NEW_PROJECT_ID,
        name: '新项目 2026',
        url: `https://chatgpt.com${pagePath(NEW_PROJECT_ID)}`,
      },
    });
    expect(fixture.created).toEqual([{ id: NEW_PROJECT_ID, name: '新项目 2026' }]);
  });

  it('creates a project on a page in English', async () => {
    mount({ language: 'en' });
    bridge.start('project.create', { name: 'Thesis 2026' });
    await vi.advanceTimersByTimeAsync(3_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { projectId: NEW_PROJECT_ID, name: 'Thesis 2026' },
    });
  });

  it('reports a submit whose project never appeared as unverified, saying it may exist', async () => {
    mount({ createRoutesAfterMs: null });
    bridge.start('project.create', { name: '新项目' });
    await vi.advanceTimersByTimeAsync(30_000);

    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('unverified');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({ created: 'unknown' });
  });
});

describe.runIf(registered)('Local Bridge project.open', () => {
  it('moves to a sidebar project in-app without toggling its row, then switches Work to chat with 「聊天」 only', async () => {
    mount({ mode: 'work' });
    bridge.start('project.open', { projectId: PROJECT_A.id, view: 'chat' });
    await vi.advanceTimersByTimeAsync(3_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: {
        projectId: PROJECT_A.id,
        view: 'chat',
        name: PROJECT_A.name,
        switchedMode: { from: 'work', to: 'chat' },
      },
    });
    expect(location.pathname).toBe(pagePath(PROJECT_A.id));
    expect(fixture.counts.rowToggles).toBe(0);
    expect(fixture.counts.linkClicks).toBe(0);
    expect(fixture.counts.workClicks).toBe(0);
    expect(fixture.mode()).toBe('chat');
  });

  it('opens a Work project on a page in English and switches it to chat, never pressing Work', async () => {
    mount({ mode: 'work', language: 'en' });
    bridge.start('project.open', { projectId: PROJECT_A.id, view: 'chat' });
    await vi.advanceTimersByTimeAsync(3_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { projectId: PROJECT_A.id, switchedMode: { from: 'work', to: 'chat' } },
    });
    expect(fixture.counts.workClicks).toBe(0);
    expect(fixture.mode()).toBe('chat');
  });

  it('opens the sources view of a project on a page in English', async () => {
    mount({ route: pagePath(PROJECT_A.id), language: 'en' });
    bridge.start('project.open', { projectId: PROJECT_A.id, view: 'sources' });
    await vi.advanceTimersByTimeAsync(3_000);

    expect(bridge.outcome()).toMatchObject({ ok: true, data: { view: 'sources' } });
    expect(new URLSearchParams(location.search).get('tab')).toBe('sources');
  });

  it('refuses a project whose chat mode cannot be switched on, never pressing 「工作」', async () => {
    mount({ mode: 'work', switchWorks: false });
    bridge.start('project.open', { projectId: PROJECT_A.id, view: 'chat' });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(errorCode(bridge.outcome())).toBe('mode-unavailable');
    expect(fixture.counts.workClicks).toBe(0);
  });

  it('uses the History API when the sidebar does not list the project', async () => {
    mount({ mode: 'chat' });
    // ChatGPT knows the project; the sidebar shows only some of them.
    document
      .querySelector(`[data-app-action-sidebar-project-id="${PROJECT_A.id}"]`)
      ?.closest('[data-sidebar-project-container-id]')
      ?.closest('[role="listitem"]')
      ?.remove();
    bridge.start('project.open', { projectId: PROJECT_A.id, view: 'chat' });
    await vi.advanceTimersByTimeAsync(3_000);

    expect(bridge.outcome()).toMatchObject({ ok: true, data: { projectId: PROJECT_A.id } });
    expect(location.pathname).toBe(pagePath(PROJECT_A.id));
    expect(fixture.counts.linkClicks).toBe(0);
  });

  it('opens the sources view with 「来源」', async () => {
    mount({ route: pagePath(PROJECT_A.id), mode: 'work' });
    bridge.start('project.open', { projectId: PROJECT_A.id, view: 'sources' });
    await vi.advanceTimersByTimeAsync(3_000);

    expect(bridge.outcome()).toMatchObject({ ok: true, data: { view: 'sources' } });
    expect(new URLSearchParams(location.search).get('tab')).toBe('sources');
    expect(fixture.counts.workClicks).toBe(0);
  });

  it('fails not-found when the route shows no such project', async () => {
    mount();
    bridge.start('project.open', { projectId: `g-p-${'d4'.repeat(16)}`, view: 'chat' });
    await vi.advanceTimersByTimeAsync(30_000);

    expect(errorCode(bridge.outcome())).toBe('not-found');
  });
});

describe('Local Bridge on a project page', () => {
  it("conversation.ready switches a Work project page to chat with the page's own switch, staying in the project", async () => {
    mount({ route: pagePath(PROJECT_A.id), mode: 'work' });
    bridge.start('conversation.ready', {});
    await vi.advanceTimersByTimeAsync(2_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { mode: 'chat', switchedMode: { from: 'work', to: 'chat' } },
    });
    expect(location.pathname).toBe(pagePath(PROJECT_A.id));
    expect(fixture.counts.workClicks).toBe(0);
  });

  it('conversation.ready never switches a project page to Work', async () => {
    mount({ route: pagePath(PROJECT_A.id), mode: 'chat' });
    bridge.start('conversation.ready', { ensureMode: 'work' });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(errorCode(bridge.outcome())).toBe('mode-unavailable');
    expect(fixture.counts.workClicks).toBe(0);
  });

  it('composer.send waits past the provisional local-chatgpt id for the project chat it opened', async () => {
    mount({ route: pagePath(PROJECT_A.id), mode: 'chat' });
    const chat = `/g/${PROJECT_A.id}-lun-wen/c`;
    fixture.page.sendBehavior = {
      provisionalRoute: `${chat}/local-chatgpt%3A0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f`,
      settledRoute: `${chat}/6a1b2c3d-0000-4000-8000-00000000abcd`,
      settledAfterMs: 2_500,
    };
    bridge.start('composer.send', { text: '读一下项目里的 repo.zip' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(bridge.outcome()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(3_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: {
        conversationId: '6a1b2c3d-0000-4000-8000-00000000abcd',
        url: `https://chatgpt.com${chat}/6a1b2c3d-0000-4000-8000-00000000abcd`,
      },
    });
  });

  it('composer.send refuses a Work-mode project page before any page event', async () => {
    mount({ route: pagePath(PROJECT_A.id), mode: 'work' });
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(errorCode(bridge.outcome())).toBe('mode-unavailable');
    expect(fixture.page.events()).toMatchObject({ execCommand: 0, clicks: 0 });
  });
});
