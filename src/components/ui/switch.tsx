import * as React from 'react';

import { cn } from '../../lib/utils';

export interface SwitchProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  /** `sm` sits beside the 12px sub-option labels of a plugin row. */
  size?: 'default' | 'sm';
}

// The knob slides by `translate-x-full`, so each track is two knobs plus a 2px inset on each side.
const TRACK = {
  default: 'h-5 w-9 after:h-4 after:w-4',
  sm: 'h-[18px] w-8 after:h-3.5 after:w-3.5',
} as const;

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, disabled, size = 'default', ...props }, ref) => {
    return (
      <label
        className={cn(
          'relative inline-flex shrink-0 items-center',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        )}
      >
        <input ref={ref} type="checkbox" className="peer sr-only" disabled={disabled} {...props} />
        <div
          className={cn(
            'bg-foreground/20 peer relative rounded-full transition-colors duration-150',
            'peer-focus-visible:ring-ring peer-focus-visible:ring-offset-background peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2',
            TRACK[size],
            // Logical inset and a mirrored slide: under dir="rtl" the off knob sits on the right.
            "after:absolute after:start-[2px] after:top-[2px] after:rounded-full after:bg-white after:shadow-[0_1px_2px_oklch(0_0_0/0.28)] after:transition-transform after:duration-150 after:content-[''] peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full",
            'peer-checked:bg-primary',
            className,
          )}
        ></div>
      </label>
    );
  },
);
Switch.displayName = 'Switch';

export { Switch };
