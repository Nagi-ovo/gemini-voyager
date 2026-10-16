import React from 'react';

import type { TranslationKey } from '@/utils/translations';

import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { SettingToggleRow } from './SettingToggleRow';
import { TimelineOptions, type TimelineSettingsValues } from './TimelineOptions';

export type { ScrollMode, TimelineSettingsValues } from './TimelineOptions';

export interface TimelineSettingsCardProps {
  values: TimelineSettingsValues;
  /** One key per call; the popup mirrors it into state and storage. */
  onChange: (patch: Partial<TimelineSettingsValues>) => void;
  onResetPosition: () => void;
  onViewStarredHistory: () => void;
  /** Which entries the site's rail offers, keyed by the setting's search id. */
  isVisible: (settingId: string) => boolean;
  t: (key: TranslationKey) => string;
}

/**
 * The timeline card of a plugin site whose rail is a timeline plugin. Gemini's
 * own timeline is the Show Timeline row of the Plugins card, with these
 * options in its panel.
 */
export function TimelineSettingsCard({
  values,
  onChange,
  onResetPosition,
  onViewStarredHistory,
  isVisible,
  t,
}: TimelineSettingsCardProps) {
  return (
    <Card className="p-4 transition-all hover:shadow-md">
      <CardTitle className="mb-4">{t('timelineOptions')}</CardTitle>
      <CardContent className="space-y-4 p-0">
        <SettingToggleRow
          id="timeline-enabled"
          settingId="timelineEnabled"
          label="timelineEnable"
          hint="timelineEnableHint"
          checked={values.timelineEnabled}
          onChange={(timelineEnabled) => onChange({ timelineEnabled })}
          isVisible={isVisible}
          t={t}
        />
        <TimelineOptions
          values={values}
          onChange={onChange}
          onResetPosition={onResetPosition}
          onViewStarredHistory={onViewStarredHistory}
          isVisible={isVisible}
          t={t}
        />
      </CardContent>
    </Card>
  );
}
