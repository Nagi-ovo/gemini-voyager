import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'codeCollapse',
  sinceEngine: '1.8.0',
  semantic: ['assistantTurn', 'codeBlock'],
  params: {
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
    "Collapses long code blocks in replies with Gemini's code block collapse: a toggle per block plus expand all / collapse all, with the code and the host's copy controls left intact. Long blocks start collapsed, the user's choice holds while a reply streams, and turning the plugin off restores every block. A block another code collapse already holds is left to it. On Gemini it is Gemini's own collapse and ignores params: every code block on the page, long ones expanded until the user folds them, no expand all bar, diagram blocks skipped.",
};
