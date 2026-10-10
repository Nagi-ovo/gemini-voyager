import { afterEach, describe, expect, it, vi } from 'vitest';

import { SCHEME_ATTR } from '@/pages/content/platformTheme/scheme';

import { isDarkMode } from '../folderColors';

function osPrefersDark(dark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: dark && query.includes('dark'), media: query })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute(SCHEME_ATTR);
});

describe('isDarkMode', () => {
  it('follows the page scheme over the OS preference', () => {
    osPrefersDark(false);
    document.documentElement.setAttribute(SCHEME_ATTR, 'dark');
    expect(isDarkMode()).toBe(true);

    osPrefersDark(true);
    document.documentElement.setAttribute(SCHEME_ATTR, 'light');
    expect(isDarkMode()).toBe(false);
  });

  it('falls back to the OS preference before a page scheme is set', () => {
    osPrefersDark(true);
    expect(isDarkMode()).toBe(true);
    osPrefersDark(false);
    expect(isDarkMode()).toBe(false);
  });
});
