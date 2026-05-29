import { describe, expect, it } from 'vitest';

import { createPopupBrandThemeStyle } from './brandTheme';

describe('createPopupBrandThemeStyle', () => {
  it('keeps semantic and Tailwind color tokens in sync', () => {
    const style = createPopupBrandThemeStyle('#0ea5e9');

    expect(style['--primary']).toBe('#0ea5e9');
    expect(style['--color-primary']).toBe('#0ea5e9');
    expect(style['--primary-foreground']).toBe('#ffffff');
    expect(style['--color-primary-foreground']).toBe('#ffffff');
    expect(style['--ring']).toBe('#0ea5e9');
    expect(style['--color-ring']).toBe('#0ea5e9');
    expect(style['--accent']).toBe('color-mix(in srgb, #0ea5e9 14%, transparent)');
    expect(style['--color-accent']).toBe('color-mix(in srgb, #0ea5e9 14%, transparent)');
  });
});
