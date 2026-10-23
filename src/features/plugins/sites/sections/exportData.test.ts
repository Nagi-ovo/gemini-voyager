import { describe, expect, it } from 'vitest';

import deepseek from '../../catalog/sites/deepseek/site.json';
import { isSameSiteAdapter } from '../../remote/siteOverride';
import { siteAdapterToData, validateSiteAdapterData } from '../siteAdapterData';

describe('site conversation export data', () => {
  it.each(['mounted', 'virtual'] as const)(
    'preserves %s page facts through publishing and caching',
    (read) => {
      const config = {
        version: 1,
        read,
        title: 'h1',
        generating: '[data-generating]',
        messageKey: 'data-message-id',
      };
      const result = validateSiteAdapterData({ ...deepseek, export: config });
      if (!result.success) throw new Error(JSON.stringify(result.error));
      expect(result.data.export).toEqual(config);
      const serialized = JSON.parse(JSON.stringify(siteAdapterToData(result.data)));
      expect(validateSiteAdapterData(serialized)).toEqual(result);
      expect(isSameSiteAdapter(result.data, { ...result.data, export: { version: 1, read } })).toBe(
        false,
      );
      expect(
        isSameSiteAdapter(result.data, {
          ...result.data,
          export: { ...result.data.export!, messageKey: 'data-other-id' },
        }),
      ).toBe(false);
    },
  );

  it('rejects virtual reads without a message key while permitting mounted snapshots', () => {
    const virtual = validateSiteAdapterData({
      ...deepseek,
      export: { version: 1, read: 'virtual' },
    });
    expect(virtual.success).toBe(false);
    if (!virtual.success)
      expect(virtual.error.map((issue) => issue.path)).toEqual(['export.messageKey']);
    const mounted = validateSiteAdapterData({
      ...deepseek,
      export: { version: 1, read: 'mounted' },
    });
    expect(mounted.success).toBe(true);
    if (mounted.success) expect(mounted.data.export).toEqual({ version: 1, read: 'mounted' });
  });

  it.each([
    [{ version: 2, read: 'virtual', messageKey: 'data-id' }, 'export.version'],
    [{ version: 1, read: 'network' }, 'export.read'],
    [{ version: 1, read: 'mounted', title: '[' }, 'export.title'],
    [{ version: 1, read: 'mounted', generating: '' }, 'export.generating'],
  ])('refuses malformed page facts %j', (config, path) => {
    const result = validateSiteAdapterData({ ...deepseek, export: config });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.map((issue) => issue.path)).toEqual([path]);
  });

  it.each(['', 'Data-Id', 'x],*', 'a'.repeat(65), 7])(
    'refuses an export message key that is not a plain attribute name: %j',
    (messageKey) => {
      const result = validateSiteAdapterData({
        ...deepseek,
        export: { version: 1, read: 'virtual', messageKey },
      });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.map((issue) => issue.path)).toEqual(['export.messageKey']);
    },
  );
});
