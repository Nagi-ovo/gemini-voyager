import browser from 'webextension-polyfill';

const SAFARI_NATIVE_APP_ID = 'com.yourCompany.Gemini-Voyager';

export const SAFARI_CLIPBOARD_IMAGE_COPY_REQUEST = 'gv.clipboard.copyImagePng';

type NativeClipboardResponse = {
  success?: boolean;
  data?: {
    copied?: unknown;
  };
};

type ClipboardCopyRuntimeResponse = {
  ok?: boolean;
  copied?: unknown;
};

/**
 * Background-side call: hands a PNG to the Safari native app, which writes it
 * to NSPasteboard. Unlike the Web Clipboard API this has no user-activation or
 * ITP restrictions, so it succeeds where `navigator.clipboard.write` fails.
 */
export async function copySafariNativeImagePng(pngBase64: string): Promise<boolean> {
  try {
    const response = await browser.runtime.sendNativeMessage<
      Record<string, unknown>,
      NativeClipboardResponse
    >(SAFARI_NATIVE_APP_ID, {
      action: 'copyImageToPasteboard',
      pngBase64,
    });
    return response?.success === true && response.data?.copied === true;
  } catch {
    return false;
  }
}

/** Content-script side: routes the PNG through the background service worker. */
export async function requestSafariNativeImageCopy(pngBase64: string): Promise<boolean> {
  try {
    const response = (await browser.runtime.sendMessage({
      type: SAFARI_CLIPBOARD_IMAGE_COPY_REQUEST,
      payload: { pngBase64 },
    })) as ClipboardCopyRuntimeResponse | undefined;
    return response?.ok === true && response.copied === true;
  } catch {
    return false;
  }
}
