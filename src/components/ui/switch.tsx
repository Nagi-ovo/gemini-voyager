import * as React from 'react';

import { cn } from '../../lib/utils';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, disabled, ...props }, ref) => {
    return (
      <label
        className={cn(
          'relative inline-flex items-center',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        )}
      >
        <input ref={ref} type="checkbox" className="peer sr-only" disabled={disabled} {...props} />
        <div
          className={cn(
            'bg-input peer-focus:ring-ring peer h-6 w-11 rounded-full shadow-inner transition-colors duration-200 peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:outline-none',
            "after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-md after:transition-all after:duration-200 after:content-[''] peer-checked:after:translate-x-full",
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
