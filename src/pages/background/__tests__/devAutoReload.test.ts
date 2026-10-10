import { describe, expect, it } from 'vitest';

import { parseDevBuildId, resolveDevBuildIdAction } from '../devAutoReload';

describe('dev auto-reload build id', () => {
  it('records the first id seen after a reload instead of reloading again', () => {
    expect(resolveDevBuildIdAction(undefined, '1759400000000')).toBe('record');
  });

  it('reloads only when a recorded id changes', () => {
    expect(resolveDevBuildIdAction('1759400000000', '1759400000000')).toBe('ignore');
    expect(resolveDevBuildIdAction('1759400000000', '1759400012345')).toBe('reload');
  });

  it('never acts on a missing or unreadable id file', () => {
    expect(resolveDevBuildIdAction(undefined, null)).toBe('ignore');
    expect(resolveDevBuildIdAction('1759400000000', null)).toBe('ignore');
    expect(parseDevBuildId('')).toBeNull();
    expect(parseDevBuildId('<!doctype html>')).toBeNull();
    expect(parseDevBuildId('1759400000000\n')).toBe('1759400000000');
  });
});
