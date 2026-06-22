import { describe, expect, it } from 'vitest';

import { validateManifest } from '../manifest/validate';
import { BUILTIN_PLUGINS } from './index';

describe('BUILTIN_PLUGINS', () => {
  it('every builtin manifest passes validation', () => {
    for (const m of BUILTIN_PLUGINS) {
      expect(validateManifest(m).success).toBe(true);
    }
  });

  it('includes the formula-copy native function plugin scoped to Claude/ChatGPT', () => {
    const fc = BUILTIN_PLUGINS.find((m) => m.id === 'voyager.formula-copy');
    expect(fc).toBeDefined();
    expect(fc?.matches).toEqual([
      'https://claude.ai/*',
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
    ]);
    // No declarative contributions — its behaviour comes from a native handler.
    expect(fc?.contributes.styles ?? []).toEqual([]);
    expect(fc?.contributes.domOps ?? []).toEqual([]);
    expect(fc?.i18n?.zh?.name).toBe('公式复制');
    expect(fc?.i18n?.ja?.description).toContain('LaTeX');
  });

  it('includes the Claude timeline native function plugin', () => {
    const timeline = BUILTIN_PLUGINS.find((m) => m.id === 'voyager.claude-timeline');
    expect(timeline).toBeDefined();
    expect(timeline?.matches).toEqual(['https://claude.ai/*']);
    expect(timeline?.contributes.styles ?? []).toEqual([]);
    expect(timeline?.contributes.domOps ?? []).toEqual([]);
    expect(timeline?.i18n?.zh?.name).toBe('Claude · 时间线');
  });
});
