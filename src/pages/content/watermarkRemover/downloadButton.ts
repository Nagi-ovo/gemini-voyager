export const DOWNLOAD_ICON_SELECTOR =
  'mat-icon[fonticon="download"], .google-symbols[data-mat-icon-name="download"]';

/**
 * Selector for the generated image container
 * Only buttons within this container should trigger watermark removal download progress
 */
const GENERATED_IMAGE_CONTAINER_SELECTOR = 'generated-image, .generated-image-container';

/**
 * Check if an element is within a generated image container
 */
function isWithinGeneratedImageContainer(element: Element): boolean {
  return element.closest(GENERATED_IMAGE_CONTAINER_SELECTOR) !== null;
}

export function findNativeDownloadButton(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null;

  // First check: must be within a generated-image container
  // This prevents triggering on user-uploaded image previews or other download buttons
  if (!isWithinGeneratedImageContainer(target)) return null;

  const dataTestButton = target.closest('button[data-test-id="download-generated-image-button"]');
  if (dataTestButton) return dataTestButton as HTMLButtonElement;

  const hostButton = target.closest('download-generated-image-button button');
  if (hostButton) return hostButton as HTMLButtonElement;

  const icon = target.closest(DOWNLOAD_ICON_SELECTOR);
  const buttonFromIcon = icon?.closest('button');
  if (buttonFromIcon) return buttonFromIcon as HTMLButtonElement;

  const button = target.closest('button');
  if (button && button.querySelector(DOWNLOAD_ICON_SELECTOR)) {
    return button as HTMLButtonElement;
  }

  return null;
}
