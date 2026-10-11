import { CODE_BLOCK_DIAGRAM_PARAMS } from '../codeBlockDiagramParams';
import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'mermaid',
  sinceEngine: '1.7.0',
  semantic: ['assistantTurn', 'codeBlock'],
  params: CODE_BLOCK_DIAGRAM_PARAMS,
  description:
    'Renders Mermaid code blocks in replies as diagrams with a Diagram / Code toggle, using the renderer Gemini uses. The code block stays in the page for copy and export; turning the plugin off removes the diagrams.',
};
