import { describe, expect, it } from 'vitest';

import { getInputMinCollapseToneClass } from '../Popup';

describe('getInputMinCollapseToneClass', () => {
  it('uses weakened style when input collapse is disabled', () => {
    const toneClass = getInputMinCollapseToneClass(false);

    expect(toneClass.row).toContain('opacity-50');
    expect(toneClass.label).not.toContain('group-hover:text-primary');
  });

  it('uses normal style when input collapse is enabled', () => {
    const toneClass = getInputMinCollapseToneClass(true);

    expect(toneClass.row).toContain('opacity-100');
    expect(toneClass.label).toContain('group-hover:text-primary');
  });
});
