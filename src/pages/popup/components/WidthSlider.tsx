import React from 'react';

import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Slider } from '../../../components/ui/slider';
import { Switch } from '../../../components/ui/switch';

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
  /** When provided, renders a toggle switch in the title row */
  enabled?: boolean;
  /** Callback when the toggle is flipped */
  onToggle?: (enabled: boolean) => void;
}

/**
 * Reusable width adjustment slider component
 * Used for chat width, edit input width, and sidebar width settings
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
  enabled,
  onToggle,
}: WidthSliderProps) {
  const formatValue = valueFormatter ?? ((v: number) => `${v}%`);
  const hasToggle = enabled !== undefined && onToggle !== undefined;
  const isExpanded = !hasToggle || enabled;

  return (
    <Card className="p-4 transition-shadow hover:shadow-lg">
      <div className="mb-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {hasToggle && (
            <Switch
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="scale-75"
            />
          )}
          <CardTitle className="text-xs uppercase">{label}</CardTitle>
        </div>
        <span
          className="text-primary bg-primary/10 rounded-md px-2.5 py-1 text-sm font-bold shadow-sm transition-opacity duration-200"
          style={{ opacity: isExpanded ? 1 : 0 }}
        >
          {formatValue(value)}
        </span>
      </div>
      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{
          maxHeight: isExpanded ? '120px' : '0px',
          opacity: isExpanded ? 1 : 0,
          marginTop: isExpanded ? '12px' : '0px',
        }}
      >
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
      </div>
    </Card>
  );
}
