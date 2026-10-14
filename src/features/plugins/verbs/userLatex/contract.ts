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
    unit: {
      type: 'string',
      required: false,
      sinceEngine: '1.9.0',
      description:
        "What is rendered as one piece: 'leaf' (default) renders each text-only element inside a turn; 'turn' renders each matched turn element whole, child elements and Voyager's own markers included, for a turn selector that names one line of text.",
    },
  },
  description:
    'Renders $…$ and $$…$$ LaTeX the user typed in their own messages, keeping the source for export and copy; turning it off restores the text it rendered and nothing another renderer drew.',
};
