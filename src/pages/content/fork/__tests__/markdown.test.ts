import { describe, expect, it } from 'vitest';

import { buildForkMarkdown } from '../markdown';

describe('buildForkMarkdown', () => {
  it('should include all prior assistant responses and drop the last one', () => {
    const markdown = buildForkMarkdown(
      'Fork Test',
      [
        { user: 'u1', assistant: 'a1' },
        { user: 'u2', assistant: 'a2' },
      ],
      true,
    );

    expect(markdown).toContain('# Fork Test');
    expect(markdown).toContain('u1');
    expect(markdown).toContain('a1');
    expect(markdown).toContain('u2');
    expect(markdown).not.toContain('a2');
  });

  it('should keep the last assistant when dropLastAssistant is false', () => {
    const markdown = buildForkMarkdown('Fork Test', [{ user: 'u1', assistant: 'a1' }], false);

    expect(markdown).toContain('a1');
  });
});
