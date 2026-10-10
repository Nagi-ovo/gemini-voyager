import { useEffect, useRef, useState } from 'react';

import {
  loadSeenPluginVersions,
  markPluginVersionsSeen,
} from '@/features/plugins/storage/pluginState';
import type { PluginManifest } from '@/features/plugins/types';

export function usePluginUpdates(manifests: readonly PluginManifest[]) {
  // "Updated" badges (plan D11). The seen-version snapshot is read once per
  // popup session and never refreshed from storage afterwards, so the versions
  // can be marked seen immediately while the chips stay on screen for as long
  // as this popup is open.
  const seenVersions = useRef<Readonly<Record<string, string>>>({});
  const [seenVersionsLoaded, setSeenVersionsLoaded] = useState(false);
  const [updatedIds, setUpdatedIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  useEffect(() => {
    let active = true;
    void loadSeenPluginVersions().then((versions) => {
      if (!active) return;
      seenVersions.current = versions;
      setSeenVersionsLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Compare the listed manifests against the snapshot, then record what this
  // popup showed. A plugin seen here for the FIRST time is new, not updated, so
  // it gets no chip — only a version that differs from a recorded one does.
  useEffect(() => {
    if (!seenVersionsLoaded || manifests.length === 0) return;
    const seen = seenVersions.current;
    const changed = manifests
      .filter((plugin) => {
        const previous = seen[plugin.id];
        return previous !== undefined && previous !== plugin.version;
      })
      .map((plugin) => plugin.id);
    if (changed.length > 0) {
      setUpdatedIds((previous) => {
        if (changed.every((id) => previous.has(id))) return previous;
        return new Set([...previous, ...changed]);
      });
    }
    const versions: Record<string, string> = {};
    for (const plugin of manifests) versions[plugin.id] = plugin.version;
    void markPluginVersionsSeen(versions);
  }, [manifests, seenVersionsLoaded]);

  return updatedIds;
}
