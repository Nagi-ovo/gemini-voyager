import React from 'react';

import { isRTLLanguage } from '@/core/utils/rtl';
import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';
import type { PluginManifest, PluginSettingValue } from '@/features/plugins/types';
import type { TranslationKey } from '@/utils/translations';

import { OfficialPluginListRow, type OfficialPanelIo } from './OfficialPluginRow';
import type { OfficialPluginRow } from './useOfficialPluginList';

export interface PluginSiteOfficialRowsProps {
  readonly rows: readonly OfficialPluginRow[];
  readonly statuses: readonly PluginStatus[];
  readonly nameSources: readonly PluginManifest[];
  readonly onToggle: (pluginId: string, enabled: boolean) => void;
  readonly onSettingsChange: (
    pluginId: string,
    values: Readonly<Record<string, PluginSettingValue>>,
  ) => void;
  readonly panelIo: OfficialPanelIo;
  readonly language: string;
  readonly t: (key: TranslationKey) => string;
}

/**
 * Official plugins whose manifest also covers a plugin site (Visual effects),
 * as the same rows Gemini and AI Studio list, inside that site's plugin card.
 */
export function PluginSiteOfficialRows({
  rows,
  statuses,
  nameSources,
  onToggle,
  onSettingsChange,
  panelIo,
  language,
  t,
}: PluginSiteOfficialRowsProps) {
  if (rows.length === 0) return null;
  return (
    // The popup sets no direction, so the rows mirror themselves for RTL languages.
    <ul
      dir={isRTLLanguage(language) ? 'rtl' : undefined}
      className="border-border/60 divide-border/60 divide-y rounded-lg border px-3"
    >
      {rows.map((row) => (
        <OfficialPluginListRow
          key={row.manifest.id}
          row={row}
          status={statuses.find((entry) => entry.id === row.manifest.id)}
          nameSources={nameSources}
          control={undefined}
          panelIo={panelIo}
          onToggle={onToggle}
          onSettingsChange={onSettingsChange}
          language={language}
          t={t}
        />
      ))}
    </ul>
  );
}
