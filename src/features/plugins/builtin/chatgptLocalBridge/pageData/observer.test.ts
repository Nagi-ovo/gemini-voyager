// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type PageDownloadReply, createPageDownloader } from './download';
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
/** What the page sends with its backend-api requests; none of it may leave the page world. */
const PAGE_HEADERS = {
  Authorization: 'Bearer tok-page-SECRET',
  'ChatGPT-Account-Id': 'acct-SECRET',
  'OAI-Device-Id': 'did-SECRET',
  originator: 'orig-SECRET',
  'x-openai-web-frontend': 'frontend-SECRET',
};
const SECRETS = [...Object.values(PAGE_HEADERS), 'tok-REFRESHED', 'tok-page'];
const FILE_BYTES = [80, 75, 3, 4, 9];

/** A conversation answer's mapping node, as ChatGPT sends it. */
function node(
  id: string,
  parent: string | null,
  message: { role: string; channel?: string | null; parts?: unknown[] } | null,
) {
  return {
    id,
    parent,
    children: [],
    message: message && {
      id,
      author: { role: message.role },
      ...(message.channel === undefined ? {} : { channel: message.channel }),
      content: { content_type: 'text', parts: message.parts ?? [] },
    },
  };
}

interface SeenRequest {
  readonly url: URL;
  readonly headers: Headers;
}

/** Plays ChatGPT's download endpoints; `answer` decides the interpreter endpoint's status. */
function servePageDownloads(
  answer: (messageId: string, headers: Headers) => number,
): SeenRequest[] {
  const seen: SeenRequest[] = [];
  pageFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input), location.href);
    const headers = new Headers(init?.headers);
    seen.push({ url, headers });
    if (url.pathname === '/api/auth/session') {
      return Response.json({ accessToken: 'tok-REFRESHED', user: { email: 'j@example.com' } });
    }
    if (url.pathname.endsWith('/interpreter/download')) {
      const status = answer(url.searchParams.get('message_id') ?? '', headers);
      return status === 200
        ? Response.json({
            status: 'success',
            download_url: '/backend-api/estuary/content?id=file-1&sig=abc',
            file_name: 'report.zip',
            mime_type: 'application/zip',
            file_size_bytes: null,
          })
        : Response.json({ detail: 'Library file not found' }, { status });
    }
    if (url.pathname === '/backend-api/estuary/content') {
      return new Response(new Uint8Array(FILE_BYTES), { status: 200 });
    }
    return Response.json({});
  });
  return seen;
}

function downloadOnce(messageIds: string[]): Promise<PageDownloadReply> {
  return createPageDownloader()(
    {
      conversationId: CONVERSATION,
      messageIds,
      sandboxPath: '/mnt/data/report.zip',
      maxBytes: 1024,
    },
    new AbortController().signal,
  );
}

/** Every message posted in the page, in either direction. */
function everythingPosted(): string {
  return vi
    .mocked(window.postMessage)
    .mock.calls.map((call) => JSON.stringify(call[0]))
    .join('\n');
}

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

  it("reports only the links of the reply's final text on the branch the conversation ends on", async () => {
    startStore();
    answers.set(`/backend-api/conversation/${CONVERSATION}`, {
      current_node: 'a-final',
      mapping: {
        root: node('root', null, null),
        'u-1': node('u-1', 'root', {
          role: 'user',
          parts: ['private prompt [mine](sandbox:/mnt/data/upload.csv)'],
        }),
        'a-think': node('a-think', 'u-1', {
          role: 'assistant',
          channel: 'analysis',
          parts: ['I will write [draft](sandbox:/mnt/data/draft.csv)'],
        }),
        'a-tool': node('a-tool', 'a-think', { role: 'tool', parts: ['stdout'] }),
        'a-final': node('a-final', 'a-tool', {
          role: 'assistant',
          channel: 'final',
          parts: [
            'Done: [the report](sandbox:/mnt/data/report.zip) and [a chart](sandbox:/mnt/data/chart one.png).',
          ],
        }),
        'a-other': node('a-other', 'u-1', {
          role: 'assistant',
          channel: 'final',
          parts: ['[branch](sandbox:/mnt/data/branch.csv)'],
        }),
      },
    });
    await window.fetch(`/backend-api/conversation/${CONVERSATION}`);
    await settle();

    expect(store.currentNode(CONVERSATION)).toBe('a-final');
    expect(store.messages(CONVERSATION)).toEqual([
      { id: 'root', role: '', links: [] },
      { id: 'u-1', role: 'user', links: [] },
      { id: 'a-think', role: 'assistant', links: [] },
      { id: 'a-tool', role: 'tool', links: [] },
      {
        id: 'a-final',
        role: 'assistant',
        links: [
          { label: 'the report', href: 'sandbox:/mnt/data/report.zip' },
          { label: 'a chart', href: 'sandbox:/mnt/data/chart one.png' },
        ],
      },
    ]);
    expect(posted.join('\n')).not.toContain('private prompt');
    expect(posted.join('\n')).not.toContain('stdout');
  });

  it('reads the sandbox links of the message list the page asks for when it opens a chat', async () => {
    startStore();
    const listed = (id: string, role: string, channel: string | null, parts: string[]) => ({
      ...node(id, null, { role, channel, parts }).message,
    });
    answers.set(`/backend-api/conversations/${CONVERSATION}`, {
      current_node: 'a-final',
      messages: [
        listed('u-1', 'user', null, ['private prompt']),
        listed('a-tool', 'tool', null, ['stdout']),
        listed('a-final', 'assistant', null, ['[下载 probe.txt](sandbox:/mnt/data/probe.txt)']),
      ],
      page_info: { has_previous_page: false, has_next_page: false },
    });
    await window.fetch(`/backend-api/conversations/${CONVERSATION}?num_turns=20`);
    await settle();

    expect(store.messages(CONVERSATION)).toEqual([
      { id: 'u-1', role: 'user', links: [] },
      { id: 'a-tool', role: 'tool', links: [] },
      {
        id: 'a-final',
        role: 'assistant',
        links: [{ label: '下载 probe.txt', href: 'sandbox:/mnt/data/probe.txt' }],
      },
    ]);
    expect(posted.join('\n')).not.toContain('private prompt');
  });

  it("falls back to the turn's next message when the link's own message answers 404", async () => {
    await window.fetch('/backend-api/me', { headers: PAGE_HEADERS });
    const seen = servePageDownloads((messageId) => (messageId === 'msg-link' ? 404 : 200));
    const reply = await downloadOnce(['msg-link', 'msg-final', 'msg-tool']);

    expect(reply).toMatchObject({ ok: true, name: 'report.zip', mime: 'application/zip' });
    expect(reply.ok && reply.messageId).toBe('msg-final');
    expect(reply.ok && Array.from(new Uint8Array(reply.bytes))).toEqual(FILE_BYTES);
    const asked = seen.filter((request) => request.url.pathname.endsWith('/interpreter/download'));
    expect(asked.map((request) => request.url.searchParams.get('message_id'))).toEqual([
      'msg-link',
      'msg-final',
    ]);
    // The page's own headers, as the page last sent them.
    expect(asked[0].headers.get('authorization')).toBe(PAGE_HEADERS.Authorization);
    expect(asked[0].headers.get('chatgpt-account-id')).toBe('acct-SECRET');
    expect(asked[0].headers.get('originator')).toBe('orig-SECRET');
    expect(asked[0].url.searchParams.get('sandbox_path')).toBe('/mnt/data/report.zip');
    // The file itself comes with the page's cookies, not its token.
    const file = seen.find((request) => request.url.pathname === '/backend-api/estuary/content');
    expect(file?.headers.get('authorization')).toBeNull();
  });

  it('never posts the access token or the page headers, also after refreshing a token', async () => {
    await window.fetch('/backend-api/me', { headers: PAGE_HEADERS });
    const seen = servePageDownloads((_id, headers) =>
      headers.get('authorization') === 'Bearer tok-REFRESHED' ? 200 : 401,
    );
    startStore();
    const reply = await downloadOnce(['msg-link']);
    await settle();

    expect(reply.ok).toBe(true);
    expect(seen.map((request) => request.url.pathname)).toContain('/api/auth/session');
    const all = everythingPosted();
    for (const secret of SECRETS) expect(all).not.toContain(secret);
    expect(all.toLowerCase()).not.toContain('authorization');
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
