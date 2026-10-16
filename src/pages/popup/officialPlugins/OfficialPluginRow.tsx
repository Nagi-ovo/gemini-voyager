import React from 'react';

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
  /** Context Sync's request state, owned by the Popup so hiding the card keeps it. */
  readonly contextSync?: ContextSyncRequest;
  /** Opens the popup's Saved Library view. */
  readonly openStarredHistory?: () => void;
}

/** What a user's flip of a row's switch did, for an undo offer. */
export interface OfficialPluginFlip {
  readonly pluginId: string;
  /** The row's shown name. */
  readonly name: string;
  readonly enabled: boolean;
}

export interface OfficialPluginRowProps {
  readonly row: Row;
  readonly status: PluginStatus | undefined;
  readonly nameSources: readonly PluginManifest[];
  readonly control: OfficialPluginControl | undefined;
  readonly panelIo: OfficialPanelIo | undefined;
  readonly onToggle: (pluginId: string, enabled: boolean) => void;
  /** Told after the user flips the switch, once the write is under way. */
  readonly onFlipped?: (flip: OfficialPluginFlip) => void;
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
  onToggle,
  onFlipped,
  onSettingsChange,
  language,
  t,
}: OfficialPluginRowProps) {
  const { manifest, entry, settings, usageHint } = row;
  const requirement = row.unmetRequirement;
  const unavailable = requirement !== null && 'note' in requirement;
  const enabled = !unavailable && (control ? control.enabled : row.enabled);
  const requirementNote = requirement
    ? 'note' in requirement
      ? t(requirement.note)
      : t('pluginRowNeedsSetting')
          .replace('{setting}', () => t(requirement.setting))
          .replace('{card}', () => t(requirement.card))
    : null;
  // Number settings show as the registry's sliders, which save on release.
  const sliderKeys = entry.sliders ? Object.keys(entry.sliders) : [];
  const InlinePanel = entry.inlinePanel && panelIo ? OFFICIAL_PANELS[entry.inlinePanel] : null;
  const hasOtherSettings =
    !entry.inlinePanel &&
    Object.keys(manifest.contributes.settings ?? {}).some((key) => !sliderKeys.includes(key));
  const name = displayName(pickLocalized(manifest, 'name', language));
  const inputId = domId('official-plugin', manifest.id);
  const descriptionId = domId('official-plugin-description', manifest.id);
  const requirementId = domId('official-plugin-requirement', manifest.id);
  const panelId = domId('official-plugin-options', manifest.id);
  const Panel = entry.panel && panelIo ? OFFICIAL_PANELS[entry.panel] : null;
  // Options show under the row while it is on, as the old cards showed them; off keeps their values.
  const hasOptions =
    enabled &&
    (hasOtherSettings || InlinePanel !== null || entry.sliders !== undefined || Panel !== null);
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
        <div className={`min-w-0 flex-1 text-start ${unavailable ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-1">
            <label
              htmlFor={inputId}
              className={`text-sm font-medium ${unavailable ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <bdi>{name}</bdi>
            </label>
            {entry.experimental && <ExperimentalBadge title={t('experimentalLabel')} />}
          </div>
          <p id={descriptionId} className="text-muted-foreground mt-0.5 text-xs leading-snug">
            {pickLocalized(manifest, 'description', language)}
          </p>
          {requirementNote && (
            <p
              id={requirementId}
              className={`mt-1 text-xs leading-snug ${unavailable ? BLOCKED_NOTE_TONE_CLASS.waiting : BLOCKED_NOTE_TONE_CLASS.paused}`}
            >
              {requirementNote}
            </p>
          )}
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
        </div>
        <Switch
          id={inputId}
          checked={enabled}
          disabled={row.unmetRequirement !== null}
          aria-describedby={
            row.unmetRequirement ? `${descriptionId} ${requirementId}` : descriptionId
          }
          onChange={(event) => {
            const next = event.target.checked;
            if (control) control.setEnabled(next);
            else onToggle(manifest.id, next);
            onFlipped?.({ pluginId: manifest.id, name, enabled: next });
          }}
        />
      </div>
      {hasOptions && (
        <div
          id={panelId}
          role="group"
          aria-label={t('pluginRowOptionsFor').replace('{name}', () => name)}
          className="mt-1"
        >
          {hasOtherSettings && (
            <PluginSettings
              plugin={manifest}
              values={settings}
              hiddenKeys={sliderKeys}
              handleSetting={(id, key, value) => onSettingsChange(id, { [key]: value })}
              handleImmediateSettings={onSettingsChange}
            />
          )}
          {InlinePanel && panelIo && (
            <InlinePanel values={panelIo.values} write={panelIo.write} idPrefix={panelId} t={t} />
          )}
          {entry.sliders && (
            <OfficialPluginSliders
              manifest={manifest}
              sliders={entry.sliders}
              settings={settings}
              onCommit={(values) => onSettingsChange(manifest.id, values)}
              language={language}
              t={t}
            />
          )}
          {/* Mounted only while on: polling, timers and a Sync button end with the switch. */}
          {Panel && panelIo && (
            <div className="mt-3">
              <Panel
                values={panelIo.values}
                write={panelIo.write}
                contextSync={panelIo.contextSync}
                openStarredHistory={panelIo.openStarredHistory}
                idPrefix={panelId}
                t={t}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
