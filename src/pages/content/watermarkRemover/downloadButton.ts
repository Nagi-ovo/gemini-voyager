export const DOWNLOAD_ICON_SELECTOR =
  'mat-icon[fonticon="download"], .google-symbols[data-mat-icon-name="download"]';

export function findNativeDownloadButton(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null;

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
