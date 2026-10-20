/**
 * The one look of a plugin verb's small icon button (copy, table copy, code
 * collapse, long-message collapse), so the buttons in one reply read as a set
 * on every site: borderless, 28px square, 8px corners, the host's text colour,
 * a `currentColor` wash on hover and the accent as the focus ring. Layout
 * (margins, alignment) stays with each verb.
 *
 * `selectors` name the button: `button` inside a verb's shadow root, or `gv-`
 * classes in page CSS. A page rule cannot assume the host resets buttons, so
 * the look names every property a UA or host button style would set.
 */
export function iconButtonCss(...selectors: readonly string[]): string {
  const each = (suffix: string): string => selectors.map((s) => `${s}${suffix}`).join(', ');
  return `
${each('')} {
  box-sizing: border-box;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  opacity: 0.72;
  cursor: pointer;
  transition: background-color 160ms ease, opacity 160ms ease;
}
${each(':focus-visible')} {
  opacity: 1;
  outline: 2px solid var(--gv-pm-brand, var(--gv-pm-brand-default, oklch(0.601 0.1 140)));
  outline-offset: 2px;
}
${each(':disabled')} { opacity: 0.4; cursor: default; }
${each(' svg')} { width: 16px; height: 16px; flex: none; pointer-events: none; }
@media (hover: hover) {
  ${each(':hover:not(:disabled)')} {
    opacity: 1;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
}
@media (prefers-reduced-motion: reduce) {
  ${each('')} { transition: none; }
}`;
}
