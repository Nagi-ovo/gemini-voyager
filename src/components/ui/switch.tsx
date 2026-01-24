import * as React from 'react';

import { cn } from '../../lib/utils';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ className, ...props }, ref) => {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input ref={ref} type="checkbox" className="peer sr-only" {...props} />
      <div
        className={cn(
          'bg-input peer-focus:ring-ring peer h-6 w-11 rounded-full shadow-sm peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:outline-none',
          "after:border-border after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white",
          'peer-checked:bg-primary',
          className,
        )}
      ></div>
    </label>
  );
});
Switch.displayName = 'Switch';

export { Switch };
