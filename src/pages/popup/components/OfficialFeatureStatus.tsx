import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';
import type { PluginManifest } from '@/features/plugins/types';
import type { TranslationKey } from '@/utils/translations';

import { BLOCKED_NOTE_TONE_CLASS, blockedPluginNote } from './pluginBlockedNote';

export interface OfficialFeatureStatusProps {
  /** The packaged official plugin behind this setting on the active site. */
  readonly pluginId: string;
  /** Statuses the active tab reported. */
  readonly statuses: readonly PluginStatus[];
  /** Manifests to name the plugin that holds the feature. */
  readonly manifests: readonly PluginManifest[];
  readonly language: string;
  readonly t: (key: TranslationKey) => string;
}

/**
 * A note under a native setting whose packaged official plugin is switched on
 * but kept off this page: a local plugin already runs the same feature, or is
 * still shutting it down. Renders nothing otherwise, including while the
 * legacy implementation owns the feature and the tab reports no status for it.
 */
export function OfficialFeatureStatus({
  pluginId,
  statuses,
  manifests,
  language,
  t,
}: OfficialFeatureStatusProps) {
  const status = statuses.find((entry) => entry.id === pluginId);
  // Host policy and duplicate claims never apply to the packaged manifests on their own site.
  if (status?.blockedReason !== 'conflict' && status?.blockedReason !== 'releasing') return null;
  const note = blockedPluginNote({
    status,
    manifests,
    language,
    t,
    conflictKey: 'officialFeaturePausedByLocal',
  });
  if (!note) return null;
  return (
    <p className={`mt-1 text-xs leading-snug ${BLOCKED_NOTE_TONE_CLASS[note.tone]}`}>{note.text}</p>
  );
}
