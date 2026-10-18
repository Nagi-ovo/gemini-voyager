import { describe, expect, it, vi } from 'vitest';

import { type OpContext, createOpContext } from './opContext';

vi.mock('@/core/utils/extensionContext', () => ({ hasValidExtensionContext: () => true }));

const ID = '6a1b2c3d-0000-4000-8000-00000000abcd';
const PROJECT = `g-p-${'a1'.repeat(16)}`;

function contextAt(start: string): { ctx: OpContext; moveTo(path: string): void } {
  let pathname = start;
  const ctx = createOpContext({
    taskId: 't-1',
    op: 'composer.send',
    grant: { deadline: Number.MAX_SAFE_INTEGER, docNonce: 'n-1' },
    interactive: false,
    env: {
      now: () => 0,
      isHidden: () => false,
      challenge: () => null,
      hasExtensionContext: () => true,
      pathname: () => pathname,
    },
  });
  return { ctx, moveTo: (path) => void (pathname = path) };
}

describe('the op route guard', () => {
  it('keeps a follow-up going when /c/<id> is rewritten to its project route', () => {
    const { ctx, moveTo } = contextAt(`/c/${ID}`);
    moveTo(`/g/${PROJECT}-lun-wen/c/${ID}`);

    expect(() => ctx.guard()).not.toThrow();
    expect(ctx.terminated).toBeNull();
  });

  it('still stops when the page moves to another conversation', () => {
    const { ctx, moveTo } = contextAt(`/c/${ID}`);
    moveTo(`/g/${PROJECT}-lun-wen/c/7b2c3d4e-0000-4000-8000-00000000beef`);

    expect(() => ctx.guard()).toThrow();
    expect(ctx.terminated).toMatchObject({
      code: 'cancelled',
      details: { reason: 'route-changed' },
    });
  });

  it('still stops when a new chat gets its provisional id before the op ended its page events', () => {
    const { ctx, moveTo } = contextAt('/');
    moveTo('/c/local-chatgpt%3A0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f');

    expect(() => ctx.guard()).toThrow();
  });
});
