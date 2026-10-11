import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'vimInput',
  sinceEngine: '1.4.0',
  semantic: ['composer'],
  params: {
    composer: {
      type: 'selector',
      required: false,
      description:
        "Prompt input to attach Vim modal editing to; defaults to the site adapter's composer.",
    },
  },
  description: 'Vim-style modal editing and cursor navigation in the prompt composer.',
};
