import type { CSSProperties } from 'react';

import { readableForeground } from '@/pages/content/platformTheme';

export type PopupBrandThemeStyle = CSSProperties & {
  '--primary': string;
  '--color-primary': string;
  '--primary-foreground': string;
  '--color-primary-foreground': string;
  '--ring': string;
  '--color-ring': string;
  '--accent': string;
  '--color-accent': string;
};

/**
 * Popup UI uses Tailwind v4 utilities (`text-primary`, `bg-primary`, etc.)
 * that read the generated `--color-*` tokens, while older local styles still
 * read the semantic `--primary`/`--ring` tokens directly. Keep both layers in
 * sync so platform branding reaches every control.
 */
export function createPopupBrandThemeStyle(brand: string): PopupBrandThemeStyle {
  const accent = `color-mix(in srgb, ${brand} 14%, transparent)`;
  // Keep text/icons on filled brand surfaces readable when the user picks a
  // light accent (white-on-pale would vanish) — mirrors the content script.
  const fg = readableForeground(brand);

  return {
    '--primary': brand,
    '--color-primary': brand,
    '--primary-foreground': fg,
    '--color-primary-foreground': fg,
    '--ring': brand,
    '--color-ring': brand,
    '--accent': accent,
    '--color-accent': accent,
  };
}
