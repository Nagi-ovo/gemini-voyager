import React, { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';

import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { isRTLLanguage } from '@/core/utils/rtl';
import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';
import { legacyEnableWrite } from '@/features/plugins/storage/legacySettingBindings';
import type { PluginManifest, PluginSettingValue } from '@/features/plugins/types';
import type { TranslationKey } from '@/utils/translations';

import { displayName, pickLocalized } from '../components/PluginIdentity';
import type { UndoOffer, WithdrawUndoOffer } from '../hooks/useUndoToast';
import {
  type OfficialPanelIo,
  type OfficialPluginControl,
  type OfficialPluginControls,
  OfficialPluginListRow,
  domId,
} from './OfficialPluginRow';
import {
  type OfficialControlId,
  OFFICIAL_PLUGIN_TOPICS,
  type OfficialPluginTopic,
  type OfficialPluginTopicId,
} from './officialPluginRegistry';
import type { OfficialPluginFlipWrite, OfficialPluginRow } from './useOfficialPluginList';

export interface OfficialPluginCardsProps {
  readonly rows: readonly OfficialPluginRow[];
  /** Statuses the active tab reported, for the paused / waiting note. */
  readonly statuses: readonly PluginStatus[];
  /** Manifests to name a local plugin that holds the runtime. */
  readonly nameSources: readonly PluginManifest[];
  /** Site capability and settings-search gate for a row of a topic card. */
  readonly isVisible: (topic: OfficialPluginTopicId, pluginId: string) => boolean;
  readonly onToggle: (pluginId: string, enabled: boolean) => void;
  /** Flips a switch and keeps what it replaced, for an undo. */
  readonly onFlip?: (pluginId: string, enabled: boolean) => OfficialPluginFlipWrite;
  readonly onSettingsChange: (
    pluginId: string,
    values: Readonly<Record<string, PluginSettingValue>>,
  ) => void;
  /** Switches the popup drives itself, by registry control id. */
  readonly controls?: OfficialPluginControls;
  /** What the rows' option panels read and write. */
  readonly panelIo?: OfficialPanelIo;
  /** Offers to put a flipped switch back; returns how to take the offer back. */
  readonly onUndoOffer?: (offer: UndoOffer) => WithdrawUndoOffer;
  /** Places each topic card in its popup section. */
  readonly wrapSection: (id: OfficialPluginTopicId, content: ReactNode) => ReactNode;
  readonly language: string;
  readonly t: (key: TranslationKey) => string;
}

type TopicCardProps = Omit<OfficialPluginCardsProps, 'wrapSection' | 'onUndoOffer' | 'onFlip'> & {
  readonly topic: OfficialPluginTopic;
};

function OfficialPluginTopicCard({
  topic,
  rows,
  statuses,
  nameSources,
  isVisible,
  onToggle,
  onSettingsChange,
  controls,
  panelIo,
  language,
  t,
}: TopicCardProps) {
  const shown = rows.filter(
    (row) => row.entry.topic === topic.id && isVisible(topic.id, row.manifest.id),
  );
  if (shown.length === 0) return null;
  const titleId = `official-plugin-topic-${topic.id}`;
  return (
    // The popup itself sets no direction, so the card mirrors itself for RTL languages.
    <Card
      data-plugin-topic={topic.id}
      className="p-4"
      dir={isRTLLanguage(language) ? 'rtl' : undefined}
    >
      <CardTitle id={titleId} className="mb-4">
        {t(topic.title)}
      </CardTitle>
      <CardContent className="p-0">
        {/* Spaced like the other settings cards, with no rules between rows. */}
        <ul aria-labelledby={titleId} className="space-y-4">
          {shown.map((row) => (
            <OfficialPluginListRow
              key={row.manifest.id}
              row={row}
              status={statuses.find((entry) => entry.id === row.manifest.id)}
              nameSources={nameSources}
              control={row.entry.control ? controls?.[row.entry.control] : undefined}
              panelIo={panelIo}
              onToggle={onToggle}
              onSettingsChange={onSettingsChange}
              language={language}
              t={t}
              className=""
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** A stored value as a switch reads it: an unstored key and a cleared one read alike. */
function sameShown(a: unknown, b: unknown): boolean {
  return Object.is(a ?? undefined, b ?? undefined);
}

interface ActiveOffer {
  /** What the flip wrote; once shown, any other value means something changed it since. */
  readonly written: Readonly<Record<string, unknown>>;
  settled: boolean;
  readonly withdraw: WithdrawUndoOffer;
}

/**
 * The official Gemini / AI Studio plugins as topic cards, one switch per
 * feature. Each switch shows the stored preference; what the page is doing
 * differently right now shows as the note under it. A topic with no row on
 * this tab, or none a search kept, renders no card. A flipped switch offers
 * an undo that puts back exactly what the flip replaced.
 */
export function OfficialPluginCards({
  wrapSection,
  onUndoOffer,
  onFlip,
  ...props
}: OfficialPluginCardsProps) {
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const active = useRef<ActiveOffer | null>(null);
  const shownValues = props.panelIo?.values;

  // An undo offered before a later change to the same keys (an effect picked under the row,
  // another window, a restore) would wipe that change out, so the offer goes once they move.
  useEffect(() => {
    const offer = active.current;
    if (!offer || !shownValues) return;
    const holds = Object.entries(offer.written).every(([key, value]) =>
      sameShown(shownValues[key], value),
    );
    if (holds) offer.settled = true;
    else if (offer.settled) {
      active.current = null;
      offer.withdraw();
    }
  }, [shownValues]);

  const offerUndo = (
    pluginId: string,
    enabled: boolean,
    written: Readonly<Record<string, unknown>>,
    restore: () => void,
  ) => {
    if (!onUndoOffer) return;
    const { rows, language, t } = latest.current;
    const manifest = rows.find((row) => row.manifest.id === pluginId)?.manifest;
    const name = manifest ? displayName(pickLocalized(manifest, 'name', language)) : pluginId;
    const withdraw = onUndoOffer({
      message: t(enabled ? 'pluginToggleToastOn' : 'pluginToggleToastOff').replace(
        '{name}',
        () => name,
      ),
      undo: restore,
      returnFocus: () => document.getElementById(domId('official-plugin', pluginId)),
    });
    active.current = { written, settled: false, withdraw };
  };

  const toggle = (pluginId: string, enabled: boolean) => {
    if (!onFlip || !onUndoOffer) {
      props.onToggle(pluginId, enabled);
      return;
    }
    const flip = onFlip(pluginId, enabled);
    offerUndo(pluginId, enabled, flip.written, flip.restore);
  };

  // A permission-flow switch writes through its own control, which also puts it back: its key
  // reads unstored and false alike.
  const { controls, rows } = props;
  const offeringControls = ((): OfficialPluginControls | undefined => {
    if (!controls) return undefined;
    const wrapped: Partial<Record<OfficialControlId, OfficialPluginControl>> = {};
    for (const [id, control] of Object.entries(controls) as [
      OfficialControlId,
      OfficialPluginControl | undefined,
    ][]) {
      if (!control) continue;
      const pluginId = rows.find((row) => row.entry.control === id)?.manifest.id;
      wrapped[id] = {
        enabled: control.enabled,
        setEnabled: (enabled) => {
          // First: a permission request must stay in the user's gesture.
          control.setEnabled(enabled);
          if (!pluginId) return;
          offerUndo(pluginId, enabled, legacyEnableWrite(pluginId, enabled), () =>
            latest.current.controls?.[id]?.setEnabled(!enabled),
          );
        },
      };
    }
    return wrapped;
  })();

  return (
    <>
      {OFFICIAL_PLUGIN_TOPICS.map((topic) =>
        wrapSection(
          topic.id,
          <OfficialPluginTopicCard
            {...props}
            topic={topic}
            onToggle={toggle}
            controls={offeringControls}
          />,
        ),
      )}
    </>
  );
}
