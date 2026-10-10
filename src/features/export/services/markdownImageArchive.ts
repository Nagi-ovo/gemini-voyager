/**
 * Packages a markdown conversation into a zip one image at a time.
 * There is no image count cap: each image becomes a Blob part as soon as it
 * arrives, so only the fetches in flight sit in the JS heap. A single image is
 * still capped inside `fetchBoundedExportImage`.
 * Page-origin temp files expose conversations to page scripts and other accounts;
 * larger exports need extension-owned packaging with download completion tracking.
 */
import { MarkdownFormatter } from './MarkdownFormatter';
import {
  EXPORT_IMAGE_FETCH_CONCURRENCY,
  type ImageFetchBudget,
  MAX_MARKDOWN_ARCHIVE_IMAGE_BYTES,
} from './boundedImageFetch';
import { BlobZipSink, StreamingZipWriter } from './streamingZip';

export interface MarkdownImageFetch {
  blob: Blob;
  contentType: string | null;
}

export interface PackageMarkdownImagesOptions {
  markdown: string;
  normalizedFilename: string;
  markdownEntryName: string;
  signal?: AbortSignal;
  fetchImage: (
    url: string,
    budget: ImageFetchBudget,
    signal?: AbortSignal,
  ) => Promise<MarkdownImageFetch | null>;
  toOriginalSizeUrl: (url: string) => string;
  pickExtension: (contentType: string | null, url: string) => string;
  /** Total image bytes to keep. Defaults to `MAX_MARKDOWN_ARCHIVE_IMAGE_BYTES`. */
  imageByteBudget?: number;
  download?: (blob: Blob, filename: string) => void;
}

export interface PackagedMarkdownArchive {
  filename: string;
  omittedImageCount: number;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
}

async function eachInOrder<T>(
  count: number,
  task: (index: number) => Promise<T>,
  consume: (index: number, value: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const pending = new Map<number, Promise<T>>();
  let started = 0;
  let consumed = 0;
  const startMore = () => {
    while (started < count && pending.size < EXPORT_IMAGE_FETCH_CONCURRENCY) {
      const index = started;
      started += 1;
      const tracked = task(index);
      // A fetch still running after the archive fails must not surface as unhandled.
      void tracked.catch(() => undefined);
      pending.set(index, tracked);
    }
  };

  startMore();
  while (consumed < count) {
    assertNotAborted(signal);
    const pendingResult = pending.get(consumed);
    if (!pendingResult) throw new Error('export image fetch lost its place');
    const value = await pendingResult;
    pending.delete(consumed);
    await consume(consumed, value);
    consumed += 1;
    startMore();
  }
}

function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read an export image'));
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(new Uint8Array(result));
      else reject(new Error('Could not read an export image'));
    };
    reader.readAsArrayBuffer(blob);
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    try {
      document.body.removeChild(anchor);
    } catch {
      /* The anchor may already be gone. */
    }
    URL.revokeObjectURL(url);
  }, 0);
}

export async function packageMarkdownImages(
  options: PackageMarkdownImagesOptions,
): Promise<PackagedMarkdownArchive> {
  assertNotAborted(options.signal);
  const imageUrls = MarkdownFormatter.extractImageUrls(options.markdown);
  const imageByteBudget = options.imageByteBudget ?? MAX_MARKDOWN_ARCHIVE_IMAGE_BYTES;
  const sink = new BlobZipSink();
  const writer = new StreamingZipWriter(sink);
  const budget: ImageFetchBudget = { remainingBytes: imageByteBudget };
  const mapping = new Map<string, string>();
  let omittedImageCount = 0;
  let savedImageBytes = 0;
  let nextImageIndex = 1;

  await eachInOrder(
    imageUrls.length,
    async (index) => {
      const url = imageUrls[index] ?? '';
      const fetched = await options.fetchImage(
        options.toOriginalSizeUrl(url),
        budget,
        options.signal,
      );
      return { url, fetched };
    },
    async (_index, item) => {
      assertNotAborted(options.signal);
      if (!item.fetched) {
        omittedImageCount += 1;
        return;
      }
      let bytes: Uint8Array;
      try {
        bytes = await blobBytes(item.fetched.blob);
      } catch {
        // One unreadable image keeps its link; it must not sink the whole export.
        omittedImageCount += 1;
        return;
      }
      if (savedImageBytes + bytes.byteLength > imageByteBudget) {
        omittedImageCount += 1;
        return;
      }
      const extension = options.pickExtension(item.fetched.contentType, item.url);
      const fileName = `img-${String(nextImageIndex).padStart(3, '0')}.${extension}`;
      nextImageIndex += 1;
      await writer.addStored(`assets/${fileName}`, bytes);
      savedImageBytes += bytes.byteLength;
      mapping.set(item.url, `assets/${fileName}`);
    },
    options.signal,
  );

  assertNotAborted(options.signal);
  const packagedMarkdown = MarkdownFormatter.rewriteImageUrls(options.markdown, mapping);
  await writer.addStored(options.markdownEntryName, new TextEncoder().encode(packagedMarkdown));
  await writer.finish();
  const filename = options.normalizedFilename.replace(/\.md$/i, '.zip');
  (options.download ?? downloadBlob)(sink.toBlob(), filename);
  return { filename, omittedImageCount };
}
