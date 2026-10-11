import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'counterBadge',
  sinceEngine: '1.8.0',
  // The key comes from `params.target`; a composer badge also uses composerRoot when the site has one.
  semantic: [],
  params: {
    target: {
      type: 'semanticKey',
      required: true,
      allowedKeys: ['composer', 'assistantTurn'],
      description:
        'What is counted: "composer" (the draft, one badge above the composer) or "assistantTurn" (one badge at the end of each reply).',
    },
    metric: {
      type: 'string',
      required: false,
      description:
        'What the badge counts: "chars" (default; Unicode code points without line breaks), "words" (whitespace-separated words, each CJK character one word), "cjkChars" (Han, kana and Hangul characters only) or "lines".',
    },
  },
  description:
    'A small read-only badge with a live count of the composer draft or of each assistant reply. The badge is pointer-transparent and outside the text, so copying and export never include it; turning the plugin off removes every badge.',
};
