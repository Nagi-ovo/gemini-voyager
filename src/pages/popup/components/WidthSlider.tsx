import React, { useEffect, useRef, useState } from 'react';

import { Card } from '../../../components/ui/card';
import { Slider } from '../../../components/ui/slider';
import { SliderRow } from '../../../components/ui/slider-row';
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
    <Card className="p-4">
      <SliderRow
        variant="card"
        label={label}
        value={formatValue(draftValue)}
        minLabel={narrowLabel}
        maxLabel={wideLabel}
        expanded={hasToggle ? isExpanded : undefined}
        leading={
          hasToggle && (
            <Switch
              size="sm"
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
              aria-label={label}
            />
          )
        }
        footer={children}
      >
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
      </SliderRow>
    </Card>
  );
}
