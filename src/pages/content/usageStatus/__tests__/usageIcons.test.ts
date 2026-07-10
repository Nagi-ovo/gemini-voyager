import { describe, expect, it } from 'vitest';

import { USAGE_REFRESH_ICON } from '../icons';

describe('usage status icons', () => {
  it('uses the compact refresh geometry from issue #809', () => {
    const host = document.createElement('div');
    host.innerHTML = USAGE_REFRESH_ICON;

    const svg = host.querySelector('svg');
    const path = host.querySelector('path');

    expect(svg?.getAttribute('viewBox')).toBe('0 -960 680 680');
    expect(path?.getAttribute('d')).toMatch(/^m334-295c-89/);
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
