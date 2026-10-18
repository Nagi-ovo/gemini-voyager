// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DATA_OBSERVER_SOURCE } from './protocol';
import { type PageDataStore, createPageDataStore } from './store';

const observerScript = readFileSync(
  resolve(process.cwd(), 'public/chatgpt-bridge-data-observer.js'),
  'utf-8',
);

type ObserverWindow = Window & typeof globalThis & { __gvChatGptBridgeDataObserver?: boolean };

const PROJECT_A = `g-p-${'a1'.repeat(16)}`;
const PROJECT_B = `g-p-${'b2'.repeat(16)}`;
const CONVERSATION = '6ad4c570-05fc-83eb-9e38-09b167840b0f';
const SIDEBAR = '/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=5&limit=20';

/** A sidebar item as ChatGPT sends it, with fields the observer must not pass on. */
function sidebarItem(id: string, name: string, files: string[]) {
  return {
    gizmo: {
      gizmo: { id, display: { name, description: 'notes' }, author: { email: 'j@example.com' } },
      files: files.map((file) => ({ id: `file-${file}`, name: file, size: 10 })),
    },
    conversations: { items: [{ title: 'secret chat title' }] },
  };
}

const answers = new Map<string, unknown>();
let pageFetch: Mock;
let posted: string[] = [];
let store: PageDataStore;
const realFetch = window.fetch;
// Each install wraps the page's history methods again; each test starts from the browser's own.
const realPushState = history.pushState;
const realReplaceState = history.replaceState;

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
}

function onMessage(event: MessageEvent): void {
  const data = event.data as { source?: string };
  if (data?.source === DATA_OBSERVER_SOURCE) posted.push(JSON.stringify(data));
}

// Each test installs a fresh observer and store; their listeners go with their test.
let installedListeners: EventListenerOrEventListenerObject[] = [];

function install(): void {
  const add = vi.spyOn(window, 'addEventListener');
  // oxlint-disable-next-line no-eval -- evaluating the page script under test is what this suite exercises
  (0, eval)(observerScript);
  installedListeners = add.mock.calls.map((call) => call[1]);
  add.mockRestore();
}

function startStore(): void {
  const add = vi.spyOn(window, 'addEventListener');
  store = createPageDataStore();
  store.start();
  installedListeners.push(...add.mock.calls.map((call) => call[1]));
  add.mockRestore();
}

describe('chatgpt-bridge-data-observer', () => {
  beforeEach(() => {
    delete (window as ObserverWindow).__gvChatGptBridgeDataObserver;
    answers.clear();
    posted = [];
    pageFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input instanceof Request ? input.url : input), location.href);
      const key = `${url.pathname}${url.searchParams.has('cursor') ? `#${url.searchParams.get('cursor')}` : ''}`;
      const body = answers.get(key);
      return body === undefined
        ? new Response('{}', { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 });
    });
    window.fetch = pageFetch as unknown as typeof fetch;
    // jsdom's postMessage sets neither `source` nor `origin`; a browser sets both.
    vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
      setTimeout(() => {
        window.dispatchEvent(
          new MessageEvent('message', { data, source: window, origin: location.origin }),
        );
      }, 0);
    });
    window.addEventListener('message', onMessage);
    install();
  });

  afterEach(() => {
    for (const listener of installedListeners) window.removeEventListener('message', listener);
    window.removeEventListener('message', onMessage);
    window.fetch = realFetch;
    history.pushState = realPushState;
    history.replaceState = realReplaceState;
    vi.restoreAllMocks();
  });

  it("wakes the bridge's waits when the page's router moves, once armed", async () => {
    history.pushState(null, '', '/c/before-arm');
    await settle();
    expect(posted.filter((message) => message.includes('"route"'))).toEqual([]);

    startStore();
    const wakes: string[] = [];
    store.subscribe((reason) => wakes.push(reason));
    await settle();
    wakes.length = 0;
    history.pushState(null, '', '/g/project');
    history.replaceState(null, '', '/g/project?tab=sources');
    await settle();

    expect(`${location.pathname}${location.search}`).toBe('/g/project?tab=sources');
    expect(wakes).toEqual(['route', 'route']);
  });

  it('calls the projects whole only once a sidebar page answers with no further cursor', async () => {
    startStore();
    answers.set('/backend-api/gizmos/snorlax/sidebar', {
      items: [sidebarItem(PROJECT_A, '论文 Q3', [])],
      cursor: 'page-2',
    });
    answers.set('/backend-api/gizmos/snorlax/sidebar#page-2', {
      items: [sidebarItem(PROJECT_B, '实验记录', [])],
      cursor: null,
    });

    await window.fetch(SIDEBAR);
    await settle();
    expect(store.projects()).toEqual({
      projects: [{ projectId: PROJECT_A, name: '论文 Q3' }],
      complete: false,
    });

    await window.fetch(`${SIDEBAR}&cursor=page-2`);
    await settle();
    expect(store.projects()).toEqual({
      projects: [
        { projectId: PROJECT_A, name: '论文 Q3' },
        { projectId: PROJECT_B, name: '实验记录' },
      ],
      complete: true,
    });
  });

  it('keeps what ChatGPT answered before the bridge armed it, and reports it on arm', async () => {
    answers.set('/backend-api/gizmos/snorlax/sidebar', {
      items: [sidebarItem(PROJECT_A, '论文 Q3', ['repo.zip'])],
      cursor: null,
    });
    answers.set(`/backend-api/conversations/${CONVERSATION}`, {
      current_node: 'msg-9',
      messages: [{ content: { parts: ['private text'] } }],
    });
    await window.fetch(SIDEBAR);
    await window.fetch(`/backend-api/conversations/${CONVERSATION}?num_turns=10`);
    await settle();
    expect(posted.filter((message) => !message.includes('"ready"'))).toEqual([]);

    startStore();
    await settle();
    expect(store.projects()?.complete).toBe(true);
    expect(store.files(PROJECT_A)).toMatchObject({ names: ['repo.zip'], source: 'sidebar' });
    expect(store.currentNode(CONVERSATION)).toBe('msg-9');
    for (const text of ['private text', 'secret chat title', 'j@example.com', 'notes']) {
      expect(posted.join('\n')).not.toContain(text);
    }
  });

  it("follows a project's files through its own answer and the answers to an upload and a removal", async () => {
    startStore();
    answers.set(`/backend-api/gizmos/${PROJECT_A}`, {
      gizmo: { id: PROJECT_A },
      files: [{ name: 'repo.zip' }],
    });
    await window.fetch(`/backend-api/gizmos/${PROJECT_A}?include_file_limits=true`);
    await settle();
    expect(store.files(PROJECT_A)).toMatchObject({ names: ['repo.zip'], source: 'project' });

    answers.set(`/backend-api/projects/${PROJECT_A}/files`, {
      resource: { files: [{ name: 'repo.zip' }, { name: 'paper.pdf' }] },
    });
    await window.fetch(`/backend-api/projects/${PROJECT_A}/files`, { method: 'POST' });
    await settle();
    expect(store.files(PROJECT_A)?.names).toEqual(['repo.zip', 'paper.pdf']);

    answers.set(`/backend-api/projects/${PROJECT_A}/files/file-1`, {
      resource: { files: [{ name: 'paper.pdf' }] },
    });
    await window.fetch(`/backend-api/projects/${PROJECT_A}/files/file-1`, { method: 'DELETE' });
    await settle();
    expect(store.files(PROJECT_A)?.names).toEqual(['paper.pdf']);
  });

  it("does not let a later sidebar page replace a project's own file list", async () => {
    startStore();
    answers.set(`/backend-api/gizmos/${PROJECT_A}`, { files: [{ name: 'new.zip' }] });
    answers.set('/backend-api/gizmos/snorlax/sidebar', {
      items: [sidebarItem(PROJECT_A, '论文 Q3', ['old.zip'])],
      cursor: null,
    });
    await window.fetch(`/backend-api/gizmos/${PROJECT_A}`);
    await window.fetch(SIDEBAR);
    await settle();

    expect(store.files(PROJECT_A)).toMatchObject({ names: ['new.zip'], source: 'project' });
  });

  it("hands the page ChatGPT's own response and sends no request of its own", async () => {
    answers.set(`/backend-api/conversations/${CONVERSATION}`, { current_node: 'msg-1' });
    const response = await window.fetch(`/backend-api/conversations/${CONVERSATION}`);
    await settle();

    expect(pageFetch).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ current_node: 'msg-1' });
  });

  it('ignores a failed answer and a response that is not the shape ChatGPT sends', async () => {
    startStore();
    await window.fetch(`/backend-api/gizmos/${PROJECT_A}`); // 404
    answers.set(`/backend-api/gizmos/${PROJECT_B}`, { files: [{ size: 3 }] });
    await window.fetch(`/backend-api/gizmos/${PROJECT_B}`);
    await settle();

    expect(store.files(PROJECT_A)).toBeNull();
    expect(store.files(PROJECT_B)).toBeNull();
  });
});
