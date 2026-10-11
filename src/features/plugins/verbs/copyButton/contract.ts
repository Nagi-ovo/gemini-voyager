import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'copyButton',
  sinceEngine: 'next',
  // The key comes from `params.target`, so the plugin lists it in `requires.semantic`.
  semantic: [],
  params: {
    target: {
      type: 'string',
      required: true,
      description:
        'Semantic key whose elements each get a copy button: userTurn, assistantTurn, thinkingBlock or codeBlock. List the same key in requires.semantic.',
    },
    format: {
      type: 'string',
      required: false,
      description: 'What the button copies: "text" (default), the element\'s visible plain text.',
    },
  },
  description:
    "A small copy button above each element the site adapter names by `target` (a thinking block, a message, a reply, a code block) copies that element's visible text, without Voyager's own controls inside it, and confirms with a toast. The element stays untouched; turning the plugin off removes the buttons.",
};
