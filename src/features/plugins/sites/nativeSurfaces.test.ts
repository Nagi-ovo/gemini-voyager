import { describe, expect, it } from 'vitest';

import manifest from '../../../../manifest.json';
import { NATIVE_SURFACE_MATCHES, isNativeSurfaceHost } from './nativeSurfaces';

describe('native surfaces', () => {
  it('are exactly the hosts the manifest injects the main content script into and grants', () => {
    const contentScript = manifest.content_scripts.find((script) =>
      script.js.includes('src/pages/content/index.tsx'),
    );
    expect([...(contentScript?.matches ?? [])].sort()).toEqual([...NATIVE_SURFACE_MATCHES].sort());
    for (const pattern of NATIVE_SURFACE_MATCHES) {
      expect(manifest.host_permissions).toContain(pattern);
    }
  });

  it('recognizes their hosts and nothing else', () => {
    expect(isNativeSurfaceHost('gemini.google.com')).toBe(true);
    expect(isNativeSurfaceHost('Business.Gemini.Google')).toBe(true);
    expect(isNativeSurfaceHost('aistudio.google.cn')).toBe(true);
    expect(isNativeSurfaceHost('claude.ai')).toBe(false);
    expect(isNativeSurfaceHost('google.com')).toBe(false);
  });
});
