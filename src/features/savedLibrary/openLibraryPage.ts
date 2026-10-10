export const LIBRARY_OPEN_MESSAGE = 'gv.library.open';
export const LIBRARY_PAGE_PATH = 'src/pages/library/index.html';

/** Content scripts and extension pages share the same fixed-target launcher. */
export async function openLibraryPage(): Promise<void> {
  const response: unknown = await chrome.runtime.sendMessage({ type: LIBRARY_OPEN_MESSAGE });
  if (!response || typeof response !== 'object' || !('ok' in response) || response.ok !== true) {
    throw new Error('Failed to open saved library');
  }
}
