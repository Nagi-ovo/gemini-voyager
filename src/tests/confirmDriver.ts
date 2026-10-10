/**
 * Drives the shared confirm the way a user does, through its role and labels,
 * so call-site tests do not depend on how the card is built.
 */
const POPOVER = '[data-gv-layer="popover"]';

function dialog(): HTMLElement | null {
  for (const host of document.querySelectorAll<HTMLElement>(POPOVER)) {
    const found = host.shadowRoot?.querySelector<HTMLElement>('[role="alertdialog"]');
    if (found) return found;
  }
  return null;
}

export const confirmDriver = {
  isOpen: (): boolean => dialog() !== null,
  message: (): string | null =>
    dialog()?.querySelector<HTMLElement>('#gv-confirm-message')?.textContent ?? null,
  labels: (): string[] =>
    Array.from(dialog()?.querySelectorAll('button') ?? []).map(
      (button) => button.textContent ?? '',
    ),
  /** The button that has keyboard focus inside the confirm, by label. */
  focusedLabel: (): string | null => {
    const root = dialog()?.getRootNode();
    return root instanceof ShadowRoot ? (root.activeElement?.textContent ?? null) : null;
  },
  /** Presses within the card across its shadow boundary. */
  pressInside(): void {
    dialog()?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  },
  /** The effective scheme exposed by the layer's host. */
  scheme(): string | null {
    const host = (dialog()?.getRootNode() as ShadowRoot | undefined)?.host;
    return host?.getAttribute('data-gv-ui-scheme') ?? host?.getAttribute('data-gv-scheme') ?? null;
  },
  answer(label: string): void {
    const button = Array.from(dialog()?.querySelectorAll('button') ?? []).find(
      (candidate) => candidate.textContent === label,
    );
    if (!button) throw new Error(`No confirm button labelled "${label}"`);
    button.click();
  },
  pressOutside(target: Element = document.body): void {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  },
  pressEscape(): void {
    (dialog() ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }),
    );
  },
};
