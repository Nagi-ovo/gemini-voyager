import React from 'react';

import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Slider } from '../../../components/ui/slider';

interface WidthSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  narrowLabel: string;
  wideLabel: string;
  onChange: (value: number) => void;
  onChangeComplete?: (value: number) => void;
}

/**
 * Reusable width adjustment slider component
 * Used for chat width and edit input width settings
 */
export default function WidthSlider({
  label,
  value,
  min,
  max,
  step,
  narrowLabel,
  wideLabel,
  onChange,
  onChangeComplete,
}: WidthSliderProps) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-3">
        <CardTitle>{label}</CardTitle>
        <span className="text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
          {value}px
        </span>
      </div>
      <CardContent className="p-0">
        <div className="px-1">
          <Slider
            min={min}
            max={max}
            step={step}
            value={value}
            onValueChange={onChange}
            onValueCommit={onChangeComplete}
          />
          <div className="flex justify-between items-center mt-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{narrowLabel}</span>
            <span>{wideLabel}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
