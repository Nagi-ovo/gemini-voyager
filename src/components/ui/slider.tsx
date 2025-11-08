import * as React from "react";

import { cn } from "../../lib/utils";

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onValueChange?: (value: number) => void;
  onValueCommit?: (value: number) => void;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, onValueChange, onValueCommit, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="range"
        className={cn(
          "w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer",
          "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110",
          "[&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-md",
          className
        )}
        onChange={(e) => onValueChange?.(Number(e.target.value))}
        onMouseUp={(e) => onValueCommit?.(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onValueCommit?.(Number((e.target as HTMLInputElement).value))}
        {...props}
      />
    );
  }
);
Slider.displayName = "Slider";

export { Slider };
