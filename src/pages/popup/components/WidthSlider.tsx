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
    <Card className="p-4 transition-shadow hover:shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <CardTitle className="text-xs uppercase">{label}</CardTitle>
        <span className="text-primary bg-primary/10 rounded-md px-2.5 py-1 text-sm font-bold shadow-sm">
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
          <div className="text-muted-foreground mt-3 flex items-center justify-between text-xs font-medium">
            <span>{narrowLabel}</span>
            <span>{wideLabel}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
