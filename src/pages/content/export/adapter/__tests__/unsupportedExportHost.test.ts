import { describe, expect, it } from 'vitest';

import { resolveExportHost } from '../platformAdapters';

describe('export host isolation', () => {
  it('does not export a catalog site without an exporter using Gemini message rules', () => {
    expect(() => resolveExportHost('https://claude.ai/chat/123')).toThrow('unavailable');
  });

  it('resolves catalog page facts while preserving both existing exporters', () => {
    const deepseek = resolveExportHost('https://chat.deepseek.com/a/chat/s/123');
    expect(deepseek.id).toBe('catalog');
    expect(deepseek.adapter.site.label).toBe('DeepSeek');
    expect(deepseek.adapter.getUserSelectors()).toEqual([deepseek.adapter.site.selectors.userTurn]);
    expect(resolveExportHost('https://gemini.google.com/app/123').id).toBe('gemini');
    expect(resolveExportHost('https://chatgpt.com/c/123').id).toBe('chatgpt');
  });
});
