import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { PromptItem } from '@/core/types/sync';
import {
  type PromptLibraryOp,
  type PromptLibraryResult,
  createPromptLibraryOwner,
} from '@/features/prompt/library/promptLibraryOwner';

import {
  PROMPT_LIBRARY_WATCHDOG_MS,
  createPromptLibraryState,
  parseLegacyPromptLibrary,
  readPromptLibrary,
} from '../promptLibraryState';

const KEY = StorageKeys.PROMPT_ITEMS;

const prompt = (id: string, text: string, extra: Partial<PromptItem> = {}): PromptItem => ({
  id,
  name: id.toUpperCase(),
  text,
  tags: [],
  createdAt: 1,
  ...extra,
});

/**
 * A Prompt Manager tab over an in-memory library and its owner, with a clock
 * that counts up from 100. Every write reaches the tab as a `storage.onChanged`
 * value before the owner replies, as it normally does; `echoLater()` holds the
 * next write's value back until released. `write` is another writer's change,
 * which the tab hears of; `setStored` one it has not heard of yet.
 * `hold(later)` keeps the reply to the op sent `later` ops from now from
 * reaching the tab until released, `delay(later)` keeps the op itself from
 * reaching the owner; `failNext()` makes the next write fail and `lose(later)`
 * a reply go missing after the write.
 */
async function tab(initial: unknown, legacy: string | null = null) {
  let stored: unknown = structuredClone(initial);
  let failWrite = false;
  let echoGate: Promise<void> | null = null;
  const echo = (value: unknown) => state.receive(structuredClone(value));
  const area = {
    get: async () => (stored === undefined ? {} : { [KEY]: structuredClone(stored) }),
    set: async (items: Record<string, unknown>) => {
      if (failWrite) {
        failWrite = false;
        throw new Error('quota');
      }
      stored = structuredClone(items[KEY]);
      const value = stored;
      const gate = echoGate;
      echoGate = null;
      if (gate) void gate.then(() => echo(value));
      else echo(value);
    },
  };
  const owner = createPromptLibraryOwner({ area });
  const gates = new Map<number, Promise<void>>();
  let failRead = false;
  const lost = new Set<number>();
  const deliveries = new Map<number, Promise<void>>();
  const sent: PromptLibraryOp[] = [];
  const onReconcile = vi.fn();
  const onWriteFailed = vi.fn();
  const onReadFailed = vi.fn();
  let clock = 100;
  let id = 0;
  const state = createPromptLibraryState({
    read: async () => {
      if (failRead) {
        failRead = false;
        throw new Error('Extension context invalidated.');
      }
      return ((await area.get())[KEY] ?? []) as PromptItem[];
    },
    apply: async (op) => {
      const index = sent.length;
      sent.push(structuredClone(op));
      await deliveries.get(index);
      const result = owner.apply(structuredClone(op));
      await gates.get(index);
      if (!lost.has(index)) return result;
      await result;
      throw new Error('The message port closed before a response was received.');
    },
    readLegacy: () => legacy,
    onReconcile,
    onWriteFailed,
    onReadFailed,
    now: () => clock++,
    makeId: () => `new-${++id}`,
  });
  await state.load();
  const gate = () => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => (release = resolve));
    return { promise, release };
  };
  return {
    state,
    sent,
    onReconcile,
    onWriteFailed,
    onReadFailed,
    stored: () => stored,
    /** Another writer changes the library; the tab hears of it. */
    write: (value: unknown) => {
      stored = structuredClone(value);
      echo(stored);
    },
    /** Another writer changes the library; the tab has not heard of it yet. */
    setStored: (value: unknown) => {
      stored = structuredClone(value);
    },
    /** The tab hears of the library as stored now. */
    echoStored: () => echo(stored),
    echoLater: () => {
      const { promise, release } = gate();
      echoGate = promise;
      return release;
    },
    failNext: () => {
      failWrite = true;
    },
    /** Makes the tab's next read of storage fail. */
    failNextRead: () => {
      failRead = true;
    },
    hold: (later = 0) => {
      const { promise, release } = gate();
      gates.set(sent.length + later, promise);
      return release;
    },
    /** Holds the op sent `later` ops from now on its way to the owner. */
    delay: (later = 0) => {
      const { promise, release } = gate();
      deliveries.set(sent.length + later, promise);
      return release;
    },
    /** The op sent `later` ops from now is written, but its reply is lost. */
    lose: (later = 0) => {
      lost.add(sent.length + later);
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('Prompt Manager library state', () => {
  it('adds a prompt ahead of the library, refusing text it already has', async () => {
    const { state, stored } = await tab([prompt('a', 'Alpha')]);

    await expect(state.add({ name: 'B', text: 'Beta', tags: ['x'] })).resolves.toBe('added');
    await expect(state.add({ name: 'C', text: '  ALPHA ', tags: [] })).resolves.toBe('duplicate');

    const expected = [
      { id: 'new-1', name: 'B', text: 'Beta', tags: ['x'], createdAt: 100 },
      prompt('a', 'Alpha'),
    ];
    expect(state.items).toEqual(expected);
    expect(stored()).toEqual(expected);
  });

  it('reports an add the owner refused because another tab took the text first', async () => {
    const { state, stored, setStored, echoStored, sent } = await tab([prompt('a', 'Alpha')]);
    setStored([prompt('z', 'Beta'), prompt('a', 'Alpha')]);

    await expect(state.add({ name: 'B', text: 'beta', tags: [] })).resolves.toBe('duplicate');
    expect(sent.map((op) => op.kind)).toEqual(['add']);
    expect(stored()).toEqual([prompt('z', 'Beta'), prompt('a', 'Alpha')]);
    // The refused prompt is gone at once; the other tab's arrives with its change.
    expect(state.items).toEqual([prompt('a', 'Alpha')]);
    echoStored();
    expect(state.items).toEqual(stored());
  });

  it('edits a prompt in place, keeping its position and stamping updatedAt', async () => {
    const { state, stored } = await tab([prompt('a', 'Alpha'), prompt('b', 'Beta')]);

    await expect(state.edit('b', { name: 'Bee', text: 'Beta 2', tags: ['t'] })).resolves.toBe(
      'saved',
    );
    await expect(state.edit('b', { name: 'Bee', text: 'alpha', tags: [] })).resolves.toBe(
      'duplicate',
    );
    await expect(state.edit('gone', { name: 'X', text: 'X', tags: [] })).resolves.toBe('missing');

    expect(JSON.stringify(stored())).toBe(
      JSON.stringify([
        prompt('a', 'Alpha'),
        { id: 'b', name: 'Bee', text: 'Beta 2', tags: ['t'], createdAt: 1, updatedAt: 100 },
      ]),
    );
    expect(state.items).toEqual(stored());
  });

  it('reports an edit of a prompt another tab deleted meanwhile as missing', async () => {
    const { state, stored, setStored, echoStored } = await tab([
      prompt('a', 'Alpha'),
      prompt('b', 'Beta'),
    ]);
    setStored([prompt('a', 'Alpha')]);

    await expect(state.edit('b', { name: 'B', text: 'Beta 2', tags: [] })).resolves.toBe('missing');
    expect(stored()).toEqual([prompt('a', 'Alpha')]);
    echoStored();
    expect(state.items).toEqual(stored());
  });

  it('deletes, pins, unpins and reorders, bumping updatedAt on a pin change', async () => {
    const { state, stored } = await tab([prompt('a', 'A'), prompt('b', 'B'), prompt('c', 'C')]);

    state.togglePin('b');
    state.remove('a');
    state.reorder([state.items[1], state.items[0]]);
    // Each change shows at once, before the owner has written it.
    expect(state.items).toEqual([
      prompt('c', 'C'),
      prompt('b', 'B', { pinnedAt: 100, updatedAt: 100 }),
    ]);
    await flush();
    expect(stored()).toEqual(state.items);

    state.togglePin('b');
    await flush();
    expect(JSON.stringify(stored())).toBe(
      JSON.stringify([prompt('c', 'C'), { ...prompt('b', 'B'), pinnedAt: null, updatedAt: 101 }]),
    );
    expect(state.items).toEqual(stored());
  });

  it('ignores its own echo and adopts a library changed elsewhere', async () => {
    const { state } = await tab([prompt('a', 'A')]);
    await state.add({ name: 'B', text: 'B', tags: [] });

    expect(state.receive(structuredClone(state.items))).toBe(false);
    expect(state.receive({ not: 'a list' })).toBe(false);
    expect(state.receive([prompt('z', 'From another tab')])).toBe(true);
    expect(state.items).toEqual([prompt('z', 'From another tab')]);
  });

  it('keeps showing its unanswered ops over an older library from storage', async () => {
    const { state, stored, hold, onReconcile } = await tab([prompt('a', 'A'), prompt('b', 'B')]);
    const release = hold();

    state.reorder([state.items[1], state.items[0]]);
    // A value from before the drop must not undo it while the drop is unanswered.
    expect(state.receive([prompt('a', 'A'), prompt('b', 'B')])).toBe(false);
    expect(state.items.map((item) => item.id)).toEqual(['b', 'a']);

    release();
    await flush();
    expect(stored()).toEqual([prompt('b', 'B'), prompt('a', 'A')]);
    expect(state.items).toEqual(stored());
    expect(onReconcile).not.toHaveBeenCalled();
  });

  it("shows another writer's change under its op before the owner has the op", async () => {
    const { state, stored, write, delay } = await tab([prompt('a', 'A')]);
    const deliver = delay();

    state.togglePin('a');
    write([prompt('a', 'A'), prompt('t', 'Template')]);
    const expected = [prompt('a', 'A', { pinnedAt: 100, updatedAt: 100 }), prompt('t', 'Template')];
    expect(state.items).toEqual(expected);

    deliver();
    await flush();
    expect(stored()).toEqual(expected);
    expect(state.items).toEqual(stored());
  });

  it('rolls back when a write fails, says so, and keeps working', async () => {
    const { state, stored, failNext, onReconcile, onWriteFailed } = await tab([
      prompt('a', 'A'),
      prompt('b', 'B'),
    ]);

    failNext();
    state.reorder([state.items[1], state.items[0]]);
    expect(state.items.map((item) => item.id)).toEqual(['b', 'a']);
    await flush();
    expect(state.items).toEqual([prompt('a', 'A'), prompt('b', 'B')]);
    expect(onReconcile).toHaveBeenCalledTimes(1);
    expect(onWriteFailed).toHaveBeenCalledTimes(1);

    failNext();
    await expect(state.add({ name: 'C', text: 'C', tags: [] })).resolves.toBe('failed');
    expect(state.items).toEqual([prompt('a', 'A'), prompt('b', 'B')]);
    expect(onWriteFailed).toHaveBeenCalledTimes(2);

    failNext();
    await expect(state.remove('a')).resolves.toBe(false);
    expect(state.items).toEqual([prompt('a', 'A'), prompt('b', 'B')]);
    expect(onWriteFailed).toHaveBeenCalledTimes(3);

    await expect(state.remove('a')).resolves.toBe(true);
    expect(stored()).toEqual([prompt('b', 'B')]);
    expect(state.items).toEqual(stored());
    expect(onWriteFailed).toHaveBeenCalledTimes(3);
  });

  it('rolls back only the failed op, keeping a later one still unanswered', async () => {
    const { state, stored, failNext, hold } = await tab([prompt('a', 'A'), prompt('b', 'B')]);

    failNext();
    state.togglePin('a');
    const releaseDelete = hold(1);
    state.remove('b');
    await flush();
    expect(state.items).toEqual([prompt('a', 'A')]);

    releaseDelete();
    await flush();
    expect(stored()).toEqual([prompt('a', 'A')]);
    expect(state.items).toEqual(stored());
  });

  it("sends a tab's ops one at a time, so a late message cannot reorder them", async () => {
    const { state, stored, sent, delay } = await tab([
      prompt('a', 'A'),
      prompt('b', 'B'),
      prompt('c', 'C'),
    ]);
    // The first drop's message is slow to arrive; the second must not overtake it.
    const deliverFirst = delay();

    state.reorder([state.items[2], state.items[0], state.items[1]]);
    state.reorder([state.items[1], state.items[0], state.items[2]]);
    await flush();
    expect(sent).toHaveLength(1);

    deliverFirst();
    await flush();
    expect(sent).toHaveLength(2);
    expect(stored()).toEqual([prompt('a', 'A'), prompt('c', 'C'), prompt('b', 'B')]);
    expect(state.items).toEqual(stored());
  });

  it('rolls back when the owner cannot be reached', async () => {
    const onReconcile = vi.fn();
    const state = createPromptLibraryState({
      read: async () => [prompt('a', 'A'), prompt('b', 'B')],
      apply: () => Promise.reject(new Error('Extension context invalidated.')),
      onReconcile,
    });
    await state.load();

    await expect(state.edit('a', { name: 'A', text: 'A 2', tags: [] })).resolves.toBe('failed');
    expect(state.items).toEqual([prompt('a', 'A'), prompt('b', 'B')]);
    expect(onReconcile).toHaveBeenCalledTimes(1);
  });

  it('keeps the newest drop when overlapping drops settle', async () => {
    const { state, stored, hold } = await tab([
      prompt('a', 'A'),
      prompt('b', 'B'),
      prompt('c', 'C'),
    ]);
    const releaseFirst = hold();

    state.reorder([state.items[2], state.items[0], state.items[1]]);
    state.reorder([state.items[1], state.items[0], state.items[2]]);
    expect(state.items.map((item) => item.id)).toEqual(['a', 'c', 'b']);
    await flush();
    // The first drop is written and its value is in; the second still shows.
    expect(state.items.map((item) => item.id)).toEqual(['a', 'c', 'b']);
    releaseFirst();
    await flush();

    expect(stored()).toEqual([prompt('a', 'A'), prompt('c', 'C'), prompt('b', 'B')]);
    expect(state.items).toEqual(stored());
  });

  it('keeps showing a later change while its reply is still on the way', async () => {
    const { state, stored, hold } = await tab([prompt('a', 'A'), prompt('b', 'B')]);
    const releaseSecond = hold(1);

    state.togglePin('b');
    state.remove('a');
    await flush();
    expect(state.items.map((item) => item.id)).toEqual(['b']);

    releaseSecond();
    await flush();
    expect(stored()).toEqual([prompt('b', 'B', { pinnedAt: 100, updatedAt: 100 })]);
    expect(state.items).toEqual(stored());
  });

  it('shows the newest library when a reply comes after another writer changed it', async () => {
    // The owner writes the pin, its reply is slow, another tab writes on top,
    // then the reply comes; a read now would fail. The tab never reads again.
    const { state, stored, write, hold, failNextRead, onReadFailed, onReconcile } = await tab([
      prompt('a', 'A'),
    ]);
    const release = hold();

    state.togglePin('a');
    await flush();
    const later = [...(stored() as PromptItem[]), prompt('d', 'From Drive')];
    write(later);
    expect(state.items).toEqual(later);
    failNextRead();
    release();
    await flush();

    expect(state.items).toEqual(later);
    expect(stored()).toEqual(later);
    expect(onReadFailed).not.toHaveBeenCalled();
    expect(onReconcile).not.toHaveBeenCalled();
  });

  it('does not show a reply older than the library storage reported since', async () => {
    const { state, write, hold } = await tab([prompt('a', 'A'), prompt('b', 'B')]);
    const release = hold();

    state.remove('b');
    await flush();
    // Another tab deleted A after the owner wrote this tab's delete.
    write([]);
    release();
    await flush();

    expect(state.items).toEqual([]);
  });

  it('shows its change once the value arrives when the reply came first', async () => {
    const { state, stored, echoLater } = await tab([prompt('a', 'A'), prompt('b', 'B')]);
    const deliverEcho = echoLater();

    await expect(state.remove('a')).resolves.toBe(true);
    deliverEcho();
    await flush();

    expect(stored()).toEqual([prompt('b', 'B')]);
    expect(state.items).toEqual(stored());
  });

  it('shows a change whose reply was lost though it was written', async () => {
    const { state, stored, lose, onWriteFailed } = await tab([prompt('a', 'A'), prompt('b', 'B')]);
    // The worker restarted after writing the delete, so its reply never came.
    lose(1);

    state.togglePin('a');
    state.remove('b');
    await flush();
    expect(stored()).toEqual([prompt('a', 'A', { pinnedAt: 100, updatedAt: 100 })]);
    expect(state.items).toEqual(stored());
    // The panel cannot tell a lost reply from a failed write.
    expect(onWriteFailed).toHaveBeenCalledTimes(1);
  });

  it('marks the library unavailable while a reply is overdue, refusing edits until it comes', async () => {
    vi.useFakeTimers();
    const replies: Array<(result: PromptLibraryResult) => void> = [];
    const sent: PromptLibraryOp[] = [];
    const onUnavailable = vi.fn();
    const state = createPromptLibraryState({
      read: async () => [prompt('a', 'A'), prompt('b', 'B')],
      apply: (op) => {
        sent.push(op);
        return new Promise((resolve) => replies.push(resolve));
      },
      onUnavailable,
      now: () => 100,
    });
    await state.load();

    state.togglePin('a');
    state.remove('b');
    await vi.advanceTimersByTimeAsync(PROMPT_LIBRARY_WATCHDOG_MS - 1);
    expect(state.unavailable).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.unavailable).toBe(true);
    expect(onUnavailable).toHaveBeenLastCalledWith(true);

    // New edits are refused and said so; the queued delete still waits its turn.
    await expect(state.add({ name: 'C', text: 'C', tags: [] })).resolves.toBe('unavailable');
    await expect(state.edit('a', { name: 'A', text: 'A 2', tags: [] })).resolves.toBe(
      'unavailable',
    );
    await expect(state.remove('a')).resolves.toBe(false);
    state.reorder([...state.items].reverse());
    state.togglePin('a');
    expect(onUnavailable).toHaveBeenCalledTimes(6);
    expect(sent.map((op) => op.kind)).toEqual(['update']);
    expect(state.items).toEqual([prompt('a', 'A', { pinnedAt: 100, updatedAt: 100 })]);

    const result = { added: 0, skipped: 0, total: 0, nameConflicts: 0, items: [] };
    replies[0](result);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.unavailable).toBe(false);
    expect(onUnavailable).toHaveBeenLastCalledWith(false);
    expect(sent.map((op) => op.kind)).toEqual(['update', 'delete']);

    replies[1](result);
    await vi.advanceTimersByTimeAsync(0);
    state.add({ name: 'C', text: 'C', tags: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.map((op) => op.kind)).toEqual(['update', 'delete', 'add']);
  });

  it('loads the stored library when the seed goes unanswered, marking it unavailable', async () => {
    vi.useFakeTimers();
    const onUnavailable = vi.fn();
    const state = createPromptLibraryState({
      read: async () => [prompt('a', 'A')],
      apply: () => new Promise<never>(() => {}),
      readLegacy: () => '[{"id":"legacy","text":"Old"}]',
      onUnavailable,
    });
    const loading = state.load();
    await vi.advanceTimersByTimeAsync(PROMPT_LIBRARY_WATCHDOG_MS);

    await expect(loading).resolves.toEqual([prompt('a', 'A')]);
    expect(state.unavailable).toBe(true);
    expect(onUnavailable).toHaveBeenCalledWith(true);
  });

  it('refuses edits until the library has loaded, and shows it once a retry reads it', async () => {
    let readFails = true;
    const sent: PromptLibraryOp[] = [];
    const onNotLoaded = vi.fn();
    const onReconcile = vi.fn();
    const state = createPromptLibraryState({
      read: async () => {
        if (readFails) throw new Error('Extension context invalidated.');
        return [prompt('p', 'P')];
      },
      apply: async (op) => {
        sent.push(op);
        throw new Error('unused');
      },
      onNotLoaded,
      onReconcile,
    });
    await state.load();
    expect(state.loaded).toBe(false);

    // Re-adding a stored prompt to an unread library would be a no-op the panel never sees.
    await expect(state.add({ name: 'P', text: 'P', tags: [] })).resolves.toBe('unavailable');
    await expect(state.remove('p')).resolves.toBe(false);
    state.reorder([]);
    expect(onNotLoaded).toHaveBeenCalledTimes(3);
    expect(sent).toEqual([]);
    expect(state.items).toEqual([]);

    readFails = false;
    await state.retry();
    expect(state.loaded).toBe(true);
    expect(state.items).toEqual([prompt('p', 'P')]);
    expect(onReconcile).toHaveBeenCalledTimes(1);
    await expect(state.add({ name: 'P', text: 'P', tags: [] })).resolves.toBe('duplicate');
    expect(sent).toEqual([]);
  });

  it('reads again when an edit is refused before the library loaded', async () => {
    let readFails = true;
    const onReconcile = vi.fn();
    const state = createPromptLibraryState({
      read: async () => {
        if (readFails) throw new Error('Extension context invalidated.');
        return [prompt('p', 'P')];
      },
      apply: async () => {
        throw new Error('unused');
      },
      onReconcile,
    });
    await state.load();
    readFails = false;

    await expect(state.add({ name: 'Q', text: 'Q', tags: [] })).resolves.toBe('unavailable');
    await flush();
    expect(state.items).toEqual([prompt('p', 'P')]);
    expect(onReconcile).toHaveBeenCalledTimes(1);
  });

  it('counts a library storage reported as loaded, a removed one as empty', async () => {
    const listeners = new Set<
      (changes: Record<string, { newValue?: unknown }>, area: string) => void
    >();
    const changes = {
      addListener: (
        listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
      ) => listeners.add(listener),
      removeListener: (
        listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void,
      ) => listeners.delete(listener),
    };
    const emit = (change: { newValue?: unknown; oldValue?: unknown }, area = 'local') => {
      for (const listener of listeners) listener({ [KEY]: change }, area);
    };
    const onChanged = vi.fn();
    const state = createPromptLibraryState({
      read: () => Promise.reject(new Error('Extension context invalidated.')),
      apply: async () => {
        throw new Error('unused');
      },
      changes,
      onChanged,
    });
    await state.load();
    expect(state.loaded).toBe(false);

    emit({ newValue: [prompt('a', 'A')] }, 'sync');
    expect(state.loaded).toBe(false);
    emit({ newValue: [prompt('a', 'A')] });
    expect(state.loaded).toBe(true);
    expect(state.items).toEqual([prompt('a', 'A')]);

    emit({ oldValue: [prompt('a', 'A')] });
    expect(state.items).toEqual([]);
    expect(onChanged).toHaveBeenCalledTimes(2);

    state.dispose();
    expect(listeners.size).toBe(0);
  });

  it('reports nothing once disposed, though a reply and the watchdog come later', async () => {
    vi.useFakeTimers();
    let reply!: (result: PromptLibraryResult) => void;
    const callbacks = {
      onReconcile: vi.fn(),
      onWriteFailed: vi.fn(),
      onUnavailable: vi.fn(),
      onChanged: vi.fn(),
    };
    const state = createPromptLibraryState({
      read: async () => [prompt('a', 'A'), prompt('b', 'B')],
      apply: () => new Promise((resolve) => (reply = resolve)),
      ...callbacks,
    });
    await state.load();

    const removing = state.remove('a');
    await vi.advanceTimersByTimeAsync(0);
    state.dispose();
    await vi.advanceTimersByTimeAsync(PROMPT_LIBRARY_WATCHDOG_MS);
    expect(state.unavailable).toBe(false);
    reply({ added: 0, skipped: 0, total: 1, nameConflicts: 0, items: [prompt('b', 'B')] });

    await expect(removing).resolves.toBe(false);
    for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
  });

  it('still sends an op queued before teardown without arming its watchdog', async () => {
    vi.useFakeTimers();
    const replies: Array<(result: PromptLibraryResult) => void> = [];
    const apply = vi.fn(() => new Promise<PromptLibraryResult>((resolve) => replies.push(resolve)));
    const state = createPromptLibraryState({
      read: async () => [prompt('a', 'A'), prompt('b', 'B')],
      apply,
    });
    await state.load();

    void state.remove('a');
    void state.remove('b');
    await vi.advanceTimersByTimeAsync(0);
    state.dispose();
    replies[0]({ added: 0, skipped: 0, total: 1, nameConflicts: 0, items: [prompt('b', 'B')] });
    await vi.advanceTimersByTimeAsync(0);

    expect(apply).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a library received while it was loading', async () => {
    let finishRead!: () => void;
    const state = createPromptLibraryState({
      read: async () => {
        await new Promise<void>((resolve) => (finishRead = resolve));
        return [prompt('old', 'Old')];
      },
      apply: async () => {
        throw new Error('unused');
      },
    });
    const loading = state.load();
    await flush();
    state.receive([prompt('new', 'New')]);
    finishRead();
    await loading;

    expect(state.items).toEqual([prompt('new', 'New')]);
  });

  it('starts empty and reports it when the first read fails', async () => {
    const onReadFailed = vi.fn();
    const state = createPromptLibraryState({
      read: () => Promise.reject(new Error('Extension context invalidated.')),
      apply: async () => {
        throw new Error('unused');
      },
      onReadFailed,
    });

    await expect(state.load()).resolves.toEqual([]);
    expect(onReadFailed).toHaveBeenCalledTimes(1);
  });

  it('tells a missing library apart from a failed or unusable read', async () => {
    const area = (value: unknown) => ({
      get: async () => (value === undefined ? {} : { [KEY]: value }),
    });
    await expect(readPromptLibrary(area(undefined))).resolves.toEqual([]);
    await expect(readPromptLibrary(area([prompt('a', 'A')]))).resolves.toEqual([prompt('a', 'A')]);
    await expect(readPromptLibrary(area({ not: 'a list' }))).rejects.toThrow();
    await expect(
      readPromptLibrary({ get: () => Promise.reject(new Error('Extension context invalidated.')) }),
    ).rejects.toThrow();
  });

  it('seeds a legacy localStorage library on load, only into an empty one', async () => {
    const legacy = [{ id: 'legacy', text: 'Old', tags: [], createdAt: 1, extra: true }];
    const seeded = await tab(undefined, JSON.stringify(legacy));
    expect(seeded.stored()).toEqual(legacy);
    expect(seeded.state.items).toEqual(legacy);

    const existing = await tab([prompt('a', 'A')], JSON.stringify(legacy));
    expect(existing.stored()).toEqual([prompt('a', 'A')]);
    expect(existing.state.items).toEqual([prompt('a', 'A')]);

    const corrupt = await tab(undefined, '{"not":"a list"}');
    expect(corrupt.sent).toEqual([]);
    expect(corrupt.stored()).toBeUndefined();
  });

  it('loads the stored library when the seed cannot reach the owner', async () => {
    const state = createPromptLibraryState({
      read: async () => [prompt('a', 'A')],
      apply: () => Promise.reject(new Error('Could not establish connection.')),
      readLegacy: () => '[{"id":"legacy","text":"Old"}]',
    });
    await expect(state.load()).resolves.toEqual([prompt('a', 'A')]);
  });

  it('only treats a JSON list of records in localStorage as a legacy library', () => {
    expect(parseLegacyPromptLibrary(null)).toBeNull();
    expect(parseLegacyPromptLibrary('not json')).toBeNull();
    expect(parseLegacyPromptLibrary('{"id":"a"}')).toBeNull();
    expect(parseLegacyPromptLibrary('[1, 2]')).toBeNull();
    expect(parseLegacyPromptLibrary('[{"id":"a","text":"A"}]')).toEqual([{ id: 'a', text: 'A' }]);
    expect(parseLegacyPromptLibrary('[]')).toEqual([]);
  });
});
