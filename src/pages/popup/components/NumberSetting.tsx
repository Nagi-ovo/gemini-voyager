import { type ChangeEvent, useEffect, useState } from 'react';

import { Input } from '../../../components/ui/input';
import { sliderValueChipClass } from '../../../components/ui/slider-row';

interface NumberSettingProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}

/**
 * A popup field for an exact whole number, such as the precise path of a wide
 * plugin setting. A draft lets the person clear or overshoot while typing; valid
 * values apply immediately (and move a slider beside it), invalid ones clamp on blur.
 */
export function NumberSetting({ label, value, min, max, disabled, onChange }: NumberSettingProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const raw = event.target.value;
    setDraft(raw);
    if (raw.trim() === '') return;
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    const rounded = Math.round(next);
    if (rounded >= min && rounded <= max) onChange(rounded);
  };

  const handleBlur = (): void => {
    const next = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(next)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(next)));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={1}
      value={draft}
      disabled={disabled}
      inputMode="numeric"
      aria-label={label}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      size="sm"
      className={`${sliderValueChipClass} hover:border-border h-6 w-16 border-transparent text-end`}
    />
  );
}
