import React, { useEffect, useRef, useState } from 'react';

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
  children?: React.ReactNode;
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
  children,
}: WidthSliderProps) {
  const [draftValue, setDraftValue] = useState(value);
  const isInteracting = useRef(false);
  const formatValue = valueFormatter ?? ((v: number) => `${v}%`);
  const hasToggle = enabled !== undefined && onToggle !== undefined;
  const isExpanded = !hasToggle || enabled;

  useEffect(() => {
    if (!isInteracting.current) setDraftValue(value);
  }, [value]);

  const handleValueChange = (nextValue: number) => {
    isInteracting.current = true;
    setDraftValue(nextValue);
  };

  const handleValueCommit = (nextValue: number) => {
    onChange(nextValue);
    onChangeComplete?.(nextValue);
    isInteracting.current = false;
  };

  return (
    <Card className="p-4 transition-all hover:shadow-md">
      <div className="mb-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {hasToggle && (
            <Switch
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="scale-75"
              aria-label={label}
            />
          )}
          <CardTitle>{label}</CardTitle>
        </div>
        <span
          className="text-primary bg-primary/10 rounded-md px-2.5 py-1 text-sm font-bold shadow-sm transition-opacity duration-200"
          style={{ opacity: isExpanded ? 1 : 0 }}
        >
          {formatValue(draftValue)}
        </span>
      </div>
      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{
          maxHeight: isExpanded ? (children ? '240px' : '120px') : '0px',
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
              value={draftValue}
              onValueChange={handleValueChange}
              onValueCommit={handleValueCommit}
              aria-label={label}
              aria-valuetext={formatValue(draftValue)}
            />
            <div className="text-muted-foreground mt-3 flex items-center justify-between text-xs font-medium">
              <span>{narrowLabel}</span>
              <span>{wideLabel}</span>
            </div>
            {children}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}
