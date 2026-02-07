import { describe, expect, it } from 'vitest';

import { isExtensionContextInvalidatedError } from '../extensionContext';

describe('extensionContext utils', () => {
  it('detects extension context invalidated errors', () => {
    expect(isExtensionContextInvalidatedError(new Error('Extension context invalidated.'))).toBe(
      true,
    );
    expect(
      isExtensionContextInvalidatedError({
        message: 'Uncaught Error: Extension context invalidated',
      }),
    ).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isExtensionContextInvalidatedError(new Error('Network timeout'))).toBe(false);
    expect(isExtensionContextInvalidatedError(null)).toBe(false);
    expect(isExtensionContextInvalidatedError(undefined)).toBe(false);
  });
});
