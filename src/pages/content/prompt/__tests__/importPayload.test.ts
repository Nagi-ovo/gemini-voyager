import { describe, expect, it } from 'vitest';

import { parsePromptImportPayload } from '../importPayload';

describe('parsePromptImportPayload', () => {
  it('returns empty for an exported payload with no prompt items', () => {
    expect(
      parsePromptImportPayload({
        format: 'gemini-voyager.prompts.v1',
        exportedAt: '2026-04-15T00:00:00.000Z',
        items: [],
      }),
    ).toEqual({ status: 'empty' });
  });

  it('accepts legacy payloads that only contain an items array', () => {
    expect(
      parsePromptImportPayload({
        items: [{ text: 'Use TypeScript', tags: ['Code', 'Code'] }],
      }),
    ).toEqual({
      status: 'ok',
      items: [{ text: 'Use TypeScript', tags: ['code'] }],
    });
  });

  it('returns invalid when all imported items are unusable', () => {
    expect(
      parsePromptImportPayload({
        format: 'gemini-voyager.prompts.v1',
        items: [{ text: '   ', tags: [] }],
      }),
    ).toEqual({ status: 'invalid' });
  });
});
