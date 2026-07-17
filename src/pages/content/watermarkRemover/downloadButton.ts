export const DOWNLOAD_ICON_SELECTOR =
  'mat-icon[fonticon="download"], .google-symbols[data-mat-icon-name="download"]';

/**
 * Selector for an ancestor that proves the button belongs to a Gemini-generated
 * image. Two cases:
 *  - `<generated-image>` / `.generated-image-container` — the in-message toolbar
 *  - `<download-generated-image-button>` — the same component is reused inside
 *    the lightbox (`<expansion-dialog>` rendered into `cdk-overlay-container`),
 *    where neither of the above ancestors is present. The custom element name
 *    is Gemini-specific so user-uploaded image previews still won't match.
 */
const GENERATED_IMAGE_CONTAINER_SELECTOR =
  'generated-image, .generated-image-container, download-generated-image-button';

/**
 * Check if an element is within a generated image container (toolbar or lightbox).
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

const GENERATED_IMAGE_SOURCE_SELECTOR =
  'img[data-watermark-original-src], img[data-processed-url], img[src^="blob:"], img[src*="googleusercontent.com"], img[src*="ggpht.com"]';

/**
 * Resolve the generated image associated with a native download button.
 * Gemini renders toolbar buttons inside the generated-image container, while
 * lightbox buttons live with the displayed image inside expansion-dialog.
 */
export function findGeneratedImageForDownloadButton(
  button: HTMLButtonElement,
): HTMLImageElement | null {
  const scope = button.closest('generated-image, .generated-image-container, expansion-dialog');
  return scope?.querySelector<HTMLImageElement>(GENERATED_IMAGE_SOURCE_SELECTOR) ?? null;
}
