/**
 * The picture a reply-complete notification shows: the mark of the site whose
 * reply finished, drawn on a white tile, so a glance tells Gemini from ChatGPT.
 * The title already says Voyager and the OS puts the browser's icon beside it.
 *
 * Drawn from the bundled `PLATFORM_LOGOS` geometry at runtime rather than
 * shipped as PNGs. A browser without `OffscreenCanvas` (or one that fails to
 * draw) gets `null`, and the caller keeps the Voyager icon.
 */
import { PLATFORM_LOGOS, type PlatformLogo } from '@/core/icons/platformLogos';

export type NotificationSite = 'gemini' | 'chatgpt';

const ICON_SIZE = 128;
const TILE_RADIUS = 28;
const MARK_SIZE = 76;
const TILE_COLOR = '#ffffff';

/** ChatGPT's own mark is black; the popup's sky-blue badge colour is not its brand. */
const SITE_MARKS: Readonly<Record<NotificationSite, { logo: PlatformLogo; color: string }>> = {
  gemini: { logo: PLATFORM_LOGOS.gemini, color: PLATFORM_LOGOS.gemini.brand },
  chatgpt: { logo: PLATFORM_LOGOS.chatgpt, color: '#000000' },
};

const drawn = new Map<NotificationSite, Promise<string | null>>();

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function draw(site: NotificationSite): Promise<string | null> {
  if (typeof OffscreenCanvas !== 'function' || typeof Path2D !== 'function') return null;
  const { logo, color } = SITE_MARKS[site];
  const canvas = new OffscreenCanvas(ICON_SIZE, ICON_SIZE);
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = TILE_COLOR;
  context.beginPath();
  context.roundRect(0, 0, ICON_SIZE, ICON_SIZE, TILE_RADIUS);
  context.fill();

  const [minX, minY, width, height] = logo.viewBox.split(/\s+/).map(Number);
  const scale = MARK_SIZE / Math.max(width, height);
  context.translate(
    (ICON_SIZE - width * scale) / 2 - minX * scale,
    (ICON_SIZE - height * scale) / 2 - minY * scale,
  );
  context.scale(scale, scale);
  context.fillStyle = color;
  for (const path of logo.paths) context.fill(new Path2D(path));

  return blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
}

/** A PNG data URL of the site's mark, or null when this browser cannot draw it. */
export function siteNotificationIcon(site: NotificationSite): Promise<string | null> {
  let icon = drawn.get(site);
  if (!icon) {
    icon = draw(site).catch(() => null);
    drawn.set(site, icon);
  }
  return icon;
}
