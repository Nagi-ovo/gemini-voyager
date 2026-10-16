import React from 'react';

import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { isRTLLanguage } from '@/core/utils/rtl';
import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';
import type { PluginManifest, PluginSettingValue } from '@/features/plugins/types';
import type { TranslationKey } from '@/utils/translations';

import {
  OfficialPluginListRow,
  type OfficialPanelIo,
  type OfficialPluginControls,
} from './OfficialPluginRow';
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
  readonly onSettingsChange: (
    pluginId: string,
    values: Readonly<Record<string, PluginSettingValue>>,
  ) => void;
  /** Switches the popup drives itself, by registry control id. */
  readonly controls?: OfficialPluginControls;
  /** What the rows' option panels read and write. */
  readonly panelIo?: OfficialPanelIo;
  /** A settings search is on, so rows with options show them open. */
  readonly searching?: boolean;
  readonly language: string;
  readonly t: (key: TranslationKey) => string;
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
  onSettingsChange,
  controls,
  panelIo,
  searching = false,
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
                    control={row.entry.control ? controls?.[row.entry.control] : undefined}
                    panelIo={panelIo}
                    searching={searching}
                    onToggle={onToggle}
                    onSettingsChange={onSettingsChange}
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
