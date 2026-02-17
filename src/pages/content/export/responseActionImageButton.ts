export type ResponseActionCopyImageOptions = {
  label: string;
  tooltip: string;
  onClick: (button: HTMLElement) => void;
};

const COPY_BUTTON_TEST_ID = 'copy-button';
const MORE_BUTTON_TEST_ID = 'more-menu-button';
const COPY_IMAGE_BUTTON_TEST_ID = 'gv-copy-image-button';
const COPY_IMAGE_ICON_NAME = 'image';
const ASSISTANT_SCOPE_SELECTOR = [
  '[data-message-author-role="assistant"]',
  '[data-message-author-role="model"]',
  'article[data-author="assistant"]',
  'article[data-turn="assistant"]',
  'article[data-turn="model"]',
  '.model-response',
  'model-response',
  '.response-container',
  '.presented-response-container',
].join(', ');

type BoundCopyImageButton = HTMLElement & {
  __gvCopyImageHandler?: (event: Event) => void;
};

function updateButtonLabelAndTooltip(
  button: HTMLElement,
  label: string,
  tooltip: string,
): HTMLElement {
  const interactive = button.matches('button')
    ? button
    : ((button.querySelector('button, [role="button"]') as HTMLElement | null) ?? button);

  interactive.setAttribute('aria-label', tooltip);
  interactive.title = tooltip;
  interactive.removeAttribute('aria-describedby');
  button.setAttribute('aria-label', tooltip);
  button.title = tooltip;
  button.setAttribute('data-gv-copy-image-label', label);

  return interactive;
}

function updateButtonIcon(button: HTMLElement): void {
  const icon = button.querySelector('mat-icon');
  if (!(icon instanceof HTMLElement)) return;

  if (icon.hasAttribute('fonticon')) {
    icon.setAttribute('fonticon', COPY_IMAGE_ICON_NAME);
  }
  icon.textContent = COPY_IMAGE_ICON_NAME;
}

function findButtonByTestId(container: HTMLElement, testId: string): HTMLElement | null {
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(testId) : testId;
  return (container.querySelector(`[data-test-id="${escaped}"]`) as HTMLElement | null) ?? null;
}

function findActionContainerFromMoreButton(moreButton: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = moreButton;
  let depth = 0;
  while (current && depth < 12) {
    const hasCopy = !!findButtonByTestId(current, COPY_BUTTON_TEST_ID);
    const hasMore = !!findButtonByTestId(current, MORE_BUTTON_TEST_ID);
    if (hasCopy && hasMore) {
      return current;
    }
    current = current.parentElement;
    depth += 1;
  }

  return null;
}

function bindButtonClick(
  button: HTMLElement,
  interactive: HTMLElement,
  onClick: (button: HTMLElement) => void,
): void {
  const typed = button as BoundCopyImageButton;
  if (typed.__gvCopyImageHandler) {
    interactive.removeEventListener('click', typed.__gvCopyImageHandler);
  }

  const handler = (event: Event) => {
    try {
      event.preventDefault();
    } catch {}
    try {
      event.stopPropagation();
    } catch {}
    onClick(button);
  };

  typed.__gvCopyImageHandler = handler;
  interactive.addEventListener('click', handler);
}

function isAssistantActionContainer(container: HTMLElement): boolean {
  return !!container.closest(ASSISTANT_SCOPE_SELECTOR);
}

function ensureButtonPosition(
  container: HTMLElement,
  copyImageButton: HTMLElement,
  moreButton: HTMLElement,
): void {
  if (!moreButton.parentElement) {
    if (!container.contains(copyImageButton)) container.appendChild(copyImageButton);
    return;
  }

  if (copyImageButton !== moreButton.previousElementSibling) {
    moreButton.parentElement.insertBefore(copyImageButton, moreButton);
  }
}

function injectIntoActionContainer(
  container: HTMLElement,
  options: ResponseActionCopyImageOptions,
): HTMLElement | null {
  if (!isAssistantActionContainer(container)) return null;

  const copyButton = findButtonByTestId(container, COPY_BUTTON_TEST_ID);
  const moreButton = findButtonByTestId(container, MORE_BUTTON_TEST_ID);
  if (!(copyButton instanceof HTMLElement) || !(moreButton instanceof HTMLElement)) return null;

  const existing = findButtonByTestId(container, COPY_IMAGE_BUTTON_TEST_ID);
  if (existing) {
    const interactive = updateButtonLabelAndTooltip(existing, options.label, options.tooltip);
    updateButtonIcon(existing);
    bindButtonClick(existing, interactive, options.onClick);
    ensureButtonPosition(container, existing, moreButton);
    return existing;
  }

  const cloned = copyButton.cloneNode(true) as HTMLElement;
  cloned.setAttribute('data-test-id', COPY_IMAGE_BUTTON_TEST_ID);
  cloned.removeAttribute('id');

  const interactive = updateButtonLabelAndTooltip(cloned, options.label, options.tooltip);
  updateButtonIcon(cloned);
  bindButtonClick(cloned, interactive, options.onClick);

  ensureButtonPosition(container, cloned, moreButton);
  return cloned;
}

export function injectResponseActionCopyImageButtons(
  root: ParentNode,
  options: ResponseActionCopyImageOptions,
): HTMLElement[] {
  const moreButtons: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.getAttribute('data-test-id') === MORE_BUTTON_TEST_ID) {
    moreButtons.push(root);
  }
  moreButtons.push(
    ...Array.from(root.querySelectorAll<HTMLElement>(`[data-test-id="${MORE_BUTTON_TEST_ID}"]`)),
  );

  if (moreButtons.length === 0 && root instanceof HTMLElement) {
    const directContainer = findActionContainerFromMoreButton(root);
    if (directContainer) {
      const maybeInjected = injectIntoActionContainer(directContainer, options);
      return maybeInjected ? [maybeInjected] : [];
    }
  }

  const visitedContainers = new Set<HTMLElement>();
  const injected: HTMLElement[] = [];

  for (const moreButton of moreButtons) {
    const container = findActionContainerFromMoreButton(moreButton);
    if (!container || visitedContainers.has(container)) continue;
    visitedContainers.add(container);
    const maybeInjected = injectIntoActionContainer(container, options);
    if (maybeInjected) injected.push(maybeInjected);
  }

  return injected;
}
