import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildInstructionBlock } from '../../folderProject/instructionBlock';
import { DraftStore, draftStoreOptions } from '../draftStore';
import { geminiDraftPolicy } from '../geminiDraftPolicy';

/** Gemini's store; jsdom serves localhost, so the page-eligibility check is lifted here. */
const GEMINI_STORE = { ...draftStoreOptions(geminiDraftPolicy(), document), writable: () => true };

describe('draft storage', () => {
  let records: Record<string, unknown>;

  beforeEach(() => {
    records = {};
    vi.spyOn(chrome.storage.local, 'set').mockImplementation((items, callback) => {
      Object.assign(records, items);
      callback?.();
      return Promise.resolve();
    });
    const get = vi.spyOn(chrome.storage.local, 'get') as unknown as ReturnType<typeof vi.fn>;
    get.mockImplementation(
      (keys: string | null, callback: (items: Record<string, unknown>) => void) => {
        const result = typeof keys === 'string' ? { [keys]: records[keys] } : { ...records };
        callback(result);
      },
    );
    vi.spyOn(chrome.storage.local, 'remove').mockImplementation((keys) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete records[key];
      return Promise.resolve();
    });
    Object.defineProperty(chrome.runtime, 'lastError', {
      get: () => undefined,
      configurable: true,
    });
    vi.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => vi.restoreAllMocks());

  it('stores user text without project instructions and loads it from the same account route', async () => {
    const onSaved = vi.fn();
    const store = new DraftStore(onSaved, GEMINI_STORE);
    const path = '/u/2/app/chat';

    store.save(path, `${buildInstructionBlock('Work', 'Be concise')}  User text  `);

    expect(records[`gvDraft_${path}`]).toEqual({ content: 'User text', timestamp: 1000, path });
    expect(onSaved).toHaveBeenCalledWith(path, 'User text');
    expect(await store.load(path)).toBe('User text');
    expect(await store.load('/u/1/app/chat')).toBeNull();
  });

  it('removes a draft when only project instructions remain', () => {
    const onSaved = vi.fn();
    const store = new DraftStore(onSaved, GEMINI_STORE);
    records['gvDraft_/app/chat'] = { content: 'Old draft' };

    store.save('/app/chat', buildInstructionBlock('Work', 'Be concise'));

    expect(records['gvDraft_/app/chat']).toBeUndefined();
    expect(onSaved).toHaveBeenCalledWith('/app/chat', '');
  });

  it('prunes the oldest drafts after ten successful saves and preserves unrelated storage', () => {
    const store = new DraftStore(vi.fn(), GEMINI_STORE);
    records.otherSetting = 'preserved';
    records['gvDraft:chatgpt:conv:old'] = { content: 'Catalog-site draft', timestamp: 0 };
    records['gvDraft_/app/legacy'] = { content: 'Legacy draft' };
    for (let index = 1; index <= 9; index += 1) {
      vi.mocked(Date.now).mockReturnValue(index);
      store.save(`/app/${index}`, `Draft ${index}`);
    }
    expect(Object.keys(records).filter((key) => key.startsWith('gvDraft_'))).toHaveLength(10);

    vi.mocked(Date.now).mockReturnValue(10);
    store.save('/app/10', 'Draft 10');

    expect(Object.keys(records).filter((key) => key.startsWith('gvDraft_'))).toEqual([
      'gvDraft_/app/6',
      'gvDraft_/app/7',
      'gvDraft_/app/8',
      'gvDraft_/app/9',
      'gvDraft_/app/10',
    ]);
    expect(records.otherSetting).toBe('preserved');
    expect(records['gvDraft:chatgpt:conv:old']).toEqual({
      content: 'Catalog-site draft',
      timestamp: 0,
    });
  });

  it.each([
    ['the tenth save is acknowledged', 'set'],
    ['the prune read returns', 'get'],
  ] as const)(
    'prunes nothing when the page turns out to be Enterprise before %s',
    (_moment, call) => {
      let eligible = true;
      const store = new DraftStore(vi.fn(), { ...GEMINI_STORE, writable: () => eligible });
      for (let index = 1; index <= 9; index += 1) {
        vi.mocked(Date.now).mockReturnValue(index);
        store.save(`/app/${index}`, `Draft ${index}`);
      }
      records['gvDraft_/app/old'] = { content: 'Oldest', timestamp: 0 };
      // Hold the chosen storage call open; Enterprise surfaces before it calls back.
      let answer: () => void = () => {};
      const original = vi.mocked(chrome.storage.local[call]).getMockImplementation() as (
        ...args: unknown[]
      ) => unknown;
      vi.mocked(chrome.storage.local[call]).mockImplementationOnce(((...args: unknown[]) => {
        answer = () => original(...args);
        return Promise.resolve();
      }) as never);
      vi.mocked(Date.now).mockReturnValue(10);
      store.save('/app/10', 'Draft 10');

      eligible = false;
      answer();

      // Turned Enterprise before the prune began, it does not even read every key.
      if (call === 'set') expect(chrome.storage.local.get).not.toHaveBeenCalled();
      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
      expect(records['gvDraft_/app/old']).toEqual({ content: 'Oldest', timestamp: 0 });
    },
  );

  it('reports a save only after storage acknowledges success', () => {
    const onSaved = vi.fn();
    const store = new DraftStore(onSaved, GEMINI_STORE);
    let acknowledge: (() => void) | undefined;
    vi.mocked(chrome.storage.local.set).mockImplementation((_items, callback) => {
      acknowledge = callback;
      return Promise.resolve();
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    store.save('/app/chat', 'User text');
    expect(onSaved).not.toHaveBeenCalled();
    vi.spyOn(chrome.runtime, 'lastError', 'get').mockReturnValue({ message: 'Storage busy' });
    acknowledge?.();
    expect(onSaved).not.toHaveBeenCalled();

    vi.spyOn(chrome.runtime, 'lastError', 'get').mockReturnValue(undefined);
    store.save('/app/chat', 'User text');
    acknowledge?.();
    expect(onSaved).toHaveBeenCalledWith('/app/chat', 'User text');
  });
});
