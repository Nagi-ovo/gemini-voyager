import * as React from 'react';

import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '../../lib/utils';

/** The one field face for popup text inputs and selects: 8px radius, quiet border, focus-visible ring. */
const fieldVariants = cva(
  'border-border bg-background text-foreground placeholder:text-muted-foreground/70 min-w-0 rounded-lg border transition-[border-color,box-shadow] duration-150 focus-visible:border-ring/70 focus-visible:ring-ring/30 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      size: {
        default: 'h-8 px-2.5 text-[13px]',
        sm: 'h-7 px-2 text-xs',
        lg: 'h-9 px-3 text-sm',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

type FieldSize = VariantProps<typeof fieldVariants>['size'];

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: FieldSize;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        fieldVariants({ size }),
        // A number field types its value; the native spinner would double the slider beside it.
        type === 'number' &&
          '[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: FieldSize;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(fieldVariants({ size }), 'cursor-pointer pe-1', className)}
      {...props}
    />
  ),
);
Select.displayName = 'Select';

export { Input, Select, fieldVariants };
