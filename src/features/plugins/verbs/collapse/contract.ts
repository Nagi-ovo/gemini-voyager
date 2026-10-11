import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'collapse',
  sinceEngine: 'next',
  semantic: [],
  params: {
    target: {
      type: 'semanticKey',
      required: true,
      allowedKeys: ['userTurn', 'assistantTurn', 'thinkingBlock'],
      description:
        'Semantic content key to collapse: userTurn, assistantTurn or thinkingBlock. Do not target content the host already collapses.',
    },
    maxPx: {
      type: 'number',
      required: false,
      description:
        'Collapsed height in pixels, from 80 to 2000; defaults to 320. Content must exceed this height by more than 16 pixels to get a toggle.',
    },
    startCollapsed: {
      type: 'boolean',
      required: false,
      description: 'Whether long content starts collapsed; defaults to true.',
    },
  },
  description:
    'Caps the visible height of long semantic content with an expand/collapse toggle outside the clipped element. Streaming content is measured incrementally, and an expanded element stays expanded while it survives host re-renders. Turning the plugin off restores its native layout.',
};
