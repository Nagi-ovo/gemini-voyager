import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'quoteReply',
  sinceEngine: '1.8.0',
  semantic: ['assistantTurn', 'composer'],
  params: {},
  description:
    'Quote selected text wholly inside one assistant reply into the composer, preserving LaTeX and existing drafts. Excludes user turns and adapter thinking blocks; never sends.',
};
