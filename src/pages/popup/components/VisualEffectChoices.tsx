import React from 'react';

import { SegmentedControl } from '@/components/ui/segmented-control';
import type { VisualEffect } from '@/core/utils/visualEffectValues';
import type { TranslationKey } from '@/utils/translations';

const STROKE = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
} as const;

const OPTIONS: readonly { value: VisualEffect; label: TranslationKey; icon: React.ReactNode }[] = [
  {
    value: 'snow',
    label: 'visualEffectSnow',
    icon: (
      <svg {...STROKE} strokeLinejoin="round">
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
        <line x1="12" y1="2" x2="14.5" y2="4.5" />
        <line x1="12" y1="2" x2="9.5" y2="4.5" />
        <line x1="12" y1="22" x2="14.5" y2="19.5" />
        <line x1="12" y1="22" x2="9.5" y2="19.5" />
        <line x1="2" y1="12" x2="4.5" y2="9.5" />
        <line x1="2" y1="12" x2="4.5" y2="14.5" />
        <line x1="22" y1="12" x2="19.5" y2="9.5" />
        <line x1="22" y1="12" x2="19.5" y2="14.5" />
      </svg>
    ),
  },
  {
    value: 'sakura',
    label: 'visualEffectSakura',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <g transform="translate(12,12)">
          {[0, 72, 144, 216, 288].map((deg) => (
            <ellipse
              key={deg}
              cx="0"
              cy="-6"
              rx="2.8"
              ry="5.5"
              transform={`rotate(${deg})`}
              opacity="0.85"
            />
          ))}
          <circle cx="0" cy="0" r="2" opacity="0.6" />
        </g>
      </svg>
    ),
  },
  {
    value: 'rain',
    label: 'visualEffectRain',
    icon: (
      <svg {...STROKE}>
        <line x1="8" y1="3" x2="6.5" y2="10" />
        <line x1="14" y1="2" x2="12.5" y2="9" />
        <line x1="20" y1="4" x2="18.5" y2="11" />
        <line x1="5" y1="12" x2="3.5" y2="19" />
        <line x1="11" y1="11" x2="9.5" y2="18" />
        <line x1="17" y1="13" x2="15.5" y2="20" />
      </svg>
    ),
  },
];

export interface VisualEffectChoicesProps {
  value: VisualEffect;
  onChange: (value: VisualEffect) => void;
  t: (key: TranslationKey) => string;
  className?: string;
}

/** The effect buttons under the Visual effects row; Off is the row's switch. */
export function VisualEffectChoices({
  value,
  onChange,
  t,
  className = '',
}: VisualEffectChoicesProps) {
  return (
    <SegmentedControl
      semantics="pressed"
      className={className}
      options={OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.label),
        icon: option.icon,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
