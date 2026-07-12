import { TextDecoder, TextEncoder } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import manifestChrome from '../../../../manifest.json';

type ManifestPermissions = {
  permissions?: string[];
  optional_permissions?: string[];
  browser_specific_settings?: {
    safari?: { strict_min_version?: string };
  };
};

let chromeManifest: ManifestPermissions;
let firefoxManifest: ManifestPermissions;
let safariManifest: ManifestPermissions;

const originalTextEncoder = globalThis.TextEncoder;
const originalTextDecoder = globalThis.TextDecoder;
const originalUint8Array = globalThis.Uint8Array;

beforeAll(async () => {
  // Vite's esbuild dependency requires the host-realm Uint8Array returned by
  // Node's encoder. jsdom's encoder comes from a different realm.
  Object.defineProperty(globalThis, 'TextEncoder', {
    value: TextEncoder,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'TextDecoder', {
    value: TextDecoder,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'Uint8Array', {
    value: new TextEncoder().encode('').constructor,
    configurable: true,
  });

  const [chromeConfig, firefoxConfig, safariConfig] = await Promise.all([
    import('../../../../vite.config.chrome'),
    import('../../../../vite.config.firefox'),
    import('../../../../vite.config.safari'),
  ]);
  chromeManifest = chromeConfig.chromeManifest as unknown as ManifestPermissions;
  firefoxManifest = firefoxConfig.firefoxManifest as unknown as ManifestPermissions;
  safariManifest = safariConfig.safariManifest as unknown as ManifestPermissions;
});

afterAll(() => {
  Object.defineProperty(globalThis, 'TextEncoder', {
    value: originalTextEncoder,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'TextDecoder', {
    value: originalTextDecoder,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'Uint8Array', {
    value: originalUint8Array,
    configurable: true,
  });
});

describe('manifest permissions', () => {
  it('keeps all-site access optional', () => {
    expect(manifestChrome.host_permissions).not.toContain('<all_urls>');
    expect(manifestChrome.optional_host_permissions).toEqual(['<all_urls>']);
  });

  it('keeps unlimitedStorage out of the shared manifest', () => {
    expect(manifestChrome.permissions).not.toContain('unlimitedStorage');
    expect(manifestChrome.optional_permissions).not.toContain('unlimitedStorage');
  });

  it('adds warning-free required unlimitedStorage to Chrome and Edge builds', () => {
    // Edge packages are generated from the Chrome build manifest.
    expect(chromeManifest.permissions).toContain('unlimitedStorage');
    expect(chromeManifest.optional_permissions).not.toContain('unlimitedStorage');
  });

  it('adds optional unlimitedStorage to Safari without restoring notifications', () => {
    expect(safariManifest.permissions).not.toContain('unlimitedStorage');
    expect(safariManifest.optional_permissions).toContain('unlimitedStorage');
    expect(safariManifest.optional_permissions).not.toContain('notifications');
  });

  it('adds required unlimitedStorage to Firefox without making it optional', () => {
    expect(firefoxManifest.permissions).toContain('unlimitedStorage');
    expect(firefoxManifest.optional_permissions).not.toContain('unlimitedStorage');
  });

  it('declares Safari 15.4 as the Manifest V3 compatibility floor', () => {
    expect(safariManifest.browser_specific_settings?.safari?.strict_min_version).toBe('15.4');
  });
});
