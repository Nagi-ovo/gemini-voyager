import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';
import type { PluginManifest } from '@/features/plugins/types';
import type { TranslationKey } from '@/utils/translations';

import { officialPluginEntry } from '../officialPlugins/officialPluginRegistry';
import { isReleasingStatus } from '../utils/releasingStatus';
import { displayName, pickLocalized } from './PluginIdentity';

/** How a blocked note reads: a pause the user can resolve, or a wait that ends by itself. */
export type BlockedNoteTone = 'paused' | 'waiting';

export interface BlockedNote {
  readonly text: string;
  readonly tone: BlockedNoteTone;
}

export const BLOCKED_NOTE_TONE_CLASS: Readonly<Record<BlockedNoteTone, string>> = {
  paused: 'text-amber-600 dark:text-amber-400',
  waiting: 'text-muted-foreground',
};

/** The localized name of `id` among `manifests`, or the id itself when none is loaded. */
export function pluginDisplayName(
  id: string,
  manifests: readonly PluginManifest[],
  language: string,
): string {
  const manifest = manifests.find((plugin) => plugin.id === id);
  return manifest ? pickLocalized(manifest, 'name', language) : id;
}

/**
 * Where the user switches official plugin `id` off: its row in the popup's
 * Plugins card. Null for any other plugin.
 */
function officialSwitch(
  id: string,
  manifests: readonly PluginManifest[],
  language: string,
  t: (key: TranslationKey) => string,
): { readonly setting: string; readonly card: string } | null {
  if (officialPluginEntry(id)) {
    return {
      setting: displayName(pluginDisplayName(id, manifests, language)),
      card: t('pluginsTitle'),
    };
  }
  return null;
}

export interface BlockedNoteInput {
  readonly status: PluginStatus | undefined;
  /** Manifests to name the blocking plugin from. */
  readonly manifests: readonly PluginManifest[];
  readonly language: string;
  readonly t: (key: TranslationKey) => string;
  /** Message for a conflict; `{name}` is the plugin holding the runtime. */
  readonly conflictKey?: TranslationKey;
}

/**
 * Why a `blocked` plugin does not run on this page, or null for any other
 * status. A blocked plugin keeps the user's on/off, so this is a note beside a
 * usable toggle, never a reason to disable it. A packaged official plugin in
 * `blockedBy` is named by the native setting that switches it, since it never
 * appears in a plugin list.
 */
export function blockedPluginNote({
  status,
  manifests,
  language,
  t,
  conflictKey = 'pluginBlockedByPlugin',
}: BlockedNoteInput): BlockedNote | null {
  if (status?.kind !== 'blocked') return null;
  if (isReleasingStatus(status)) return { text: t('pluginBlockedReleasing'), tone: 'waiting' };
  switch (status.blockedReason) {
    case 'host-policy':
      return { text: t('pluginBlockedUnavailableHere'), tone: 'paused' };
    case 'duplicate-claim':
      return { text: t('pluginBlockedDuplicateClaim'), tone: 'paused' };
    case 'conflict': {
      if (!status.blockedBy) return null;
      const official = officialSwitch(status.blockedBy, manifests, language, t);
      if (official) {
        const text = t('pluginBlockedByOfficialSetting')
          .replace('{setting}', () => official.setting)
          .replace('{card}', () => official.card);
        return { text, tone: 'paused' };
      }
      const name = pluginDisplayName(status.blockedBy, manifests, language);
      // A replacer function keeps `$&`-style patterns in a plugin's name literal.
      return { text: t(conflictKey).replace('{name}', () => name), tone: 'paused' };
    }
    case 'pending': {
      if (!status.blockedBy) return null;
      const official = officialSwitch(status.blockedBy, manifests, language, t);
      const name = official
        ? official.setting
        : pluginDisplayName(status.blockedBy, manifests, language);
      return { text: t('pluginBlockedPending').replace('{name}', () => name), tone: 'waiting' };
    }
    default:
      return null;
  }
}
