import { describe, expect, it } from 'vitest';

import { createWriteQueue } from '../writeQueue';

describe('createWriteQueue', () => {
  it('starts a turn only after the previous one settles, even when it throws', async () => {
    const serialize = createWriteQueue();
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));

    const first = serialize(async () => {
      events.push('first:start');
      await gate;
      events.push('first:end');
      throw new Error('first failed');
    });
    const second = serialize(async () => {
      events.push('second');
      return 2;
    });
    await Promise.resolve();
    release();

    await expect(first).rejects.toThrow('first failed');
    await expect(second).resolves.toBe(2);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });
});
