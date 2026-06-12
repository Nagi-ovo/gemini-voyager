import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CHROME_WEB_STORE_EXTENSION_ID,
  EDGE_ADDONS_EXTENSION_ID,
  getExtensionRuntimeId,
  getVoyagerBuildTarget,
  getWebStoreRatingChannel,
  getModifierKey,
  isBrave,
  isChromeReleaseChannel,
  isChromeWebStoreInstall,
  isChromeWebStoreInstallOnEdge,
  isEdgeAddonsInstall,
  isEdgeAddonsBuild,
  isEdgeBuild,
  isEdgeReleaseChannel,
  isLocalEdgeBuildInstall,
  isMac,
  isSafari,
  shouldShowSafariUpdateReminder,
  supportsExtensionNotifications,
  supportsOptionalHostPermissions,
} from '../browser';

const ORIGINAL_RUNTIME_ID = chrome.runtime.id;
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0';
const EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Edg/120.0.0.0';
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0';

function setRuntimeId(id: string | undefined): void {
  Object.defineProperty(chrome.runtime, 'id', {
    value: id,
    configurable: true,
  });
}

function setUserAgent(ua: string, vendor = 'Google Inc.'): void {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  vi.spyOn(navigator, 'vendor', 'get').mockReturnValue(vendor);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setRuntimeId(ORIGINAL_RUNTIME_ID);
});

describe('supportsOptionalHostPermissions', () => {
  const setUA = (ua: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);

  it('returns false on Firefox below 128 (optional_host_permissions not honored)', () => {
    setUA('Mozilla/5.0 (Windows NT 10.0; rv:115.0) Gecko/20100101 Firefox/115.0');
    expect(supportsOptionalHostPermissions()).toBe(false);
    setUA('Mozilla/5.0 (Windows NT 10.0; rv:127.0) Gecko/20100101 Firefox/127.0');
    expect(supportsOptionalHostPermissions()).toBe(false);
  });

  it('returns true on Firefox 128+', () => {
    setUA('Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0');
    expect(supportsOptionalHostPermissions()).toBe(true);
    setUA('Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0');
    expect(supportsOptionalHostPermissions()).toBe(true);
  });

  it('returns true on Chromium browsers', () => {
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0');
    expect(supportsOptionalHostPermissions()).toBe(true);
  });
});

describe('Safari Update Reminder Control', () => {
  describe('shouldShowSafariUpdateReminder', () => {
    it('returns false when not running on Safari', () => {
      // Mock non-Safari browser
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      );
      vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Google Inc.');

      expect(shouldShowSafariUpdateReminder()).toBe(false);
    });

    it('returns false by default when running on Safari (feature disabled)', () => {
      // Mock Safari browser
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      );
      vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Apple Computer, Inc.');

      // By default, the environment variable should be false
      expect(shouldShowSafariUpdateReminder()).toBe(false);
    });

    it('isSafari correctly detects Safari browser', () => {
      // Mock Safari browser
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      );
      vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Apple Computer, Inc.');

      expect(isSafari()).toBe(true);
    });

    it('isSafari returns false for Chrome', () => {
      // Mock Chrome browser
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
      );
      vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Google Inc.');

      expect(isSafari()).toBe(false);
    });

    it('isSafari returns false for Firefox', () => {
      // Mock Firefox browser
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
      );
      vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('');

      expect(isSafari()).toBe(false);
    });
  });
});

describe('isBrave', () => {
  it('returns true when navigator.brave exists', () => {
    Object.defineProperty(navigator, 'brave', {
      value: { isBrave: () => Promise.resolve(true) },
      configurable: true,
    });
    expect(isBrave()).toBe(true);
    // Cleanup
    Object.defineProperty(navigator, 'brave', {
      value: undefined,
      configurable: true,
    });
    // Remove the property entirely after cleanup
    delete (navigator as unknown as Record<string, unknown>).brave;
  });

  it('returns false when navigator.brave does not exist', () => {
    expect(isBrave()).toBe(false);
  });
});

describe('isMac', () => {
  it('returns true for macOS platform', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(isMac()).toBe(true);
  });

  it('returns true for Mac ARM platform', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacARM');
    expect(isMac()).toBe(true);
  });

  it('returns false for Windows platform', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    );
    expect(isMac()).toBe(false);
  });

  it('returns false for Linux platform', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Linux x86_64');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0',
    );
    expect(isMac()).toBe(false);
  });

  it('falls back to userAgent when platform is empty', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
    );
    expect(isMac()).toBe(true);
  });
});

describe('supportsExtensionNotifications', () => {
  it('returns false on Safari even when the notifications API shape exists', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    );
    vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Apple Computer, Inc.');
    const originalNotifications = chrome.notifications;
    chrome.notifications = { create: vi.fn() } as unknown as typeof chrome.notifications;

    expect(supportsExtensionNotifications()).toBe(false);

    chrome.notifications = originalNotifications;
  });

  it('returns true on Chromium when notifications.create is available', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0',
    );
    vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Google Inc.');
    const originalNotifications = chrome.notifications;
    chrome.notifications = { create: vi.fn() } as unknown as typeof chrome.notifications;

    expect(supportsExtensionNotifications()).toBe(true);

    chrome.notifications = originalNotifications;
  });
});

describe('extension runtime id helpers', () => {
  it('reads the current extension runtime id', () => {
    setRuntimeId('local-dev-extension-id');

    expect(getExtensionRuntimeId()).toBe('local-dev-extension-id');
  });

  it('detects Edge Add-ons installs by runtime id', () => {
    setRuntimeId(EDGE_ADDONS_EXTENSION_ID);
    expect(isEdgeAddonsInstall()).toBe(true);
    expect(isEdgeAddonsBuild()).toBe(true);

    setRuntimeId(CHROME_WEB_STORE_EXTENSION_ID);
    expect(isEdgeAddonsInstall()).toBe(false);
    expect(isEdgeAddonsBuild()).toBe(false);
  });

  it('detects Chrome Web Store installs by runtime id', () => {
    setRuntimeId(CHROME_WEB_STORE_EXTENSION_ID);
    expect(isChromeWebStoreInstall()).toBe(true);

    setRuntimeId(EDGE_ADDONS_EXTENSION_ID);
    expect(isChromeWebStoreInstall()).toBe(false);
  });

  it('detects Chrome Web Store installs running in Edge', () => {
    setRuntimeId(CHROME_WEB_STORE_EXTENSION_ID);
    setUserAgent(EDGE_UA);
    expect(isChromeWebStoreInstallOnEdge()).toBe(true);

    setUserAgent(CHROME_UA);
    expect(isChromeWebStoreInstallOnEdge()).toBe(false);
  });
});

describe('getVoyagerBuildTarget', () => {
  it('defaults to chrome', () => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', '');

    expect(getVoyagerBuildTarget()).toBe('chrome');
  });

  it('falls back to chrome for invalid injected targets', () => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', 'opera');

    expect(getVoyagerBuildTarget()).toBe('chrome');
  });

  it('returns the injected build target for release channels', () => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', 'edge');
    expect(getVoyagerBuildTarget()).toBe('edge');

    vi.stubEnv('VOYAGER_BUILD_TARGET', 'firefox');
    expect(getVoyagerBuildTarget()).toBe('firefox');

    vi.stubEnv('VOYAGER_BUILD_TARGET', 'safari');
    expect(getVoyagerBuildTarget()).toBe('safari');
  });
});

describe('release channel helpers', () => {
  it('treats locally built Edge packages as Edge release channel', () => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', 'edge');
    setRuntimeId('local-dev-extension-id');

    expect(isEdgeReleaseChannel()).toBe(true);
    expect(isEdgeBuild()).toBe(true);
    expect(isLocalEdgeBuildInstall()).toBe(true);
  });

  it('treats published Edge Add-ons installs as Edge release channel', () => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', 'chrome');
    setRuntimeId(EDGE_ADDONS_EXTENSION_ID);

    expect(isEdgeReleaseChannel()).toBe(true);
    expect(isEdgeBuild()).toBe(true);
    expect(isLocalEdgeBuildInstall()).toBe(false);
  });

  it('keeps Chrome Web Store installs in Edge on the Chrome release channel', () => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', 'chrome');
    setRuntimeId(CHROME_WEB_STORE_EXTENSION_ID);
    setUserAgent(EDGE_UA);

    expect(isEdgeReleaseChannel()).toBe(false);
    expect(isEdgeBuild()).toBe(false);
    expect(isChromeReleaseChannel()).toBe(true);
    expect(isChromeWebStoreInstallOnEdge()).toBe(true);
  });
});

describe('getWebStoreRatingChannel', () => {
  it('uses the Chrome Web Store for Chrome release channel installs in Chrome', () => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', 'chrome');
    setRuntimeId(CHROME_WEB_STORE_EXTENSION_ID);
    setUserAgent(CHROME_UA);

    expect(getWebStoreRatingChannel()).toBe('chrome');
  });

  it('uses the Chrome Web Store for Chrome release channel installs in Edge', () => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', 'chrome');
    setRuntimeId(CHROME_WEB_STORE_EXTENSION_ID);
    setUserAgent(EDGE_UA);

    expect(getWebStoreRatingChannel()).toBe('chrome');
  });

  it('uses Edge Add-ons for locally built Edge packages', () => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', 'edge');
    setRuntimeId('local-dev-extension-id');
    setUserAgent(EDGE_UA);

    expect(getWebStoreRatingChannel()).toBe('edge');
  });

  it('uses Edge Add-ons for published Edge Add-ons installs', () => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', 'chrome');
    setRuntimeId(EDGE_ADDONS_EXTENSION_ID);
    setUserAgent(EDGE_UA);

    expect(getWebStoreRatingChannel()).toBe('edge');
  });

  it('does not show a Chrome/Edge rating prompt in Firefox', () => {
    vi.stubEnv('VOYAGER_BUILD_TARGET', 'chrome');
    setRuntimeId(CHROME_WEB_STORE_EXTENSION_ID);
    setUserAgent(FIREFOX_UA, '');

    expect(getWebStoreRatingChannel()).toBeNull();
  });
});

describe('getModifierKey', () => {
  it('returns ⌘ on macOS', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(getModifierKey()).toBe('⌘');
  });

  it('returns Ctrl on Windows', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    );
    expect(getModifierKey()).toBe('Ctrl');
  });

  it('returns Ctrl on Linux', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Linux x86_64');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0',
    );
    expect(getModifierKey()).toBe('Ctrl');
  });
});
