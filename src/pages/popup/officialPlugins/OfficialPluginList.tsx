import React from 'react';

import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { isRTLLanguage } from '@/core/utils/rtl';
import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';
import type { PluginManifest } from '@/features/plugins/types';
import type { TranslationKey } from '@/utils/translations';

import { ExperimentalBadge } from '../components/ExperimentalBadge';
import { displayName, pickLocalized } from '../components/PluginIdentity';
import { BLOCKED_NOTE_TONE_CLASS, blockedPluginNote } from '../components/pluginBlockedNote';
import { OFFICIAL_PLUGIN_GROUPS } from './officialPluginRegistry';
import type { OfficialPluginRow } from './useOfficialPluginList';

export interface OfficialPluginListProps {
  readonly rows: readonly OfficialPluginRow[];
  /** Statuses the active tab reported, for the paused / waiting note. */
  readonly statuses: readonly PluginStatus[];
  /** Manifests to name a local plugin that holds the runtime. */
  readonly nameSources: readonly PluginManifest[];
  /** Site capability and settings-search gate, keyed by plugin id. */
  readonly isVisible: (pluginId: string) => boolean;
  readonly onToggle: (pluginId: string, enabled: boolean) => void;
  readonly language: string;
  readonly t: (key: TranslationKey) => string;
}

function domId(prefix: string, pluginId: string): string {
  return `${prefix}-${pluginId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

/**
 * The official Gemini / AI Studio plugins, one switch each, in fixed groups.
 * Each switch shows the stored preference; what the page is doing differently
 * right now shows as the note under it.
 */
export function OfficialPluginList({
  rows,
  statuses,
  nameSources,
  isVisible,
  onToggle,
  language,
  t,
}: OfficialPluginListProps) {
  return (
    // The popup itself sets no direction, so the card mirrors itself for RTL languages.
    <Card
      className="p-4 transition-all hover:shadow-md"
      dir={isRTLLanguage(language) ? 'rtl' : undefined}
    >
      <CardTitle className="mb-2">{t('pluginsTitle')}</CardTitle>
      <CardContent className="space-y-4 p-0">
        <p className="text-muted-foreground text-xs">{t('pluginsNativeDescription')}</p>
        {OFFICIAL_PLUGIN_GROUPS.map((group) => {
          const groupRows = rows.filter(
            (row) => row.entry.group === group.id && isVisible(row.manifest.id),
          );
          if (groupRows.length === 0) return null;
          const headingId = `official-plugin-group-${group.id}`;
          return (
            <section key={group.id} aria-labelledby={headingId}>
              <h4 id={headingId} className="text-muted-foreground mb-1 text-xs font-semibold">
                {t(group.label)}
              </h4>
              <ul className="divide-border/60 divide-y">
                {groupRows.map((row) => (
                  <OfficialPluginListRow
                    key={row.manifest.id}
                    row={row}
                    status={statuses.find((entry) => entry.id === row.manifest.id)}
                    nameSources={nameSources}
                    onToggle={onToggle}
                    language={language}
                    t={t}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

function OfficialPluginListRow({
  row,
  status,
  nameSources,
  onToggle,
  language,
  t,
}: {
  readonly row: OfficialPluginRow;
  readonly status: PluginStatus | undefined;
  readonly nameSources: readonly PluginManifest[];
  readonly onToggle: (pluginId: string, enabled: boolean) => void;
  readonly language: string;
  readonly t: (key: TranslationKey) => string;
}) {
  const { manifest, entry, enabled } = row;
  const inputId = domId('official-plugin', manifest.id);
  const descriptionId = domId('official-plugin-description', manifest.id);
  const note = blockedPluginNote({
    status,
    manifests: nameSources,
    language,
    t,
    conflictKey: 'officialFeaturePausedByLocal',
  });
  return (
    <li
      data-official-plugin={manifest.id}
      className="flex items-start justify-between gap-3 py-2.5"
    >
      <div className="min-w-0 flex-1 text-start">
        <div className="flex items-center gap-1">
          <label htmlFor={inputId} className="cursor-pointer text-sm font-medium">
            <bdi>{displayName(pickLocalized(manifest, 'name', language))}</bdi>
          </label>
          {entry.experimental && <ExperimentalBadge title={t('experimentalLabel')} />}
        </div>
        <p id={descriptionId} className="text-muted-foreground mt-0.5 text-xs leading-snug">
          {pickLocalized(manifest, 'description', language)}
        </p>
        {note && (
          <p className={`mt-1 text-xs leading-snug ${BLOCKED_NOTE_TONE_CLASS[note.tone]}`}>
            {note.text}
          </p>
        )}
      </div>
      <Switch
        id={inputId}
        checked={enabled}
        aria-describedby={descriptionId}
        onChange={(event) => onToggle(manifest.id, event.target.checked)}
      />
    </li>
  );
}
