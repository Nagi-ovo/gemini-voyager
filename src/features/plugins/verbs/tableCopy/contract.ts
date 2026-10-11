import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'tableCopy',
  sinceEngine: '1.8.0',
  semantic: ['assistantTurn'],
  params: {
    turn: {
      type: 'selector',
      required: false,
      description:
        "Reply elements whose tables get a copy toolbar; defaults to the site adapter's assistantTurn.",
    },
    table: {
      type: 'selector',
      required: false,
      description:
        "Tables inside a reply; defaults to table. Tables nested in another table or inside the site adapter's thinkingBlock are skipped.",
    },
  },
  description:
    'A toolbar above each table in a reply copies it as Markdown (formulas kept as LaTeX, the same table conversation export writes) or as TSV for spreadsheets. The table stays untouched; turning the plugin off removes the toolbars.',
};
