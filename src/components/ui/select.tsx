import * as React from 'react';

import { cn } from '../../lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-lg border border-input bg-card px-3 py-2 text-sm transition-colors shadow-sm',
          'hover:border-ring/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = 'Select';

export { Select };
