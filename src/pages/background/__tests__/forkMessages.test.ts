import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { ForkNode, ForkNodesData } from '@/pages/content/fork/forkTypes';

import { createForkMessagesOwner } from '../forkMessages';

const key = StorageKeys.FORK_NODES;
const node = (
  conversationId: string,
  turnId: string,
  forkGroupId = 'group',
  forkIndex = 0,
): ForkNode => ({
  conversationId,
  turnId,
  forkGroupId,
  forkIndex,
  createdAt: 1,
  conversationUrl: `https://gemini.google.com/u/3/app/${conversationId}`,
});

function setup(initial: unknown = { nodes: {}, groups: {} }) {
  let stored = structuredClone(initial);
  const area = {
    get: vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { [key]: structuredClone(stored) };
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      stored = structuredClone(items[key]);
    }),
  };
  return { owner: createForkMessagesOwner(area), area, stored: () => stored as ForkNodesData };
}

const add = (payload: ForkNode) => ({ type: 'gv.fork.add', payload });

describe('fork messages owner', () => {
  it('serializes concurrent additions and preserves nodes plus group indexes without duplicate writes', async () => {
    const { owner, area, stored } = setup();
    const a = node('a', '1', 'group', 2);
    const b = node('b', '1', 'group', 0);
    const alternate = node('a', '1', 'other', 1);
    await expect(
      Promise.all([
        owner.handle(add(a)),
        owner.handle(add(b)),
        owner.handle(add(a)),
        owner.handle(add(alternate)),
      ]),
    ).resolves.toEqual([
      { ok: true, added: true },
      { ok: true, added: true },
      { ok: true, added: false },
      { ok: true, added: true },
    ]);
    expect(stored()).toEqual({
      nodes: { a: [a, alternate], b: [b] },
      groups: { group: ['a:1', 'b:1'], other: ['a:1'] },
    });
    expect(area.set).toHaveBeenCalledTimes(3);
    expect(area.get).toHaveBeenCalledWith([key]);
    await expect(
      owner.handle({ type: 'gv.fork.getGroup', payload: { forkGroupId: 'group' } }),
    ).resolves.toEqual({ ok: true, nodes: [b, a] });
    await expect(owner.getAllForkNodes()).resolves.toEqual(stored());
  });

  it('removes only the specified group, then cleans empty conversation and group entries', async () => {
    const a = node('a', '1');
    const alternate = node('a', '1', 'other');
    const { owner, stored, area } = setup({
      nodes: { a: [a, alternate] },
      groups: { group: ['a:1'], other: ['a:1'] },
    });
    await expect(owner.handle({ type: 'gv.fork.remove', payload: a })).resolves.toEqual({
      ok: true,
      removed: true,
    });
    expect(stored()).toEqual({ nodes: { a: [alternate] }, groups: { other: ['a:1'] } });
    await expect(owner.handle({ type: 'gv.fork.remove', payload: a })).resolves.toEqual({
      ok: true,
      removed: false,
    });
    expect(area.set).toHaveBeenCalledTimes(1);
    await owner.handle({ type: 'gv.fork.remove', payload: alternate });
    expect(stored()).toEqual({ nodes: {}, groups: {} });
  });

  it('a rejected write leaves storage intact and does not poison the next queued operation', async () => {
    const { owner, area, stored } = setup();
    area.set.mockRejectedValueOnce(new Error('quota'));
    const failed = owner.handle(add(node('a', '1')));
    const next = owner.handle(add(node('b', '2')));
    await expect(failed).rejects.toThrow('quota');
    await expect(next).resolves.toEqual({ ok: true, added: true });
    expect(stored()).toEqual({ nodes: { b: [node('b', '2')] }, groups: { group: ['b:2'] } });
  });

  it('ignores dangling index entries and retains empty fallback on malformed storage or read errors', async () => {
    const a = node('a', '1');
    const { owner, area } = setup({ nodes: { a: [a] }, groups: { group: ['missing:1', 'a:1'] } });
    await expect(
      owner.handle({ type: 'gv.fork.getGroup', payload: { forkGroupId: 'group' } }),
    ).resolves.toEqual({ ok: true, nodes: [a] });
    area.get.mockResolvedValueOnce({ [key]: { nodes: {} } });
    await expect(owner.getAllForkNodes()).resolves.toEqual({ nodes: {}, groups: {} });
    area.get.mockRejectedValueOnce(new Error('unavailable'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(owner.handle({ type: 'gv.fork.getAll' })).resolves.toEqual({
      ok: true,
      data: { nodes: {}, groups: {} },
    });
    log.mockRestore();
    expect(owner.handle({ type: 'gv.starred.getAll' })).toBeNull();
    expect(owner.handle(null)).toBeNull();
  });
  it('adding a fork when storage cannot be read keeps the existing forks', async () => {
    const existing = node('a', '1');
    const { owner, area, stored } = setup({ nodes: { a: [existing] }, groups: { group: ['a:1'] } });
    area.get.mockRejectedValueOnce(new Error('unavailable'));
    await expect(owner.handle(add(node('b', '1')))).rejects.toThrow('unavailable');
    area.get.mockRejectedValueOnce(new Error('unavailable'));
    await expect(owner.handle({ type: 'gv.fork.remove', payload: existing })).rejects.toThrow(
      'unavailable',
    );
    expect(area.set).not.toHaveBeenCalled();
    expect(stored()).toEqual({ nodes: { a: [existing] }, groups: { group: ['a:1'] } });
  });

  it('a fork uploaded on one device merges into the forks already on another', async () => {
    const local = node('a', '1');
    const shared = node('b', '1', 'cloud', 0);
    const cloudOnly = node('b', '2', 'cloud', 1);
    const { owner, stored } = setup({
      nodes: { a: [local], b: [shared] },
      groups: { group: ['a:1'], cloud: ['b:1'] },
    });
    const envelope = {
      format: 'gemini-voyager.forks.v1',
      data: { nodes: { b: [shared, cloudOnly, { turnId: 'broken' }] }, groups: {} },
    };
    await expect(owner.handle({ type: 'gv.fork.mergeCloud', payload: envelope })).resolves.toEqual({
      ok: true,
      status: 'merged',
    });
    expect(stored()).toEqual({
      nodes: { a: [local], b: [shared, cloudOnly] },
      groups: { group: ['a:1'], cloud: ['b:1', 'b:2'] },
    });
  });

  it('keeps local forks when a restore cannot read them or gets a foreign file', async () => {
    const local = node('a', '1');
    const { owner, area, stored } = setup({ nodes: { a: [local] }, groups: { group: ['a:1'] } });
    const merge = (payload: unknown) => owner.handle({ type: 'gv.fork.mergeCloud', payload });
    const cloud = {
      format: 'gemini-voyager.forks.v1',
      data: { nodes: { b: [node('b', '1')] }, groups: {} },
    };
    await expect(merge(undefined)).resolves.toEqual({ ok: true, status: 'absent' });
    await expect(merge({ ...cloud, format: 'gemini-voyager.starred.v1' })).rejects.toThrow(
      'Invalid fork nodes envelope',
    );
    area.get.mockRejectedValueOnce(new Error('unavailable'));
    await expect(merge(cloud)).rejects.toThrow('unavailable');
    expect(area.set).not.toHaveBeenCalled();
    expect(stored()).toEqual({ nodes: { a: [local] }, groups: { group: ['a:1'] } });
  });
});
