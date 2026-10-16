import React, { act, useEffect } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LegacySettingSnapshot } from '@/features/plugins/storage/legacySettingBindings';

import { useLegacyPreferenceWrites } from '../useLegacyPreferenceWrites';

const KEY = 'geminiMermaidEnabled';

type Writes = ReturnType<typeof useLegacyPreferenceWrites>;

function Harness({
  legacy,
  write,
  subscribe,
  capture,
}: {
  legacy: LegacySettingSnapshot;
  write: (payload: Record<string, unknown>) => Promise<boolean>;
  subscribe: (callback: (changed: LegacySettingSnapshot) => void) => () => void;
  capture: (writes: Writes) => void;
}) {
  const writes = useLegacyPreferenceWrites({ legacy, write, subscribe });
  useEffect(() => capture(writes), [capture, writes]);
  return null;
}

function deferred() {
  let resolve!: (landed: boolean) => void;
  const promise = new Promise<boolean>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('useLegacyPreferenceWrites', () => {
  let container: HTMLDivElement;
  let root: Root;
  let writes: Writes;
  let legacy: LegacySettingSnapshot;
  let listener: ((changed: LegacySettingSnapshot) => void) | null;
  let write: ReturnType<typeof vi.fn<(payload: Record<string, unknown>) => Promise<boolean>>>;
  const subscribe = (callback: (changed: LegacySettingSnapshot) => void) => {
    listener = callback;
    return () => {
      listener = null;
    };
  };
  const capture = (next: Writes) => {
    writes = next;
  };

  const render = async () => {
    await act(async () =>
      root.render(
        <Harness legacy={legacy} write={write} subscribe={subscribe} capture={capture} />,
      ),
    );
  };

  /** What the popup's own snapshot does on a sync change event. */
  const storageChanged = async (changed: LegacySettingSnapshot) => {
    legacy = { ...legacy, ...changed };
    await act(async () => {
      listener?.(changed);
      root.render(
        <Harness legacy={legacy} write={write} subscribe={subscribe} capture={capture} />,
      );
    });
  };

  const shown = () => writes.legacy[KEY];

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    legacy = { [KEY]: false };
    listener = null;
    write = vi.fn(async () => true);
    await render();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows the chosen value at once and writes only that key', async () => {
    const pending = deferred();
    write.mockReturnValueOnce(pending.promise);
    await act(async () => writes.writePreference({ [KEY]: true }));
    expect(shown()).toBe(true);
    expect(write).toHaveBeenCalledExactlyOnceWith({ [KEY]: true });
  });

  it('a no-op write settles on its own, so a later external change shows', async () => {
    await act(async () => writes.writePreference({ [KEY]: false }));
    expect(shown()).toBe(false);
    await storageChanged({ [KEY]: true });
    expect(shown()).toBe(true);
  });

  it('a failed write shows the stored value again', async () => {
    write.mockResolvedValueOnce(false);
    await act(async () => writes.writePreference({ [KEY]: true }));
    expect(shown()).toBe(false);
  });

  it('a write that throws shows the stored value again', async () => {
    write.mockRejectedValueOnce(new Error('quota'));
    await act(async () => writes.writePreference({ [KEY]: true }));
    expect(shown()).toBe(false);
  });

  it('a landed write holds its value until its change event arrives, then follows storage', async () => {
    await act(async () => writes.writePreference({ [KEY]: true }));
    // Landed, but the change event is late: the switch must not flip back.
    expect(shown()).toBe(true);
    await storageChanged({ [KEY]: true });
    expect(shown()).toBe(true);
    await storageChanged({ [KEY]: false });
    expect(shown()).toBe(false);
  });

  it('a late answer to an older write does not override a newer choice', async () => {
    const older = deferred();
    const newer = deferred();
    write.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await act(async () => writes.writePreference({ [KEY]: true }));
    await act(async () => writes.writePreference({ [KEY]: false }));
    await act(async () => older.resolve(false));
    expect(shown()).toBe(false);
    await storageChanged({ [KEY]: true });
    expect(shown()).toBe(false);
    await act(async () => newer.resolve(true));
    await storageChanged({ [KEY]: false });
    expect(shown()).toBe(false);
  });

  it('an external restore while a landed write is unsettled wins, even back to the old value', async () => {
    await act(async () => writes.writePreference({ [KEY]: true }));
    expect(shown()).toBe(true);
    // A restore rewrites the key to what it held before the write.
    await storageChanged({ [KEY]: false });
    expect(shown()).toBe(false);
  });

  it('a restore that lands before a late write receipt is not hidden by the written value', async () => {
    const receipt = deferred();
    write.mockReturnValueOnce(receipt.promise);
    await act(async () => writes.writePreference({ [KEY]: true }));
    await storageChanged({ [KEY]: true });
    // A settings restore rewrites the key before the write's own receipt comes back.
    await storageChanged({ [KEY]: false });
    await act(async () => receipt.resolve(true));
    expect(shown()).toBe(false);
  });

  it('a change to another key does not settle this one', async () => {
    await act(async () => writes.writePreference({ [KEY]: true }));
    await storageChanged({ geminiWaveDromEnabled: false });
    expect(shown()).toBe(true);
  });
});
