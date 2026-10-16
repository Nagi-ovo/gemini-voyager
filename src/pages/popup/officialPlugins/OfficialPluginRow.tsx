import React, { useState } from 'react';

import { ChevronDown } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import { getModifierKey } from '@/core/utils/browser';
import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';
import type { LegacySettingSnapshot } from '@/features/plugins/storage/legacySettingBindings';
import type { PluginManifest, PluginSettingValue } from '@/features/plugins/types';
import type { TranslationKey } from '@/utils/translations';

import { ExperimentalBadge } from '../components/ExperimentalBadge';
import { displayName, pickLocalized } from '../components/PluginIdentity';
import { PluginSettings } from '../components/PluginSettings';
import { BLOCKED_NOTE_TONE_CLASS, blockedPluginNote } from '../components/pluginBlockedNote';
import { OfficialPluginSliders } from './OfficialPluginSliders';
import { OFFICIAL_PANELS } from './officialPluginPanels';
import type { OfficialControlId } from './officialPluginRegistry';
import type { ContextSyncRequest } from './useContextSyncRequest';
import type { OfficialPluginRow as Row } from './useOfficialPluginList';

/** A switch the popup drives itself, such as one behind a permission prompt. */
export interface OfficialPluginControl {
  readonly enabled: boolean;
  /** Called from the click itself: a permission request must stay in the user's gesture. */
  readonly setEnabled: (enabled: boolean) => void;
}

export type OfficialPluginControls = Partial<Record<OfficialControlId, OfficialPluginControl>>;

/** The option panels' keys from the live snapshot, and the writer they save through. */
export interface OfficialPanelIo {
  readonly values: LegacySettingSnapshot;
  readonly write: (payload: Record<string, unknown>) => void;
  /** The tab the popup was opened for, when it is not the active one (the options page). */
  readonly sourceTabId?: number;
  /** Context Sync's request state, owned by the list so collapsing Options keeps it. */
  readonly contextSync?: ContextSyncRequest;
}

export interface OfficialPluginRowProps {
  readonly row: Row;
  readonly status: PluginStatus | undefined;
  readonly nameSources: readonly PluginManifest[];
  readonly control: OfficialPluginControl | undefined;
  readonly panelIo: OfficialPanelIo | undefined;
  /** A settings search is on: a listed row with options shows them open. */
  readonly searching: boolean;
  readonly onToggle: (pluginId: string, enabled: boolean) => void;
  readonly onSettingsChange: (
    pluginId: string,
    values: Readonly<Record<string, PluginSettingValue>>,
  ) => void;
  readonly language: string;
  readonly t: (key: TranslationKey) => string;
}

export function domId(prefix: string, pluginId: string): string {
  return `${prefix}-${pluginId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export function OfficialPluginListRow({
  row,
  status,
  nameSources,
  control,
  panelIo,
  searching,
  onToggle,
  onSettingsChange,
  language,
  t,
}: OfficialPluginRowProps) {
  const { manifest, entry, settings, usageHint } = row;
  const enabled = control ? control.enabled : row.enabled;
  // Collapsed until asked for; a search that lists the row opens it, unless the user closed it.
  const [optionsOpen, setOptionsOpen] = useState<boolean | null>(null);
  // Number settings show as the registry's sliders, which save on release.
  const sliderKeys = entry.sliders ? Object.keys(entry.sliders) : [];
  const InlinePanel = entry.inlinePanel && panelIo ? OFFICIAL_PANELS[entry.inlinePanel] : null;
  const hasOtherSettings =
    !entry.inlinePanel &&
    Object.keys(manifest.contributes.settings ?? {}).some((key) => !sliderKeys.includes(key));
  const name = displayName(pickLocalized(manifest, 'name', language));
  const inputId = domId('official-plugin', manifest.id);
  const descriptionId = domId('official-plugin-description', manifest.id);
  const panelId = domId('official-plugin-options', manifest.id);
  const Panel = entry.panel && panelIo ? OFFICIAL_PANELS[entry.panel] : null;
  const expanded = optionsOpen ?? searching;
  const note = blockedPluginNote({
    status,
    manifests: nameSources,
    language,
    t,
    conflictKey: 'officialFeaturePausedByLocal',
  });
  return (
    <li data-official-plugin={manifest.id} className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-start">
          <div className="flex items-center gap-1">
            <label htmlFor={inputId} className="cursor-pointer text-sm font-medium">
              <bdi>{name}</bdi>
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
          {enabled && usageHint && (
            <p className="text-muted-foreground/80 mt-1 text-[11px] leading-snug">
              {t(usageHint).replace('{modifier}', getModifierKey())}
            </p>
          )}
          {/* Options appear only while the plugin is on; turning it off keeps their stored values. */}
          {enabled && hasOtherSettings && (
            <PluginSettings
              plugin={manifest}
              values={settings}
              hiddenKeys={sliderKeys}
              handleSetting={(id, key, value) => onSettingsChange(id, { [key]: value })}
              handleImmediateSettings={onSettingsChange}
            />
          )}
          {enabled && InlinePanel && panelIo && (
            <InlinePanel values={panelIo.values} write={panelIo.write} idPrefix={panelId} t={t} />
          )}
          {enabled && entry.sliders && (
            <OfficialPluginSliders
              manifest={manifest}
              sliders={entry.sliders}
              settings={settings}
              onCommit={(values) => onSettingsChange(manifest.id, values)}
              language={language}
              t={t}
            />
          )}
          {enabled && Panel && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              aria-label={t('pluginRowOptionsFor').replace('{name}', name)}
              onClick={() => setOptionsOpen(!expanded)}
              className="text-primary mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium hover:underline"
            >
              {t('pluginRowOptions')}
              <ChevronDown
                aria-hidden="true"
                className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>
        <Switch
          id={inputId}
          checked={enabled}
          aria-describedby={descriptionId}
          onChange={(event) =>
            control
              ? control.setEnabled(event.target.checked)
              : onToggle(manifest.id, event.target.checked)
          }
        />
      </div>
      {enabled &&
        Panel &&
        panelIo && (
          // Mounted only while on and open: polling, timers and a Sync button end with the switch.
          <div
            id={panelId}
            role="group"
            hidden={!expanded}
            aria-label={t('pluginRowOptionsFor').replace('{name}', name)}
            className="border-border/60 mt-2 border-s-2 ps-3"
          >
            {expanded && (
              <Panel
                values={panelIo.values}
                write={panelIo.write}
                contextSync={panelIo.contextSync}
                idPrefix={panelId}
                t={t}
              />
            )}
          </div>
        )}
    </li>
  );
}
