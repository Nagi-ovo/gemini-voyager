import { getTranslationSync } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

/**
 * The copy toolbar shown above a reply's table: icon-only Markdown and TSV
 * buttons, as on the diagram toolbar, with tooltips and accessible names in
 * the Voyager language. Its UI lives in a shadow root, so the reply's text,
 * timeline summaries and export never read it, and its colours follow the
 * reply's own text colour in either theme.
 */
import { iconButtonCss } from '../iconButton';
import { createCopyIcon, createSheetIcon } from './icons';
import type messages from './messages/en.json';
import type { TableCopyFormat } from './serialize';

declare module '@/utils/translations' {
  interface PrimitiveMessages {
    tableCopy: typeof messages;
  }
}

export const TABLE_COPY_CLASS = 'gv-table-copy';

const ICON_SIZE = 16;

const TEXT = {
  markdown: 'tableCopyMarkdownButton',
  tsv: 'tableCopyTsvButton',
  copied: 'tableCopyCopied',
  failed: 'tableCopyFailed',
} as const satisfies Record<string, TranslationKey>;

const ICONS: Record<TableCopyFormat, (size: number) => SVGSVGElement> = {
  markdown: createCopyIcon,
  tsv: createSheetIcon,
};

const SHADOW_CSS = `
:host { display: block; position: sticky; inset-inline-start: 0; }
.toolbar { display: flex; justify-content: flex-end; gap: 2px; margin-bottom: 4px; }
${iconButtonCss('button')}`;

/** A toolbar string in the Voyager language. */
export function tableCopyText(name: keyof typeof TEXT): string {
  return getTranslationSync(TEXT[name]);
}

export interface TableCopyToolbar {
  readonly host: HTMLElement;
  /** Re-reads the labels after the Voyager language changed. */
  relabel(): void;
}

export function createTableCopyToolbar(
  doc: Document,
  onCopy: (format: TableCopyFormat) => void,
): TableCopyToolbar {
  const host = doc.createElement('div');
  host.className = TABLE_COPY_CLASS;
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = SHADOW_CSS;
  const toolbar = doc.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.setAttribute('role', 'group');

  const buttons = (['markdown', 'tsv'] as const).map((format) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.format = format;
    button.append(ICONS[format](ICON_SIZE));
    button.addEventListener('click', () => onCopy(format));
    toolbar.append(button);
    return { format, button };
  });
  const relabel = (): void => {
    for (const { format, button } of buttons) {
      const label = tableCopyText(format);
      button.title = label;
      button.setAttribute('aria-label', label);
    }
  };
  relabel();
  root.append(style, toolbar);
  return { host, relabel };
}
