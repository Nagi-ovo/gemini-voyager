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
  valueFormatter?: (value: number) => string;
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
  valueFormatter,
  onChange,
  onChangeComplete,
}: WidthSliderProps) {
  const formatValue = valueFormatter ?? ((v: number) => `${v}%`);

  return (
    <Card className="p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <CardTitle className="text-xs uppercase">{label}</CardTitle>
        <span className="text-sm font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md shadow-sm">
          {formatValue(value)}
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
          <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground font-medium">
            <span>{narrowLabel}</span>
            <span>{wideLabel}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
