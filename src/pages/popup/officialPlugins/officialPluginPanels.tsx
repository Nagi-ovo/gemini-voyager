import React from 'react';

import { Switch } from '@/components/ui/switch';
import { StorageKeys } from '@/core/types/common';
import { resolveVisualEffect } from '@/core/utils/visualEffectValues';
import type { FormulaCopyFormat } from '@/features/formulaCopy/FormulaCopyService';
import type { LegacySettingSnapshot } from '@/features/plugins/storage/legacySettingBindings';
import type { TranslationKey } from '@/utils/translations';

import { VisualEffectChoices } from '../components/VisualEffectPicker';
import { ContextSyncPanel } from './ContextSyncPanel';
import { TimelinePanel } from './TimelinePanel';
import type { OfficialPanelId } from './officialPluginRegistry';
import type { ContextSyncRequest } from './useContextSyncRequest';

/** What every panel gets: its keys from the live snapshot, and the overlay's writer. */
export interface OfficialPanelProps {
  readonly values: LegacySettingSnapshot;
  readonly write: (payload: Record<string, unknown>) => void;
  /** Context Sync's request, kept above the panel so it outlives a collapse. */
  readonly contextSync?: ContextSyncRequest;
  /** Opens the Saved Library (starred messages) view of the popup. */
  readonly openStarredHistory?: () => void;
  /** The row's id, for ids unique per row. */
  readonly idPrefix: string;
  readonly t: (key: TranslationKey) => string;
}

const FORMAT_OPTIONS: readonly { value: FormulaCopyFormat; label: TranslationKey }[] = [
  { value: 'latex', label: 'formulaCopyFormatLatex' },
  { value: 'unicodemath', label: 'formulaCopyFormatUnicodeMath' },
  { value: 'no-dollar', label: 'formulaCopyFormatNoDollar' },
  { value: 'notion', label: 'formulaCopyFormatNotion' },
];

function isFormulaCopyFormat(value: unknown): value is FormulaCopyFormat {
  return FORMAT_OPTIONS.some((option) => option.value === value);
}

/** The copy format Gemini and AI Studio share, and a note that the switch is shared too. */
function FormulaCopyPanel({ values, write, idPrefix, t }: OfficialPanelProps) {
  const stored = values[StorageKeys.FORMULA_COPY_FORMAT];
  // The runtime reads anything else as LaTeX.
  const format: FormulaCopyFormat = isFormulaCopyFormat(stored) ? stored : 'latex';
  const legendId = `${idPrefix}-format`;
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-[11px] leading-snug">{t('formulaCopyScopeNote')}</p>
      <div role="radiogroup" aria-labelledby={legendId} className="space-y-1.5">
        <p id={legendId} className="text-muted-foreground text-[11px]">
          {t('formulaCopyFormatHint')}
        </p>
        {FORMAT_OPTIONS.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name={`${idPrefix}-format`}
              value={option.value}
              checked={format === option.value}
              onChange={() => write({ [StorageKeys.FORMULA_COPY_FORMAT]: option.value })}
              className="h-3.5 w-3.5"
            />
            <span className="text-xs">{t(option.label)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Whether saved highlights also mark the timeline; the highlights themselves stay. */
function HighlightPanel({ values, write, idPrefix, t }: OfficialPanelProps) {
  // On unless stored off, as the highlight runtime reads it.
  const markers = values[StorageKeys.HIGHLIGHT_TIMELINE_MARKERS_ENABLED] !== false;
  const hintId = `${idPrefix}-markers-hint`;
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="text-muted-foreground block text-[11px]">
          {t('showHighlightTimelineMarkers')}
        </span>
        <span
          id={hintId}
          className="text-muted-foreground/80 mt-0.5 block text-[10px] leading-snug"
        >
          {t('showHighlightTimelineMarkersHint')}
        </span>
      </span>
      <Switch
        checked={markers}
        aria-label={t('showHighlightTimelineMarkers')}
        aria-describedby={hintId}
        onChange={(event) =>
          write({ [StorageKeys.HIGHLIGHT_TIMELINE_MARKERS_ENABLED]: event.target.checked })
        }
      />
    </div>
  );
}

/**
 * The effect to show while the row is on (Off is its switch). Picking writes the
 * pair the Visual Effects card has always written, clearing the legacy snow flag.
 */
function VisualEffectPanel({ values, write, t }: OfficialPanelProps) {
  const effect = resolveVisualEffect(
    values[StorageKeys.GV_VISUAL_EFFECT],
    values[StorageKeys.GV_SNOW_EFFECT],
  );
  return (
    <VisualEffectChoices
      value={effect}
      withoutOff
      onChange={(next) =>
        write({ [StorageKeys.GV_VISUAL_EFFECT]: next, [StorageKeys.GV_SNOW_EFFECT]: false })
      }
      t={t}
      className="mt-2"
    />
  );
}

export const OFFICIAL_PANELS: Readonly<
  Record<OfficialPanelId, (props: OfficialPanelProps) => React.ReactElement>
> = {
  formulaCopy: FormulaCopyPanel,
  highlight: HighlightPanel,
  contextSync: ContextSyncPanel,
  visualEffect: VisualEffectPanel,
  timeline: TimelinePanel,
};
