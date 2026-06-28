import { describe, expect, it } from 'vitest';

import { operationIdFrom, parseArgs } from './publish-edge.js';

describe('publish-edge script helpers', () => {
  it('parses zip path and notes', () => {
    expect(parseArgs(['voyager-edge-v1.5.3.zip', '--notes', 'release notes'])).toEqual({
      zipPath: 'voyager-edge-v1.5.3.zip',
      notes: 'release notes',
    });
  });

  it('extracts the operation id from a Location header', () => {
    const response = {
      headers: new Headers({
        location:
          'https://api.addons.microsoftedge.microsoft.com/v1/products/product/submissions/operations/op-123',
      }),
    };

    expect(operationIdFrom(response)).toBe('op-123');
  });

  it('throws when Location is missing', () => {
    const response = { headers: new Headers() };

    expect(() => operationIdFrom(response)).toThrow('Location operation ID');
  });
});
