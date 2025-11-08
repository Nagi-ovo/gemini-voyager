import * as React from "react";

import { cn } from "../../lib/utils";

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-xs font-semibold text-slate-500 uppercase tracking-wide dark:text-slate-400",
      className
    )}
    {...props}
  />
));
Label.displayName = "Label";

export { Label };
