/**
 * Table text for the `tableCopy` primitive. Markdown is the conversation
 * exporter's own table (`extractTable`), and TSV reads the same rows, so a
 * copied table and an exported one never disagree.
 */
import type { ExportContentDialect } from '@/features/export/services/exportContentDialect';
import { escapeHtml, normalizeText } from '@/features/export/services/exportDomPolicy';
import {
  collectTableRows,
  extractTable,
  processInlineContent,
} from '@/features/export/services/exportRichText';
import { extractLatexSource, isDisplayMode } from '@/features/formulaCopy/formulaSource';

export type TableCopyFormat = 'markdown' | 'tsv';

/** Rendered formula roots whose source formula copy can read (Gemini data-math, KaTeX). */
const FORMULA_ROOT = '[data-math], .katex-display, .katex, ms-katex';
/** A leading character that makes a spreadsheet evaluate the pasted cell. */
const FORMULA_TRIGGER = /^\s*[=+\-@＝＋－＠]/u;
/** Plain numbers such as -12.5 or +3% stay numbers. */
const NUMBER = /^[+-]?\d[\d,.]*%?$/;

/**
 * Reads a rendered formula back to its LaTeX, the way formula copy does, so a
 * cell keeps `$x^2$`; KaTeX's glyph text alone would flatten it to `x2`.
 */
const renderedFormulaDialect: Pick<ExportContentDialect, 'extractInlineFormula'> = {
  extractInlineFormula(element, htmlParts, textParts) {
    if (!(element instanceof HTMLElement) || !element.matches(FORMULA_ROOT)) return undefined;
    const latex = extractLatexSource(element)?.trim();
    if (!latex) return undefined;
    const source = isDisplayMode(element) ? `$$${latex}$$` : `$${latex}$`;
    htmlParts.push(escapeHtml(source));
    textParts.push(source);
    return true;
  },
};

function tsvCell(text: string): string {
  // A pasted `=HYPERLINK(…)` from a reply must stay text in the spreadsheet.
  const value = FORMULA_TRIGGER.test(text) && !NUMBER.test(text) ? `'${text}` : text;
  return value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The table as text, read at the moment of the copy; empty when it has no rows. */
export function serializeTable(table: HTMLTableElement, format: TableCopyFormat): string {
  if (format === 'markdown') return extractTable(table, renderedFormulaDialect).text;
  return collectTableRows(table)
    .map((cells) =>
      cells
        .map((cell) => {
          const text = processInlineContent(cell as HTMLElement, renderedFormulaDialect, 'plain');
          return tsvCell(normalizeText(text.text));
        })
        .join('\t'),
    )
    .join('\n');
}
