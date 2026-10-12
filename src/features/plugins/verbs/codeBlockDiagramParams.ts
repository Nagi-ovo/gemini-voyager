/**
 * Params shared by the code-block diagram primitives (`mermaid`, `echarts`,
 * `wavedrom`): where a site keeps its replies, code blocks, their source
 * text and language label, plus two opt-in additions to the panel. All
 * optional; defaults read the site adapter. Data only, like the contracts
 * that spread it.
 */
import type { PrimitiveParamSpec } from './contractTypes';

export const CODE_BLOCK_DIAGRAM_PARAMS: Readonly<Record<string, PrimitiveParamSpec>> = {
  turn: {
    type: 'selector',
    required: false,
    description:
      "Reply elements whose code blocks are rendered; defaults to the site adapter's assistantTurn.",
  },
  codeBlock: {
    type: 'selector',
    required: false,
    description:
      "One code block inside a reply. The diagram goes right before it, and it is hidden while the diagram shows. Defaults to the site adapter's codeBlock, else pre.",
  },
  code: {
    type: 'selector',
    required: false,
    description:
      'Element inside the code block holding the source text; defaults to code, else the block itself.',
  },
  codeLine: {
    type: 'selector',
    required: false,
    description:
      'Line elements inside the source element, joined with newlines, for hosts that render one element per line without newline characters.',
  },
  language: {
    type: 'selector',
    required: false,
    description:
      'Element inside the code block whose text is the language label; defaults to a language-* class on the source element or the block.',
  },
  copyButton: {
    type: 'boolean',
    required: false,
    sinceEngine: 'next',
    description:
      "Adds a Copy button to the diagram's toolbar that copies the block's source, for a host whose own copy button is inside the code block the diagram view hides. Default false.",
  },
  exportImage: {
    type: 'boolean',
    required: false,
    sinceEngine: 'next',
    description:
      "Lets Voyager's PNG and PDF export show the drawn diagram (Mermaid in its light theme) instead of the block's source; Markdown keeps the source, and a block still drawing or shown as code exports its source. Default false.",
  },
};
