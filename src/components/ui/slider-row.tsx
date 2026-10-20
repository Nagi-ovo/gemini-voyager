import * as React from 'react';

import { cn } from '../../lib/utils';

/** The value chip beside a slider's label; an editable number field wears the same face. */
export const sliderValueChipClass =
  'bg-secondary text-foreground inline-flex h-6 min-w-10 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-medium tabular-nums';

export interface SliderRowProps {
  /** The slider's name; `labelId` lets the slider point at it with `aria-labelledby`. */
  readonly label: React.ReactNode;
  readonly labelId?: string;
  /** A string renders as the chip; a node (an editable field) replaces it. */
  readonly value: React.ReactNode;
  readonly hint?: React.ReactNode;
  readonly minLabel?: React.ReactNode;
  readonly maxLabel?: React.ReactNode;
  /** Before the label, such as the switch of a slider that can be turned off. */
  readonly leading?: React.ReactNode;
  /** `card`: the label is the card's title. `option`: a sub-option inside a plugin row. */
  readonly variant?: 'card' | 'option';
  /** Makes the row foldable: false folds the slider away and hides the value, leaving the label row. */
  readonly expanded?: boolean;
  /** The slider itself. */
  readonly children: React.ReactNode;
  /** Shown under the end labels while expanded. */
  readonly footer?: React.ReactNode;
  readonly className?: string;
  readonly title?: string;
}

/**
 * One labelled slider in the popup: label and value chip on a row, an optional
 * hint, the slider, then its two end labels. Callers keep their own draft and
 * commit logic and hand the slider in as `children`.
 */
export function SliderRow({
  label,
  labelId,
  value,
  hint,
  minLabel,
  maxLabel,
  leading,
  variant = 'option',
  expanded,
  children,
  footer,
  className,
  title,
}: SliderRowProps) {
  const foldable = expanded !== undefined;
  const open = expanded !== false;
  return (
    <div className={className} title={title}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {leading}
          <span
            id={labelId}
            className={cn(
              'min-w-0 truncate',
              variant === 'card'
                ? 'text-foreground/80 text-[13px] font-semibold'
                : 'text-foreground/80 text-xs',
            )}
          >
            {label}
          </span>
        </div>
        <div
          className="shrink-0 transition-opacity duration-150"
          style={{ opacity: open ? 1 : 0 }}
          aria-hidden={open ? undefined : true}
        >
          {typeof value === 'string' || typeof value === 'number' ? (
            <span className={sliderValueChipClass}>{value}</span>
          ) : (
            value
          )}
        </div>
      </div>
      <div
        className={
          foldable
            ? 'overflow-hidden transition-[max-height,opacity,margin] duration-200 ease-out motion-reduce:transition-none'
            : 'mt-1.5'
        }
        style={
          foldable
            ? {
                maxHeight: open ? (footer ? '240px' : '120px') : '0px',
                opacity: open ? 1 : 0,
                marginTop: open ? '6px' : '0px',
              }
            : undefined
        }
      >
        {hint && <p className="text-muted-foreground mb-2 text-[11px] leading-snug">{hint}</p>}
        <div className="flex h-4 items-center px-0.5">{children}</div>
        {(minLabel || maxLabel) && (
          <div className="text-muted-foreground mt-1.5 flex items-center justify-between gap-2 text-[11px]">
            <span>{minLabel}</span>
            <span>{maxLabel}</span>
          </div>
        )}
        {footer}
      </div>
    </div>
  );
}
