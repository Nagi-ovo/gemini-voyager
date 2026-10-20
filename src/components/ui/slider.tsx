import * as React from 'react';

import { cn } from '../../lib/utils';

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onValueChange?: (value: number) => void;
  onValueCommit?: (value: number) => void;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, onValueChange, onValueCommit, ...props }, ref) => {
    const handleInput = (
      e: React.ChangeEvent<HTMLInputElement> | React.FormEvent<HTMLInputElement>,
    ) => {
      const value = Number((e.target as HTMLInputElement).value);
      onValueChange?.(value);
    };

    const handleCommit = (
      e:
        | React.MouseEvent<HTMLInputElement>
        | React.TouchEvent<HTMLInputElement>
        | React.KeyboardEvent<HTMLInputElement>,
    ) => {
      const value = Number((e.target as HTMLInputElement).value);
      onValueCommit?.(value);
    };

    const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        ![
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Home',
          'End',
          'PageUp',
          'PageDown',
        ].includes(e.key)
      ) {
        return;
      }
      handleCommit(e);
    };

    return (
      <input
        ref={ref}
        type="range"
        className={cn(
          'bg-foreground/15 h-1.5 w-full cursor-pointer appearance-none rounded-full focus-visible:outline-none disabled:cursor-not-allowed',
          '[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:shadow-[0_1px_2px_oklch(0_0_0/0.3)] focus-visible:[&::-webkit-slider-thumb]:ring-ring/50 focus-visible:[&::-webkit-slider-thumb]:ring-2',
          '[&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-card [&::-moz-range-thumb]:shadow-[0_1px_2px_oklch(0_0_0/0.3)]',
          className,
        )}
        onInput={handleInput}
        onChange={handleInput}
        onMouseUp={handleCommit}
        onTouchEnd={handleCommit}
        onKeyUp={handleKeyUp}
        {...props}
      />
    );
  },
);
Slider.displayName = 'Slider';

export { Slider };
