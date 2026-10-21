import { describe, expect, it } from 'vitest';

import { validateManifest } from './validate';

function withTarget(target: unknown) {
  return {
    id: 'voyager.test',
    name: 'Test',
    version: '1.0.0',
    description: 'A test plugin',
    author: 'Me',
    category: 'render-fix',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: ['https://claude.ai/*'],
    contributes: { domOps: [{ op: 'addClass', target, className: 'gv-plugin-x' }] },
  };
}

describe('validateManifest css targets', () => {
  it('refuses a css target that does not parse, in either spelling', () => {
    const bare = validateManifest(withTarget('div >> p'));
    const ref = validateManifest(withTarget({ kind: 'css', selector: 'nav[aria-label]]' }));

    expect(bare.success).toBe(false);
    expect(ref.success).toBe(false);
    if (bare.success || ref.success) return;
    expect(bare.error).toContainEqual({
      path: 'contributes.domOps[0].target',
      message: 'selector does not parse as CSS',
    });
    expect(ref.error).toContainEqual({
      path: 'contributes.domOps[0].target.selector',
      message: 'selector does not parse as CSS',
    });
  });

  it('keeps accepting compound selectors and semantic keys', () => {
    expect(validateManifest(withTarget('nav[aria-label="Chats"] > a:not(.x)')).success).toBe(true);
    expect(validateManifest(withTarget({ kind: 'semantic', key: 'sidebar' })).success).toBe(true);
  });
});
