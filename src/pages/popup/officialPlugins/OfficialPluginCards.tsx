import React, { type ReactNode, useCallback, useLayoutEffect, useRef } from 'react';

import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { isRTLLanguage } from '@/core/utils/rtl';
import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';
import type { PluginManifest, PluginSettingValue } from '@/features/plugins/types';
import type { TranslationKey } from '@/utils/translations';

import type { UndoOffer } from '../hooks/useUndoToast';
import {
  type OfficialPanelIo,
  type OfficialPluginControls,
  type OfficialPluginFlip,
  OfficialPluginListRow,
} from './OfficialPluginRow';
import {
  OFFICIAL_PLUGIN_TOPICS,
  type OfficialPluginTopic,
  type OfficialPluginTopicId,
} from './officialPluginRegistry';
import type { OfficialPluginRow } from './useOfficialPluginList';

export interface OfficialPluginCardsProps {
  readonly rows: readonly OfficialPluginRow[];
  /** Statuses the active tab reported, for the paused / waiting note. */
  readonly statuses: readonly PluginStatus[];
  /** Manifests to name a local plugin that holds the runtime. */
  readonly nameSources: readonly PluginManifest[];
  /** Site capability and settings-search gate for a row of a topic card. */
  readonly isVisible: (topic: OfficialPluginTopicId, pluginId: string) => boolean;
  readonly onToggle: (pluginId: string, enabled: boolean) => void;
  readonly onSettingsChange: (
    pluginId: string,
    values: Readonly<Record<string, PluginSettingValue>>,
  ) => void;
  /** Switches the popup drives itself, by registry control id. */
  readonly controls?: OfficialPluginControls;
  /** What the rows' option panels read and write. */
  readonly panelIo?: OfficialPanelIo;
  /** Offers to put a flipped switch back. */
  readonly onUndoOffer?: (offer: UndoOffer) => void;
  /** Places each topic card in its popup section. */
  readonly wrapSection: (id: OfficialPluginTopicId, content: ReactNode) => ReactNode;
  readonly language: string;
  readonly t: (key: TranslationKey) => string;
}

type TopicCardProps = Omit<OfficialPluginCardsProps, 'wrapSection' | 'onUndoOffer'> & {
  readonly topic: OfficialPluginTopic;
  readonly onFlipped: (flip: OfficialPluginFlip) => void;
};

function OfficialPluginTopicCard({
  topic,
  rows,
  statuses,
  nameSources,
  isVisible,
  onToggle,
  onFlipped,
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
      className="p-4 transition-all hover:shadow-md"
      dir={isRTLLanguage(language) ? 'rtl' : undefined}
    >
      <CardTitle id={titleId} className="mb-1.5">
        {t(topic.title)}
      </CardTitle>
      <CardContent className="p-0">
        <ul aria-labelledby={titleId} className="divide-border/60 -mb-2.5 divide-y">
          {shown.map((row) => (
            <OfficialPluginListRow
              key={row.manifest.id}
              row={row}
              status={statuses.find((entry) => entry.id === row.manifest.id)}
              nameSources={nameSources}
              control={row.entry.control ? controls?.[row.entry.control] : undefined}
              panelIo={panelIo}
              onToggle={onToggle}
              onFlipped={onFlipped}
              onSettingsChange={onSettingsChange}
              language={language}
              t={t}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * The official Gemini / AI Studio plugins as topic cards, one switch per
 * feature. Each switch shows the stored preference; what the page is doing
 * differently right now shows as the note under it. A topic with no row on
 * this tab, or none a search kept, renders no card.
 */
export function OfficialPluginCards({
  wrapSection,
  onUndoOffer,
  ...props
}: OfficialPluginCardsProps) {
  // Undo goes through the switch's write as it stands when pressed, not as it was at the flip.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const { t } = props;
  const onFlipped = useCallback(
    ({ pluginId, name, enabled }: OfficialPluginFlip) => {
      if (!onUndoOffer) return;
      const message = t(enabled ? 'pluginToggleToastOn' : 'pluginToggleToastOff').replace(
        '{name}',
        () => name,
      );
      onUndoOffer({
        message,
        undo: () => {
          const { rows, controls, onToggle } = latest.current;
          const id = rows.find((row) => row.manifest.id === pluginId)?.entry.control;
          const control = id ? controls?.[id] : undefined;
          if (control) control.setEnabled(!enabled);
          else onToggle(pluginId, !enabled);
        },
      });
    },
    [onUndoOffer, t],
  );
  return (
    <>
      {OFFICIAL_PLUGIN_TOPICS.map((topic) =>
        wrapSection(
          topic.id,
          <OfficialPluginTopicCard {...props} topic={topic} onFlipped={onFlipped} />,
        ),
      )}
    </>
  );
}
