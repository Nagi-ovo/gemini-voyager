import { describe, expect, it } from 'vitest';

import { type BudgetMeasure, type StorageBudget, createStorageBudget } from '../storageBudget';
import { type ByteStore, createByteStore, itemBytes } from './byteStore';

const MIB = 1024 * 1024;

/** A string value whose stored item under `key` is `bytes` long. */
const filler = (key: string, bytes: number): string => 'x'.repeat(bytes - itemBytes(key, ''));

/** The budget over `store`, measured through the store's own (FIFO) calls. */
function budgetOver(
  store: ByteStore,
  softCap = 25 * MIB,
  quota: number | null = null,
): StorageBudget {
  return createStorageBudget({
    measure: async (keys): Promise<BudgetMeasure> => ({
      bytesInUse: await store.area.getBytesInUse(null),
      keyBytes: await store.area.getBytesInUse(keys),
      limitBytes: quota === null ? softCap : Math.min(softCap, quota),
      quotaBytes: quota,
    }),
    quota: async () => quota,
    barrier: () => store.area.get('barrier'),
  });
}

function copy(budget: StorageBudget, store: ByteStore, key: string, bytes: number) {
  const value = filler(key, bytes);
  return budget.run({ kind: 'copy', keys: [key], bytes: itemBytes(key, value) }, () =>
    store.area.set({ [key]: value }),
  );
}

describe('storageBudget', () => {
  it('admits one of three 3 MiB copies on 15 MiB used and keeps usage at 18.75 MiB (finding 3)', async () => {
    const store = createByteStore({ data: filler('data', 15 * MIB) });
    const budget = budgetOver(store);

    const results = await Promise.all(
      ['a', 'b', 'c'].map((key) => copy(budget, store, `gvBackup_x_${key}`, 3 * MIB)),
    );

    expect(results.map((result) => result.admitted)).toEqual([true, false, false]);
    expect(store.used()).toBeLessThanOrEqual(18.75 * MIB);
  });

  it('keeps later copies refused while an admitted write stalls past any timer (T26a)', async () => {
    const store = createByteStore({ data: filler('data', 15 * MIB) });
    const budget = budgetOver(store);
    let landA!: () => void;
    const stalled = new Promise<void>((resolve) => (landA = resolve));
    const valueA = filler('A', 3 * MIB);

    const a = budget.run({ kind: 'copy', keys: ['A'], bytes: itemBytes('A', valueA) }, async () => {
      await stalled;
      await store.area.set({ A: valueA });
    });
    const b = copy(budget, store, 'B', 3 * MIB);
    const c = copy(budget, store, 'C', 3 * MIB);
    // Far past any lease a timer could have granted A.
    for (let i = 0; i < 50; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.has('B') || store.has('C')).toBe(false);
    landA();

    expect((await a).admitted).toBe(true);
    expect([(await b).admitted, (await c).admitted]).toEqual([false, false]);
    expect(store.used()).toBeLessThanOrEqual(18.75 * MIB);
  });

  it("counts a dead worker's set that lands after the restart in the first admission (T26b)", async () => {
    const store = createByteStore({ data: filler('data', 15 * MIB) });
    store.hold();
    // The previous worker dispatched this and died before it landed.
    const orphan = store.area.set({ orphan: filler('orphan', 3 * MIB) });
    const restarted = budgetOver(store);

    const admission = copy(restarted, store, 'fresh', 3 * MIB);
    store.release();
    await orphan;

    expect((await admission).admitted).toBe(false);
    expect(store.used()).toBeLessThanOrEqual(18.75 * MIB);
  });

  it('credits the bytes of the keys a copy replaces', async () => {
    const store = createByteStore({
      data: filler('data', 14 * MIB),
      slot: filler('slot', 4 * MIB),
    });
    const budget = budgetOver(store);

    expect((await copy(budget, store, 'slot', 4 * MIB)).admitted).toBe(true);
    expect((await copy(budget, store, 'other', 1 * MIB)).admitted).toBe(false);
  });

  it('admits user data past the copy reserve and refuses it only past a hard quota', async () => {
    const unlimited = createByteStore({ data: filler('data', 30 * MIB) });
    const bounded = createByteStore({ data: filler('data', 4 * MIB) }, { quota: 5 * MIB });
    const write = (store: ByteStore, budget: StorageBudget, bytes: number) => {
      const value = filler('k', bytes);
      return budget.run({ kind: 'data', keys: ['k'], bytes: itemBytes('k', value) }, () =>
        store.area.set({ k: value }),
      );
    };

    expect((await write(unlimited, budgetOver(unlimited), 3 * MIB)).admitted).toBe(true);
    const capped = budgetOver(bounded, 25 * MIB, 5 * MIB);
    expect(await write(bounded, capped, 2 * MIB)).toEqual({ admitted: false, reason: 'quota' });
    expect((await write(bounded, capped, MIB / 2)).admitted).toBe(true);
    expect(bounded.used()).toBeLessThanOrEqual(5 * MIB);
  });

  it('counts standing reservations against every admission', async () => {
    const store = createByteStore({ data: filler('data', 15 * MIB) });
    const budget = budgetOver(store);
    budget.setReservations(() => 3 * MIB);

    expect((await copy(budget, store, 'a', 1.5 * MIB)).admitted).toBe(false);
    budget.setReservations(null);
    expect((await copy(budget, store, 'a', 1.5 * MIB)).admitted).toBe(true);
    expect(store.used()).toBeLessThanOrEqual(18.75 * MIB);
  });

  it('refuses instead of writing when the area cannot be measured, and keeps the chain alive', async () => {
    const store = createByteStore();
    let broken = true;
    const budget = createStorageBudget({
      measure: async () => {
        if (broken) throw new Error('measure failed');
        return { bytesInUse: 0, keyBytes: 0, limitBytes: 25 * MIB, quotaBytes: null };
      },
      quota: async () => null,
      barrier: async () => undefined,
    });

    expect(await copy(budget, store, 'a', 1024)).toEqual({
      admitted: false,
      reason: 'unmeasurable',
    });
    await expect(
      budget.runChecked(async () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow();
    broken = false;
    expect((await copy(budget, store, 'a', 1024)).admitted).toBe(true);
  });

  it('writes user data under no quota even with allowances held and the area unmeasurable', async () => {
    const store = createByteStore();
    const budget = createStorageBudget({
      measure: async () => Promise.reject(new Error('measure failed')),
      quota: async () => null,
      barrier: async () => undefined,
      reserved: async () => Promise.reject(new Error('meta unreadable')),
    });

    const admission = await budget.run({ kind: 'data', keys: ['k'], bytes: 10 }, () =>
      store.area.set({ k: 'v' }),
    );

    expect(admission.admitted).toBe(true);
    expect(store.used()).toBeGreaterThan(0);
  });
});
