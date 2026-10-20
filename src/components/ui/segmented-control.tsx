import * as React from 'react';

import { cn } from '../../lib/utils';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: React.ReactNode;
  readonly icon?: React.ReactNode;
  readonly disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /**
   * `radio`: a radiogroup with one Tab stop and arrow keys, for a setting that
   * always has exactly one value. `pressed`: plain toggle buttons that each
   * report `aria-pressed`, for a choice shown beside its own on/off control.
   */
  readonly semantics?: 'radio' | 'pressed';
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
  readonly className?: string;
}

/**
 * The popup's one segmented control, matching the in-page folder settings:
 * a quiet track, 12px/500 labels, and a neutral raised face on the chosen
 * segment rather than an accent fill. Each segment paints its own face, so
 * there is no sliding indicator to position and RTL mirrors for free.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  semantics = 'radio',
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);
  const radio = semantics === 'radio';
  const enabled = options.map((option) => !option.disabled);
  // One Tab stop: the checked radio, or the first enabled one when the checked one is not.
  const checkedIndex = options.findIndex((option) => option.value === value);
  const tabStop = enabled[checkedIndex] ? checkedIndex : enabled.indexOf(true);

  // Arrows move the choice to the next enabled radio and wrap, as native radios do.
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, from: number) => {
    const rtl = event.currentTarget.closest('[dir]')?.getAttribute('dir') === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
    let step = 0;
    if (event.key === forward || event.key === 'ArrowDown') step = 1;
    else if (event.key === backward || event.key === 'ArrowUp') step = -1;
    else if (event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const order =
      step === 0
        ? options.map((_, index) => index)
        : options.map(
            (_, offset) => (from + step * (offset + 1) + options.length * 2) % options.length,
          );
    const candidates = order.filter((index) => enabled[index]);
    const next = event.key === 'End' ? candidates[candidates.length - 1] : candidates[0];
    if (next === undefined || next === from) return;
    buttons.current[next]?.focus();
    onChange(options[next].value);
  };

  return (
    <div
      role={radio ? 'radiogroup' : 'group'}
      {...aria}
      className={cn('bg-secondary flex items-stretch gap-0.5 rounded-[9px] p-0.5', className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role={radio ? 'radio' : undefined}
            aria-checked={radio ? selected : undefined}
            aria-pressed={radio ? undefined : selected}
            tabIndex={radio ? (index === tabStop ? 0 : -1) : undefined}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={radio ? (event) => onKeyDown(event, index) : undefined}
            className={cn(
              'flex min-h-[26px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[7px] px-2 py-1 text-xs leading-[18px] font-medium transition-colors duration-150',
              'focus-visible:ring-ring/60 focus-visible:ring-2 focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-40',
              selected
                ? 'bg-segment-selected text-foreground shadow-[0_1px_3px_oklch(0_0_0/0.12)]'
                : 'text-muted-foreground enabled:hover:bg-foreground/5 enabled:hover:text-foreground',
            )}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
