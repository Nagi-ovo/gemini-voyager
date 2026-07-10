import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HistoryTimestampStore,
  extractHistoryTurns,
  matchTimestampsToMarkers,
  normalizeTurnText,
} from '../historyTimestamps';

const CID = 'c_26dfc929fd75fe3d';
const NATIVE_ID = '26dfc929fd75fe3d';

/**
 * A turn mirroring the hNvQHb payload shape captured from a real
 * conversation load (2026-07): ids tuple, query wrap at [2][0][0], model
 * response candidates, metadata, and the `[seconds, nanos]` pair as a direct
 * child near the end.
 */
function makeTurn(userText: string, epochSec: number, nanos = 261_574_000, cid = CID): unknown[] {
  return [
    [cid, 'r_b6eb23222c6b10a2'],
    [cid, 'r_a23872877afd8022', 'rc_27a9438ecdf0a13d'],
    [[userText, null, null, null, [[]]], 2, null, 1, '56fdd199312815e2', null, null, null, false],
    [[['rc_b2d1629d6a044d8a', ['model answer text'], null, null, null, null, null, [2], 'zh']]],
    [null, null, null, null, null, null, null, null, null, '3.5 Flash Extended', null, null, 1, 2],
    [epochSec, nanos],
  ];
}

/** Wrap turns into the response envelope the observer bridges over. */
function makeEnvelope(turns: unknown[][]): string {
  const payload = JSON.stringify([turns, null, null, null]);
  const rows = JSON.stringify([
    ['wrb.fr', 'hNvQHb', payload, null, null, null, 'generic'],
    ['di', 265],
    ['af.httprm', 264, '-1206762670527833069', 51],
  ]);
  return `)]}'\n\n${rows.length}\n${rows}\n25\n[["e",4,null,null,226]]\n`;
}

let captureSequence = 0;

function postCapture(body: string, id = `test-capture:${++captureSequence}`): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { source: 'gv-history-observer', type: 'capture', payload: { id, body } },
      origin: window.location.origin,
      source: window as unknown as MessageEventSource,
    }),
  );
}

describe('extractHistoryTurns', () => {
  it('extracts per-turn timestamps from a conversation payload', () => {
    const payload = JSON.parse(
      JSON.stringify([
        [makeTurn('第一个问题', 1_783_370_737), makeTurn('第二个问题', 1_783_370_831)],
      ]),
    );
    const byCid = extractHistoryTurns(payload);

    expect(byCid.size).toBe(1);
    const turns = byCid.get(CID);
    expect(turns).toHaveLength(2);
    expect(turns?.[0]).toEqual({ userText: '第一个问题', timestampMs: 1_783_370_737_262 });
    expect(turns?.[1]).toEqual({ userText: '第二个问题', timestampMs: 1_783_370_831_262 });
  });

  it('collapses whitespace in user text', () => {
    const byCid = extractHistoryTurns([[makeTurn('line one\n\n  line two', 1_783_370_737)]]);
    expect(byCid.get(CID)?.[0].userText).toBe('line one line two');
  });

  it('returns empty for non-array payloads', () => {
    expect(extractHistoryTurns(null).size).toBe(0);
    expect(extractHistoryTurns('x').size).toBe(0);
    expect(extractHistoryTurns([1, 2]).size).toBe(0);
  });

  it('skips turns without a plausible timestamp pair', () => {
    const turn = makeTurn('问题', 1_783_370_737);
    turn.pop(); // drop the [sec, nanos] pair
    expect(extractHistoryTurns([[turn]]).size).toBe(0);
  });

  it('skips turns without user text', () => {
    const turn = makeTurn('问题', 1_783_370_737);
    turn[2] = [[null], 2, null, 1];
    expect(extractHistoryTurns([[turn]]).size).toBe(0);
  });

  it('rejects timestamp-shaped pairs outside the epoch sanity window', () => {
    // e.g. the [2] flag arrays and [1, 2] metadata must not be read as times
    const turn = makeTurn('问题', 1_783_370_737);
    turn[turn.length - 1] = [12345, 42];
    expect(extractHistoryTurns([[turn]]).size).toBe(0);
  });
});

describe('matchTimestampsToMarkers', () => {
  const turns = [
    { userText: '第二个问题', timestampMs: 2000 },
    { userText: '第一个问题', timestampMs: 1000 },
  ];

  it('matches markers to turns by exact text regardless of payload order', () => {
    const result = matchTimestampsToMarkers(turns, [
      { id: 'u-0', text: '第一个问题' },
      { id: 'u-1', text: '第二个问题' },
    ]);
    expect(result.get('u-0')).toBe(1000);
    expect(result.get('u-1')).toBe(2000);
  });

  it('assigns duplicate texts chronologically in DOM order', () => {
    const result = matchTimestampsToMarkers(
      [
        { userText: '同样的问题', timestampMs: 5000 },
        { userText: '同样的问题', timestampMs: 3000 },
      ],
      [
        { id: 'u-0', text: '同样的问题' },
        { id: 'u-1', text: '同样的问题' },
      ],
    );
    expect(result.get('u-0')).toBe(3000);
    expect(result.get('u-1')).toBe(5000);
  });

  it('leaves unmatched markers alone', () => {
    const result = matchTimestampsToMarkers(turns, [{ id: 'u-0', text: '完全不同的内容' }]);
    expect(result.size).toBe(0);
  });

  it('falls back to a unique prefix match for drifted tails', () => {
    const result = matchTimestampsToMarkers(
      [{ userText: 'a long enough question about timestamps, full tail', timestampMs: 7000 }],
      [{ id: 'u-0', text: 'a long enough question about timestamps' }],
    );
    expect(result.get('u-0')).toBe(7000);
  });

  it('refuses prefix matches that are short or ambiguous', () => {
    expect(
      matchTimestampsToMarkers(
        [{ userText: 'short text!', timestampMs: 7000 }],
        [{ id: 'u-0', text: 'short text' }],
      ).size,
    ).toBe(0);

    expect(
      matchTimestampsToMarkers(
        [
          { userText: 'a long enough question about timestamps A', timestampMs: 1 },
          { userText: 'a long enough question about timestamps B', timestampMs: 2 },
        ],
        [{ id: 'u-0', text: 'a long enough question about timestamps' }],
      ).size,
    ).toBe(0);
  });
});

describe('normalizeTurnText', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeTurnText('  a\n\tb  c ')).toBe('a b c');
  });
});

describe('HistoryTimestampStore', () => {
  let store: HistoryTimestampStore | null = null;

  afterEach(() => {
    store?.stop();
    store = null;
  });

  it('ingests bridged captures and exposes turns by native conversation id', () => {
    store = new HistoryTimestampStore();
    const onUpdate = vi.fn();
    store.start(true);
    store.subscribe(onUpdate);

    postCapture(makeEnvelope([makeTurn('第一个问题', 1_783_370_737)]));

    expect(onUpdate).toHaveBeenCalledWith([CID]);
    expect(store.getTurns(NATIVE_ID)).toEqual([
      { userText: '第一个问题', timestampMs: 1_783_370_737_262 },
    ]);
    expect(store.getTurns('unknown')).toBeNull();
  });

  it('merges later captures and dedupes repeats without re-notifying', () => {
    store = new HistoryTimestampStore();
    const onUpdate = vi.fn();
    store.start(true);
    store.subscribe(onUpdate);

    const body = makeEnvelope([makeTurn('第一个问题', 1_783_370_737)]);
    expect(store.getRevision(NATIVE_ID)).toBe(0);

    postCapture(body, 'capture-a');
    const firstRevision = store.getRevision(NATIVE_ID);
    expect(firstRevision).toBeGreaterThan(0);

    postCapture(
      makeEnvelope([makeTurn('这个响应使用了重复 ID，不应再次解析', 1_783_370_800)]),
      'capture-a',
    );
    postCapture(body, 'capture-a-repeat');
    expect(store.getRevision(NATIVE_ID)).toBe(firstRevision);

    postCapture(makeEnvelope([makeTurn('第二个问题', 1_783_370_831)]));

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(store.getTurns(NATIVE_ID)).toHaveLength(2);
    expect(store.getRevision(NATIVE_ID)).toBeGreaterThan(firstRevision);
  });

  it('ignores foreign messages and malformed bodies', () => {
    store = new HistoryTimestampStore();
    const onUpdate = vi.fn();
    store.start(true);
    store.subscribe(onUpdate);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { source: 'someone-else', type: 'capture', payload: { body: 'x' } },
        origin: window.location.origin,
        source: window as unknown as MessageEventSource,
      }),
    );
    postCapture('not a batchexecute response');
    postCapture(')]}\'\n\n10\n[["wrb.fr","hNvQHb","not json",null,null,null,"generic"]]');

    expect(onUpdate).not.toHaveBeenCalled();
    expect(store.getTurns(NATIVE_ID)).toBeNull();
  });

  it('stops listening after dispose', () => {
    store = new HistoryTimestampStore();
    const onUpdate = vi.fn();
    store.start(true);
    store.subscribe(onUpdate);
    store.stop();

    postCapture(makeEnvelope([makeTurn('第一个问题', 1_783_370_737)]));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('keeps parsed data across UI subscriber replacement', () => {
    store = new HistoryTimestampStore();
    store.start(true);
    const firstSubscriber = vi.fn();
    const unsubscribe = store.subscribe(firstSubscriber);

    postCapture(makeEnvelope([makeTurn('第一个问题', 1_783_370_737)]), 'capture-a');
    unsubscribe();

    const secondSubscriber = vi.fn();
    store.subscribe(secondSubscriber);
    expect(store.getTurns(NATIVE_ID)).toEqual([
      { userText: '第一个问题', timestampMs: 1_783_370_737_262 },
    ]);

    postCapture(makeEnvelope([makeTurn('第二个问题', 1_783_370_831)]), 'capture-b');
    expect(firstSubscriber).toHaveBeenCalledTimes(1);
    expect(secondSubscriber).toHaveBeenCalledWith([CID]);
  });

  it('acks captures without decoding while disabled', () => {
    store = new HistoryTimestampStore();
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    const onUpdate = vi.fn();
    store.start(false);
    store.subscribe(onUpdate);
    postMessage.mockClear();

    postCapture(makeEnvelope([makeTurn('不应解析', 1_783_370_737)]), 'disabled-capture');

    expect(onUpdate).not.toHaveBeenCalled();
    expect(store.getTurns(NATIVE_ID)).toBeNull();
    expect(postMessage).toHaveBeenCalledWith(
      {
        source: 'gv-history-observer-cmd',
        type: 'ack',
        payload: { id: 'disabled-capture' },
      },
      window.location.origin,
    );
  });

  it('starts idempotently and clears parsed data when disabled', () => {
    store = new HistoryTimestampStore();
    const addEventListener = vi.spyOn(window, 'addEventListener');
    store.start(true);
    store.start(true);

    const messageRegistrations = addEventListener.mock.calls.filter(([type]) => type === 'message');
    expect(messageRegistrations).toHaveLength(1);

    postCapture(makeEnvelope([makeTurn('第一个问题', 1_783_370_737)]), 'capture-a');
    expect(store.getTurns(NATIVE_ID)).not.toBeNull();
    const firstRevision = store.getRevision(NATIVE_ID);
    expect(firstRevision).toBeGreaterThan(0);

    store.setEnabled(false);
    expect(store.getTurns(NATIVE_ID)).toBeNull();
    expect(store.getRevision(NATIVE_ID)).toBe(0);

    store.setEnabled(true);
    postCapture(makeEnvelope([makeTurn('第一个问题', 1_783_370_737)]), 'capture-b');
    expect(store.getRevision(NATIVE_ID)).toBeGreaterThan(firstRevision);
  });

  it('tracks setting changes while no TimelineManager subscriber exists', () => {
    store = new HistoryTimestampStore();
    const addListener = chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>;
    const callIndex = addListener.mock.calls.length;
    store.start(false);
    const storageListener = addListener.mock.calls[callIndex][0] as (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => void;

    storageListener(
      {
        gvShowMessageTimestamps: {
          oldValue: false,
          newValue: true,
        },
      },
      'sync',
    );
    postCapture(makeEnvelope([makeTurn('切换期间捕获', 1_783_370_737)]), 'capture-during-gap');

    const subscriber = vi.fn();
    store.subscribe(subscriber);
    expect(store.getTurns(NATIVE_ID)).toEqual([
      { userText: '切换期间捕获', timestampMs: 1_783_370_737_262 },
    ]);
    expect(subscriber).not.toHaveBeenCalled();
  });

  it('bounds parsed conversation history with an LRU', () => {
    store = new HistoryTimestampStore();
    store.start(true);

    for (let index = 0; index < 17; index++) {
      const cid = `c_${String(index).padStart(16, '0')}`;
      postCapture(
        makeEnvelope([makeTurn(`问题 ${index}`, 1_783_370_737 + index, 0, cid)]),
        `capture-${index}`,
      );
    }

    expect(store.getTurns('0000000000000000')).toBeNull();
    expect(store.getRevision('0000000000000000')).toBe(0);
    expect(store.getTurns('0000000000000016')).toEqual([
      { userText: '问题 16', timestampMs: 1_783_370_753_000 },
    ]);
    expect(store.getRevision('0000000000000016')).toBeGreaterThan(0);
  });
});
