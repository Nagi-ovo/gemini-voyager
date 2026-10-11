import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'userLatex',
  sinceEngine: '1.7.0',
  semantic: ['userTurn'],
  params: {
    turn: {
      type: 'selector',
      required: false,
      description:
        "User-message elements to render LaTeX in; defaults to the site adapter's userTurn.",
    },
  },
  description:
    'Renders $…$ and $$…$$ LaTeX the user typed in their own messages, keeping the source for export and copy; turning it off restores the text.',
};
