import type { PrimitiveContract } from '../contractTypes';

export const contract: PrimitiveContract = {
  name: 'tableCopy',
  sinceEngine: '1.8.0',
  semantic: ['assistantTurn'],
  params: {},
  description:
    'A toolbar above each table in a reply copies it as Markdown (formulas kept as LaTeX, the same table conversation export writes) or as TSV for spreadsheets. The table stays untouched; turning the plugin off removes the toolbars.',
};
