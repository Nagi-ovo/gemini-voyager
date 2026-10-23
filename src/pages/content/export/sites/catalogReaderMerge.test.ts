import { describe, expect, it } from 'vitest';

import {
  type CatalogMountedSnapshot,
  createCatalogSnapshotAccumulator,
} from './catalogReaderMerge';

function message(
  text: string,
  key = text,
  host = document.createElement('article'),
): CatalogMountedSnapshot {
  const element = document.createElement('article');
  element.textContent = text;
  return {
    id: key,
    nativeId: key,
    role: 'user',
    text,
    element,
    host: new WeakRef(host),
    content: {
      text,
      html: text,
      attachments: [],
      hasImages: false,
      hasFormulas: false,
      hasTables: false,
      hasCode: false,
    },
    fingerprint: text,
  };
}

const texts = (accumulator: ReturnType<typeof createCatalogSnapshotAccumulator>) =>
  accumulator.snapshots().map(({ text }) => text);

describe('catalog keyed window ordering', () => {
  it('orders a pinned tail by the windows it reappears in', () => {
    const accumulator = createCatalogSnapshotAccumulator();
    for (const window of [
      ['A', 'B', 'Z'],
      ['B', 'C', 'D'],
      ['D', 'E', 'F', 'Z'],
    ])
      accumulator.collect(window.map((text) => message(text)));
    expect(texts(accumulator)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'Z']);
    expect(accumulator.uncertain()).toBe(false);
  });

  it('preserves both bodies when a window repeats a native key without multiplying later samples', () => {
    const accumulator = createCatalogSnapshotAccumulator();
    const window = [message('A', '7'), message('B', '7')];
    accumulator.collect(window);
    accumulator.collect(window);
    accumulator.collect([window[0]]);
    expect(texts(accumulator)).toEqual(['A', 'B']);
    expect(new Set(accumulator.snapshots().map(({ id }) => id)).size).toBe(2);
    expect(accumulator.uncertain()).toBe(true);
  });

  it('marks a reused key with another host and body uncertain while keeping its latest body', () => {
    const accumulator = createCatalogSnapshotAccumulator();
    accumulator.collect([message('A', '7')]);
    accumulator.collect([message('B', '7')]);
    expect(texts(accumulator)).toEqual(['B']);
    expect(accumulator.uncertain()).toBe(true);
  });

  it('updates same-host hydration under the same key without retaining drafts or identity doubt', () => {
    const accumulator = createCatalogSnapshotAccumulator();
    const host = document.createElement('article');
    accumulator.collect([message('A'), message('B1', 'reply', host)]);
    accumulator.collect([message('A'), message('B2', 'reply', host)]);
    accumulator.collect([message('A'), message('B3', 'reply', host)]);
    expect(texts(accumulator)).toEqual(['A', 'B3']);
    expect(accumulator.uncertain()).toBe(false);
  });

  it('retains every keyed message and marks contradictory window order uncertain', () => {
    const accumulator = createCatalogSnapshotAccumulator();
    accumulator.collect(['A', 'B', 'C'].map((text) => message(text)));
    accumulator.collect(['C', 'A'].map((text) => message(text)));
    expect(texts(accumulator)).toEqual(['A', 'B', 'C']);
    expect(accumulator.uncertain()).toBe(true);
  });

  it('does not claim the order of a window that shares no message with what was read', () => {
    const accumulator = createCatalogSnapshotAccumulator();
    accumulator.collect([message('C'), message('D')]);
    accumulator.collect([message('A'), message('B')]);
    expect(accumulator.uncertain()).toBe(true);
  });

  it('does not silently keep one message twice when its key changes on the same host', () => {
    const host = document.createElement('article');
    const accumulator = createCatalogSnapshotAccumulator();
    accumulator.collect([message('A', '7', host)]);
    accumulator.collect([message('A', '8', host)]);
    expect(accumulator.uncertain()).toBe(true);
  });
});
