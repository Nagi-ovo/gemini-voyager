import { getTranslationSync } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

/**
 * The copy button shown above each target element: one icon-only button,
 * as on the table copy toolbar, with a tooltip and accessible name in the
 * Voyager language. Its UI lives in a shadow root, so the element's text,
 * timeline summaries and export never read it, and its colours follow the
 * page's own text colour in either theme.
 */
import { iconButtonCss } from '../iconButton';
import { createCopyIcon } from './icons';
import type messages from './messages/en.json';

declare module '@/utils/translations' {
  interface PrimitiveMessages {
    copyButton: typeof messages;
  }
}

export const COPY_BUTTON_CLASS = 'gv-copy-button';

/** The semantic keys a copy button can follow, each with its own label. */
export const COPY_TARGET_LABELS = {
  userTurn: 'copyButtonUserTurn',
  assistantTurn: 'copyButtonAssistantTurn',
  thinkingBlock: 'copyButtonThinkingBlock',
  codeBlock: 'copyButtonCodeBlock',
} as const satisfies Record<string, TranslationKey>;

export type CopyTarget = keyof typeof COPY_TARGET_LABELS;

const ICON_SIZE = 16;

const SHADOW_CSS = `
:host { display: block; }
.row { display: flex; justify-content: flex-end; margin-bottom: 4px; }
${iconButtonCss('button')}`;

export interface CopyButton {
  readonly host: HTMLElement;
  /** Re-reads the label after the Voyager language changed. */
  relabel(): void;
}

export function createCopyButton(
  doc: Document,
  target: CopyTarget,
  onCopy: () => void,
): CopyButton {
  const host = doc.createElement('div');
  host.className = COPY_BUTTON_CLASS;
  const root = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = SHADOW_CSS;
  const row = doc.createElement('div');
  row.className = 'row';
  const button = doc.createElement('button');
  button.type = 'button';
  button.append(createCopyIcon(ICON_SIZE));
  button.addEventListener('click', onCopy);
  row.append(button);
  const relabel = (): void => {
    const label = getTranslationSync(COPY_TARGET_LABELS[target]);
    button.title = label;
    button.setAttribute('aria-label', label);
  };
  relabel();
  root.append(style, row);
  return { host, relabel };
}
