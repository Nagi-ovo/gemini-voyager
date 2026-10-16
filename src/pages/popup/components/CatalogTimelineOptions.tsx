import React, { useId, useState } from 'react';

import { ChevronDown } from 'lucide-react';

import { isRTLLanguage } from '@/core/utils/rtl';
import type { TranslationKey } from '@/utils/translations';

import {
  type CatalogTimelineSettings,
  PLUGIN_SETTING_FOR_CARD,
} from '../hooks/useCatalogTimelineSettings';
import { TimelineOptions } from './TimelineOptions';

export interface CatalogTimelineOptionsProps {
  readonly timeline: CatalogTimelineSettings;
  /** Plugin settings the row left out for these options; any other stays the row's own control. */
  readonly ownedSettingKeys: readonly string[];
  /** The rail plugin's name, for the disclosure's label. */
  readonly name: string;
  readonly onViewStarredHistory: () => void;
  readonly language: string;
  readonly t: (key: TranslationKey) => string;
}

/**
 * A plugin site's timeline options under its rail's plugin row, as Gemini's
 * timeline row has them: collapsed behind Options, shown only while the rail is
 * on. Message times are the rail's own display option on these sites; the key
 * is Gemini's, shared by design.
 */
export function CatalogTimelineOptions({
  timeline,
  ownedSettingKeys,
  name,
  onViewStarredHistory,
  language,
  t,
}: CatalogTimelineOptionsProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const isVisible = (settingId: string) => {
    if (!timeline.offers(settingId)) return false;
    const pluginKey = PLUGIN_SETTING_FOR_CARD[settingId];
    // A local rail keeps its own style control; showing it here as well would be a second one.
    return pluginKey === undefined || ownedSettingKeys.includes(pluginKey);
  };
  return (
    <div dir={isRTLLanguage(language) ? 'rtl' : undefined}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('pluginRowOptionsFor').replace('{name}', () => name)}
        onClick={() => setOpen(!open)}
        className="text-primary mt-2 inline-flex items-center gap-0.5 text-xs font-medium hover:underline"
      >
        {t('pluginRowOptions')}
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div id={panelId} className="border-border/60 mt-2 space-y-4 border-t pt-3">
          <TimelineOptions
            values={timeline.values}
            onChange={timeline.onChange}
            onResetPosition={timeline.resetPosition}
            onViewStarredHistory={onViewStarredHistory}
            isVisible={isVisible}
            t={t}
          />
        </div>
      )}
    </div>
  );
}
