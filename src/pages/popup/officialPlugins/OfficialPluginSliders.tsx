import React, { useEffect, useRef, useState } from 'react';

import { Slider } from '@/components/ui/slider';
import type { PluginManifest, PluginSettingValue, PluginSettings } from '@/features/plugins/types';
import type { TranslationKey } from '@/utils/translations';

import type { OfficialPluginSlider } from './officialPluginRegistry';

interface SliderRowProps {
  readonly id: string;
  readonly presentation: OfficialPluginSlider;
  readonly min: number;
  readonly max: number;
  /** The stored reading, as the slider shows it. */
  readonly value: number;
  readonly onCommit: (value: number) => void;
  readonly t: (key: TranslationKey) => string;
}

function SliderRow({ id, presentation, min, max, value, onCommit, t }: SliderRowProps) {
  const [draft, setDraft] = useState(value);
  const dragging = useRef(false);
  // Follow storage (a restore, another window) except while the user holds the thumb.
  useEffect(() => {
    if (!dragging.current) setDraft(value);
  }, [value]);
  const label = t(presentation.label);
  const shown = `${draft}${presentation.unit}`;
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
        <span id={id} className="text-muted-foreground min-w-0 truncate">
          {label}
        </span>
        <span className="text-primary bg-primary/10 shrink-0 rounded px-1.5 font-semibold tabular-nums">
          {shown}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={presentation.step}
        value={draft}
        aria-labelledby={id}
        aria-valuetext={shown}
        onValueChange={(next) => {
          dragging.current = true;
          setDraft(next);
        }}
        onValueCommit={(next) => {
          const moved = dragging.current;
          dragging.current = false;
          // Only a value the user moved writes. A bare click must not save the browser's
          // step-snapped reading (312 shows as 316 on a 180 + 8n sidebar grid), and a
          // stored legacy sidebar percentage stays as it is until a new width is picked.
          if (!moved || next === value) {
            setDraft(value);
            return;
          }
          setDraft(next);
          onCommit(next);
        }}
      />
      <div className="text-muted-foreground mt-1 flex items-center justify-between text-[10px]">
        <span>{t(presentation.minLabel)}</span>
        <span>{t(presentation.maxLabel)}</span>
      </div>
    </div>
  );
}

/**
 * The number settings of an enabled official plugin row, one slider each,
 * saved when the user releases the thumb or finishes a keyboard step: a sync
 * write per drag step would burn through the storage write quota.
 */
export function OfficialPluginSliders({
  manifest,
  sliders,
  settings,
  onCommit,
  t,
}: {
  readonly manifest: PluginManifest;
  readonly sliders: Readonly<Record<string, OfficialPluginSlider>>;
  readonly settings: PluginSettings;
  readonly onCommit: (values: Readonly<Record<string, PluginSettingValue>>) => void;
  readonly t: (key: TranslationKey) => string;
}) {
  const fields = manifest.contributes.settings ?? {};
  return (
    <div role="group" className="mt-1">
      {Object.entries(sliders).map(([key, presentation]) => {
        const field = fields[key];
        if (field?.type !== 'number') return null;
        const stored = Number(settings[key] ?? field.default);
        const value = presentation.toDisplay ? presentation.toDisplay(stored) : stored;
        return (
          <SliderRow
            key={key}
            id={`official-plugin-slider-${manifest.id.replace(/[^a-zA-Z0-9_-]/g, '-')}-${key}`}
            presentation={presentation}
            min={field.min ?? 0}
            max={field.max ?? 100}
            value={value}
            onCommit={(next) => onCommit({ [key]: next })}
            t={t}
          />
        );
      })}
    </div>
  );
}
