import selectionToolbarStyles from './selectionToolbar.css?inline';

const STYLE_ID = 'gemini-voyager-quote-reply-style';

/** A style node owned by one toolbar host; its stop removes this node, never a lookup by id. */
export function createSelectionToolbarStyle(): HTMLStyleElement {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = selectionToolbarStyles;
  return style;
}
