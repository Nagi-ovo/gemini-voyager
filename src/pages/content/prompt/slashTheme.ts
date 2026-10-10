import type { PromptScheme } from '@/features/prompt/PromptSiteAdapter';

export function applyPromptTokenColor(token: HTMLElement, scheme: PromptScheme): void {
  token.dataset.gvTheme = scheme;
  // Gemini's editor applies host styles to contenteditable=false spans. An
  // inline custom property feeds the stylesheet's important declaration, so
  // the selected prompt follows Voyager's configurable accent even when a
  // Gemini host selector would otherwise win.
  token.style.setProperty(
    '--gv-pm-slash-token-color',
    'var(--gv-pm-brand, var(--gv-pm-brand-default))',
  );
}
