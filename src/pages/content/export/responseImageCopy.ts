import { renderElementToImageBlob } from '@/features/export/services/ImageRenderService';

type ClipboardWriteLike = Pick<Clipboard, 'write'>;
type ClipboardItemLike = new (items: Record<string, Blob>) => ClipboardItem;

export type CopyElementAsImageOptions = {
  clipboard?: ClipboardWriteLike | null;
  ClipboardItemCtor?: ClipboardItemLike | null;
};

function resolveClipboardDependencies(options?: CopyElementAsImageOptions): {
  clipboard: ClipboardWriteLike | null;
  ClipboardItemCtor: ClipboardItemLike | null;
} {
  const clipboard = options?.clipboard ?? navigator.clipboard ?? null;
  const globalClipboardItem = (globalThis as unknown as { ClipboardItem?: ClipboardItemLike })
    .ClipboardItem;
  const ClipboardItemCtor = options?.ClipboardItemCtor ?? globalClipboardItem ?? null;

  return { clipboard, ClipboardItemCtor };
}

export async function copyImageBlobToClipboard(
  blob: Blob,
  options?: CopyElementAsImageOptions,
): Promise<void> {
  const { clipboard, ClipboardItemCtor } = resolveClipboardDependencies(options);
  if (!clipboard?.write || !ClipboardItemCtor) {
    throw new Error('Clipboard image copy is not supported in this browser');
  }

  const item = new ClipboardItemCtor({ [blob.type || 'image/png']: blob });
  await clipboard.write([item]);
}

export function downloadImageBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.toLowerCase().endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    try {
      document.body.removeChild(anchor);
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  }, 0);
}

export async function copyElementAsImageToClipboard(
  target: HTMLElement,
  options?: CopyElementAsImageOptions,
): Promise<void> {
  const blob = await renderElementToImageBlob(target, {
    enableSanitizedFallback: true,
  });
  await copyImageBlobToClipboard(blob, options);
}
