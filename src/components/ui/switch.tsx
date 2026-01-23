import * as React from 'react';

import { cn } from '../../lib/utils';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(({ className, ...props }, ref) => {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input ref={ref} type="checkbox" className="sr-only peer" {...props} />
      <div
        className={cn(
          'w-11 h-6 bg-input peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-ring peer-focus:ring-offset-2 rounded-full peer shadow-sm',
          "peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all",
          'peer-checked:bg-primary',
          className
        )}
      ></div>
    </label>
  );
});
Switch.displayName = 'Switch';

export { Switch };
