import { describe, expect, it } from 'vitest';

import manifestChrome from '../../../../manifest.json';

describe('manifest permissions', () => {
  it('keeps all-site access optional', () => {
    expect(manifestChrome.host_permissions).not.toContain('<all_urls>');
    expect(manifestChrome.optional_host_permissions).toEqual(['<all_urls>']);
  });
});
