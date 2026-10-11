import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'codeCollapse',
  sinceEngine: 'next',
  semantic: ['assistantTurn', 'codeBlock'],
  params: {
    codeBlock: {
      type: 'selector',
      required: false,
      description:
        "One code block inside a reply, the element that carries the collapsed state. Defaults to the site adapter's codeBlock.",
    },
    code: {
      type: 'selector',
      required: false,
      description:
        'Element inside the code block holding the code, measured for length and clipped while collapsed; defaults to pre, else the block itself.',
    },
    action: {
      type: 'selector',
      required: false,
      description:
        "A native control inside the code block, such as its copy button; the toggle joins that control's row. Without it the toggle goes at the end of the block.",
    },
  },
  description:
    "Collapses long code blocks in replies with Gemini's code block collapse: a toggle per block plus expand all / collapse all, with the code and the host's copy controls left intact. Long blocks start collapsed, the user's choice holds while a reply streams, and turning the plugin off restores every block.",
};
