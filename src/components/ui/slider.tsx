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
      e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>,
    ) => {
      const value = Number((e.target as HTMLInputElement).value);
      onValueCommit?.(value);
    };

    return (
      <input
        ref={ref}
        type="range"
        className={cn(
          'bg-secondary h-2 w-full cursor-pointer appearance-none rounded-lg',
          '[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110',
          '[&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-md',
          className,
        )}
        onInput={handleInput}
        onChange={handleInput}
        onMouseUp={handleCommit}
        onTouchEnd={handleCommit}
        {...props}
      />
    );
  },
);
Slider.displayName = 'Slider';

export { Slider };
