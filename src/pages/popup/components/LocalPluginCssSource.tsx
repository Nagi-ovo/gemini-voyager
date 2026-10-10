/** A plugin's stylesheets in full, scrollable and monospace: CSS is shown, never summarized. */
export function LocalPluginCssSource({ css, label }: { css: readonly string[]; label: string }) {
  if (css.length === 0) return null;
  return (
    <pre
      aria-label={label}
      data-testid="local-plugin-css"
      className="bg-background border-border/60 text-foreground mt-1 max-h-40 overflow-auto rounded border p-2 font-mono text-[10px] leading-snug break-all whitespace-pre-wrap"
    >
      {css.join('\n\n')}
    </pre>
  );
}
