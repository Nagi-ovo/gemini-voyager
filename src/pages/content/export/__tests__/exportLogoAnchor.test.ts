import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveExportLogoAnchor } from '../exportLogoAnchor';

afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('resolveExportLogoAnchor', () => {
  it('returns an already-present logo without waiting', async () => {
    document.body.innerHTML = '<div data-test-id="logo"></div>';
    const waitForElement = vi.fn();

    const logo = await resolveExportLogoAnchor(waitForElement);

    expect(logo).toBe(document.querySelector('[data-test-id="logo"]'));
    expect(waitForElement).not.toHaveBeenCalled();
  });

  it('short-circuits to null on the logoless lr26 layout (no timeout wait)', async () => {
    document.body.className = 'lr26 theme-host';
    const waitForElement = vi.fn();

    const logo = await resolveExportLogoAnchor(waitForElement);

    expect(logo).toBeNull();
    // The whole point of the fix: we must NOT wait out the timeout here.
    expect(waitForElement).not.toHaveBeenCalled();
  });

  it('falls back to waiting on older layouts without a logo', async () => {
    const fakeLogo = document.createElement('div');
    const waitForElement = vi.fn().mockResolvedValue(fakeLogo);

    const logo = await resolveExportLogoAnchor(waitForElement);

    expect(waitForElement).toHaveBeenCalledWith('[data-test-id="logo"]', 6000);
    expect(logo).toBe(fakeLogo);
  });

  it('tries the .logo selector when the primary wait resolves null', async () => {
    const fakeLogo = document.createElement('div');
    const waitForElement = vi
      .fn()
      .mockResolvedValueOnce(null) // [data-test-id="logo"]
      .mockResolvedValueOnce(fakeLogo); // .logo

    const logo = await resolveExportLogoAnchor(waitForElement);

    expect(waitForElement).toHaveBeenNthCalledWith(1, '[data-test-id="logo"]', 6000);
    expect(waitForElement).toHaveBeenNthCalledWith(2, '.logo', 2000);
    expect(logo).toBe(fakeLogo);
  });
});
