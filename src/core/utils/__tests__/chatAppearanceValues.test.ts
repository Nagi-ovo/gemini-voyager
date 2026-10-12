import { describe, expect, it } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { openLegacySnapshotFeed } from '@/features/plugins/runtime/legacySnapshotFeed';
import type { LegacySettingSnapshot } from '@/features/plugins/storage/legacySettingBindings';

import { isChatWidthSwitchOn } from '../chatAppearanceValues';

const SWITCH = StorageKeys.CHAT_WIDTH_ENABLED;
const WIDTH = StorageKeys.CHAT_WIDTH;

/** The chat width switch as a page's snapshot feed reports it after `changes`. */
async function switchAfter(
  initial: LegacySettingSnapshot,
  changes: readonly LegacySettingSnapshot[],
): Promise<boolean> {
  let fire: (changed: LegacySettingSnapshot) => void = () => {};
  const feed = openLegacySnapshotFeed(
    {
      load: async () => initial,
      subscribe: (callback) => {
        fire = callback;
        return () => {};
      },
    },
    () => {},
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const changed of changes) fire(changed);
  const snapshot = feed.current() ?? {};
  feed.stop();
  return isChatWidthSwitchOn({
    storedSwitch: snapshot[SWITCH],
    storedWidth: snapshot[WIDTH],
    switchChangedLive: feed.wasChangedLive(SWITCH),
    widthChangedLive: feed.wasChangedLive(WIDTH),
  });
}

describe('isChatWidthSwitchOn', () => {
  it('derives the chat width switch from a customized width only on the first read', async () => {
    expect(await switchAfter({ [WIDTH]: 85 }, [])).toBe(true);
    // An old px width that normalizes to the default is no customization.
    expect(await switchAfter({ [WIDTH]: 840 }, [])).toBe(false);
    expect(await switchAfter({ [WIDTH]: 70 }, [])).toBe(false);
    expect(await switchAfter({}, [])).toBe(false);
    // The native module decided once: a width set later does not turn it on.
    expect(await switchAfter({ [WIDTH]: 70 }, [{ [WIDTH]: 85 }])).toBe(false);
    // A stored switch decides alone, as `=== true`.
    expect(await switchAfter({ [WIDTH]: 85, [SWITCH]: false }, [])).toBe(false);
    expect(await switchAfter({ [WIDTH]: 70, [SWITCH]: true }, [])).toBe(true);
    expect(await switchAfter({ [WIDTH]: 85, [SWITCH]: null }, [])).toBe(false);
  });

  it('turns chat width off when its switch is deleted while the page lives', async () => {
    expect(await switchAfter({ [WIDTH]: 85, [SWITCH]: true }, [{ [SWITCH]: undefined }])).toBe(
      false,
    );
    expect(await switchAfter({ [WIDTH]: 85 }, [{ [SWITCH]: true }, { [SWITCH]: undefined }])).toBe(
      false,
    );
  });
});
