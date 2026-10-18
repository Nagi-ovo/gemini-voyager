// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type BlobRef, PROJECT_OP_NAMES, isOpName } from '@/features/bridge/protocol';

import {
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

/** jsdom has no DataTransfer and only takes a native FileList; ChatGPT's page gets both. */
class FakeDataTransfer {
  private readonly list: File[] = [];
  readonly items = { add: (file: File) => this.list.push(file) };
  get files(): File[] {
    return [...this.list];
  }
}

const SOURCES = `/g/${PROJECT_A.id}/project?tab=sources`;
const EXISTING = [
  { name: 'repo.zip', uploadedAt: '2026-10-18T08:00:00.000Z' },
  { name: 'notes.md', uploadedAt: '2026-10-18T08:05:00.000Z' },
];

let fixture: ProjectPageFixture;
let bridge: Harness;
let stored: Map<string, Uint8Array>;

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function blobOf(name: string, bytes = Uint8Array.from([1, 2, 3, 4, 5])): BlobRef {
  const blobId = `b-${stored.size + 1}`;
  stored.set(blobId, bytes);
  return { blobId, name, size: bytes.length, sha256: sha256(bytes), mime: 'application/zip' };
}

/** The background: serves stored blobs as base64. */
function background(message: Record<string, unknown>): unknown {
  if (message.type !== 'gv.bridge.blob.read') return undefined;
  const bytes = stored.get(String(message.blobId));
  if (!bytes) return { ok: false, error: { code: 'bad-request', message: 'unknown blob' } };
  const offset = Number(message.offset);
  const chunk = bytes.subarray(offset, offset + Number(message.length));
  return { ok: true, base64: Buffer.from(chunk).toString('base64') };
}

function mount(options: ProjectPageOptions = {}): void {
  fixture = mountProjectPage({ route: SOURCES, files: EXISTING, ...options });
  bridge = createHarness(background);
}

/** Let real async work (sha256) finish while the fake clock moves `ms`. */
async function advance(ms: number): Promise<void> {
  const step = 100;
  for (let spent = 0; spent < ms; spent += step) {
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(step);
  }
}

const reads = () => bridge.sent.filter((message) => message.type === 'gv.bridge.blob.read');

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  // The fixture dates a finished upload 09:30; the page clock sits just before it.
  vi.setSystemTime(new Date('2026-10-18T09:29:00.000Z'));
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  vi.stubGlobal('DataTransfer', FakeDataTransfer);
  stored = new Map();
});

afterEach(() => {
  const running = bridge?.runtime.runningTaskId;
  if (running) bridge.runtime.abort(running);
  document.querySelector('[role="menu"]')?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.runIf(registered)('Local Bridge project.files', () => {
  it("lists the project's files with their upload times", async () => {
    mount();
    bridge.start('project.files', { projectId: PROJECT_A.id });
    await advance(3_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: {
        projectId: PROJECT_A.id,
        files: [
          { name: 'repo.zip', uploadedAt: '2026-10-18T08:00:00.000Z' },
          { name: 'notes.md', uploadedAt: '2026-10-18T08:05:00.000Z' },
        ],
      },
    });
  });

  it('opens the sources view first when the project shows its chats', async () => {
    mount({ route: `/g/${PROJECT_A.id}/project` });
    bridge.start('project.files', { projectId: PROJECT_A.id });
    await advance(3_000);

    expect(bridge.outcome()).toMatchObject({ ok: true, data: { files: [{}, {}] } });
    expect(new URLSearchParams(location.search).get('tab')).toBe('sources');
  });

  it('refuses a tab that shows another project, before any page event', async () => {
    mount();
    bridge.start('project.files', { projectId: PROJECT_B.id });
    await advance(500);

    expect(errorCode(bridge.outcome())).toBe('unverified');
    expect(fixture.page.events().clicks).toBe(0);
  });
});

describe.runIf(registered)('Local Bridge project.upload', () => {
  it('hands the verified file to the sources input and confirms it is listed once', async () => {
    mount();
    bridge.start('project.upload', { projectId: PROJECT_A.id, blob: blobOf('paper.zip') });
    await advance(5_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: {
        uploaded: { name: 'paper.zip', uploadedAt: '2026-10-18T09:30:00.000Z' },
        files: [{ name: 'repo.zip' }, { name: 'notes.md' }, { name: 'paper.zip' }],
      },
    });
    expect(fixture.counts).toMatchObject({ uploadChanges: 1, wrongInputChanges: 0 });
  });

  it('waits while the new row still shows as uploading', async () => {
    mount({ uploadBusyMs: 6_000 });
    bridge.start('project.upload', { projectId: PROJECT_A.id, blob: blobOf('paper.zip') });
    await advance(4_000);
    expect(bridge.outcome()).toBeUndefined();
    await advance(8_000);

    expect(bridge.outcome()).toMatchObject({ ok: true, data: { uploaded: { name: 'paper.zip' } } });
  });

  it('refuses a name the project already holds, which ChatGPT would silently ignore', async () => {
    mount();
    bridge.start('project.upload', { projectId: PROJECT_A.id, blob: blobOf('repo.zip') });
    await advance(3_000);

    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('bad-request');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({ reason: 'name-exists' });
    expect(fixture.counts).toMatchObject({ uploadChanges: 0, ignoredUploads: 0 });
    expect(reads()).toHaveLength(0);
  });

  it('does not take an older file the list showed late for the upload ChatGPT ignored', async () => {
    vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
    mount({ listLoadsAfterMs: 6_000 });
    bridge.start('project.upload', { projectId: PROJECT_A.id, blob: blobOf('repo.zip') });
    await advance(12_000);

    const outcome = bridge.outcome();
    expect(fixture.counts.ignoredUploads).toBe(1);
    expect(errorCode(outcome)).toBe('unverified');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({ reason: 'older-file' });
  });

  it('fails attachment-rejected when the file never shows in the list', async () => {
    mount({ uploadShowsAfterMs: null });
    bridge.start('project.upload', { projectId: PROJECT_A.id, blob: blobOf('paper.zip') });
    await advance(30_000);

    expect(errorCode(bridge.outcome())).toBe('attachment-rejected');
    expect(fixture.counts.uploadChanges).toBe(1);
  });
});

describe.runIf(registered)('Local Bridge project.remove', () => {
  it("opens the row's menu, presses 「删除」 once and confirms the row is gone", async () => {
    mount();
    bridge.start('project.remove', { projectId: PROJECT_A.id, name: 'notes.md' });
    await advance(4_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { removed: 'notes.md', files: [{ name: 'repo.zip' }] },
    });
    expect(fixture.files()).toEqual(['repo.zip']);
    expect(fixture.counts).toMatchObject({ menuOpens: 1, downloadClicks: 0 });
  });

  it('refuses a name the project does not list, before any page event', async () => {
    mount();
    bridge.start('project.remove', { projectId: PROJECT_A.id, name: 'missing.md' });
    await advance(3_000);

    expect(errorCode(bridge.outcome())).toBe('not-found');
    expect(fixture.counts.menuOpens).toBe(0);
    expect(fixture.page.events().clicks).toBe(0);
  });

  it('reports a file still listed after 「删除」 as unverified', async () => {
    mount({ removeWorks: false });
    bridge.start('project.remove', { projectId: PROJECT_A.id, name: 'notes.md' });
    await advance(15_000);

    expect(errorCode(bridge.outcome())).toBe('unverified');
    expect(fixture.files()).toEqual(['repo.zip', 'notes.md']);
  });
});
