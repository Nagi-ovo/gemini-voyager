import React, { useRef } from 'react';

import type { TimelineStyle } from '@/core/types/common';
import type { TranslationKey } from '@/utils/translations';

import { Button } from '../../../components/ui/button';
import { SettingToggleRow } from './SettingToggleRow';

export type ScrollMode = 'jump' | 'flow';

/** Every timeline setting the popup edits; the caller owns the state and persistence. */
export interface TimelineSettingsValues {
  timelineEnabled: boolean;
  timelineStyle: TimelineStyle;
  mode: ScrollMode;
  hideContainer: boolean;
  draggableTimeline: boolean;
  timelinePreviewPinned: boolean;
  markerLevelEnabled: boolean;
  showMessageTimestamps: boolean;
}

export interface TimelineOptionsProps {
  values: TimelineSettingsValues;
  /** One key per call (node levels also bring the dots style). */
  onChange: (patch: Partial<TimelineSettingsValues>) => void;
  onResetPosition: () => void;
  onViewStarredHistory: () => void;
  /** Which entries this rail offers, keyed by the setting's search id. */
  isVisible: (settingId: string) => boolean;
  t: (key: TranslationKey) => string;
}

const TIMELINE_STYLE_OPTIONS: readonly { value: TimelineStyle; label: TranslationKey }[] = [
  { value: 'dots', label: 'timelineStyleDots' },
  { value: 'ruler', label: 'timelineStyleRuler' },
  { value: 'compact', label: 'timelineStyleCompact' },
];

const SCROLL_MODE_OPTIONS: readonly { value: ScrollMode; label: TranslationKey }[] = [
  { value: 'flow', label: 'flow' },
  { value: 'jump', label: 'jump' },
];

interface SegmentedChoiceProps<T extends string> {
  label: string;
  options: readonly { value: T; label: TranslationKey }[];
  value: T;
  isDisabled: (value: T) => boolean;
  onChange: (value: T) => void;
  t: (key: TranslationKey) => string;
}

/**
 * A labelled radio group of segmented buttons. The chosen one paints its own
 * background, so it needs no position math and mirrors itself in RTL.
 */
function SegmentedChoice<T extends string>({
  label,
  options,
  value,
  isDisabled,
  onChange,
  t,
}: SegmentedChoiceProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((option) => !isDisabled(option.value));
  // One Tab stop: the checked radio, or the first enabled one when the checked one is not.
  const checkedIndex = options.findIndex((option) => option.value === value);
  const tabStop = enabled[checkedIndex] ? checkedIndex : enabled.indexOf(true);

  // Arrows move the choice to the next enabled radio and wrap, as native radios do.
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, from: number) => {
    const rtl = event.currentTarget.closest('[dir]')?.getAttribute('dir') === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    let step = 0;
    if (event.key === forward || event.key === 'ArrowDown') step = 1;
    else if (event.key === backward || event.key === 'ArrowUp') step = -1;
    else if (event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const order =
      step === 0
        ? options.map((_, index) => index)
        : options.map(
            (_, offset) => (from + step * (offset + 1) + options.length * 2) % options.length,
          );
    const candidates = order.filter((index) => enabled[index]);
    const next = event.key === 'End' ? candidates[candidates.length - 1] : candidates[0];
    if (next === undefined || next === from) return;
    buttons.current[next]?.focus();
    onChange(options[next].value);
  };

  return (
    <div role="radiogroup" aria-label={label}>
      <p aria-hidden="true" className="mb-2 text-sm font-medium">
        {label}
      </p>
      <div
        className="bg-secondary/60 grid gap-1 rounded-xl p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option, index) => {
          const checked = value === option.value;
          return (
            <button
              key={option.value}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={index === tabStop ? 0 : -1}
              disabled={!enabled[index]}
              className={`rounded-lg px-2 py-2 text-sm font-bold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                checked
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground enabled:hover:text-foreground'
              }`}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {t(option.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The timeline's options below its on/off switch: the Plugins row's panel on
 * Gemini, and the plugin-site rail card. While the rail is off they stay
 * visible but disabled, except message times and the Saved Library.
 */
export function TimelineOptions({
  values,
  onChange,
  onResetPosition,
  onViewStarredHistory,
  isVisible,
  t,
}: TimelineOptionsProps) {
  const off = !values.timelineEnabled;
  // Ruler and compact paint no rail, so only dots has a container to hide. The
  // stored value is kept and applies again when the user returns to dots.
  const containerless = values.timelineStyle !== 'dots';

  return (
    <>
      <div hidden={!isVisible('timelineStyle')}>
        <SegmentedChoice
          label={t('timelineStyle')}
          options={TIMELINE_STYLE_OPTIONS}
          value={values.timelineStyle}
          // Node levels have a shape only on the dots rail.
          isDisabled={(style) => off || (values.markerLevelEnabled && style !== 'dots')}
          onChange={(timelineStyle) => onChange({ timelineStyle })}
          t={t}
        />
      </div>
      <div hidden={!isVisible('scrollMode')}>
        <SegmentedChoice
          label={t('scrollMode')}
          options={SCROLL_MODE_OPTIONS}
          value={values.mode}
          isDisabled={() => off}
          onChange={(mode) => onChange({ mode })}
          t={t}
        />
      </div>
      <SettingToggleRow
        id="hide-container"
        settingId="hideOuterContainer"
        label="hideOuterContainer"
        hint={containerless ? 'hideOuterContainerDotsOnly' : undefined}
        checked={values.hideContainer}
        disabled={off || containerless}
        onChange={(hideContainer) => onChange({ hideContainer })}
        isVisible={isVisible}
        t={t}
      />
      <SettingToggleRow
        id="draggable-timeline"
        settingId="draggableTimeline"
        label="draggableTimeline"
        checked={values.draggableTimeline}
        disabled={off}
        onChange={(draggableTimeline) => onChange({ draggableTimeline })}
        isVisible={isVisible}
        t={t}
      />
      <SettingToggleRow
        id="timeline-preview-pinned"
        settingId="pinTimelinePreview"
        label="pinTimelinePreview"
        hint="pinTimelinePreviewHint"
        checked={values.timelinePreviewPinned}
        disabled={off}
        onChange={(timelinePreviewPinned) => onChange({ timelinePreviewPinned })}
        isVisible={isVisible}
        t={t}
      />
      <SettingToggleRow
        id="marker-level-enabled"
        settingId="enableMarkerLevel"
        label="enableMarkerLevel"
        hint="enableMarkerLevelHint"
        experimental
        checked={values.markerLevelEnabled}
        disabled={off}
        onChange={(markerLevelEnabled) => onChange({ markerLevelEnabled })}
        isVisible={isVisible}
        t={t}
      />
      <SettingToggleRow
        id="show-message-timestamps"
        settingId="showMessageTimestamps"
        label="showMessageTimestamps"
        hint="showMessageTimestampsHint"
        experimental
        checked={values.showMessageTimestamps}
        onChange={(showMessageTimestamps) => onChange({ showMessageTimestamps })}
        isVisible={isVisible}
        // On Gemini it is a Plugins row of its own: no second switch for the same key.
        unmountWhenHidden
        t={t}
      />
      <Button
        hidden={!isVisible('resetTimelinePosition')}
        disabled={off}
        variant="outline"
        size="sm"
        className="group hover:border-primary/50 mt-2 w-full"
        onClick={onResetPosition}
      >
        <span className="text-xs transition-transform group-hover:scale-105">
          {t('resetTimelinePosition')}
        </span>
      </Button>
      <Button
        hidden={!isVisible('viewStarredHistory')}
        variant="outline"
        size="sm"
        className="group hover:border-primary/50 mt-2 w-full"
        onClick={onViewStarredHistory}
      >
        <span className="flex items-center gap-1.5 text-xs transition-transform group-hover:scale-105">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-primary"
            aria-hidden="true"
          >
            <path
              d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
              fill="currentColor"
            />
          </svg>
          {t('viewStarredHistory')}
        </span>
      </Button>
    </>
  );
}
