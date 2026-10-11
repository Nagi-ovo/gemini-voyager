/** Native button behavior shared by code and content collapse presentations. */
export function createCollapseToggle(
  doc: Document,
  className: string,
  onToggle: () => void,
): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = className;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  });
  return button;
}
