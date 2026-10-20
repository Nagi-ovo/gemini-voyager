import {
  VOYAGER_WORDMARK_ASPECT,
  VOYAGER_WORDMARK_PATH,
  VOYAGER_WORDMARK_VIEWBOX,
} from '@/core/icons/voyagerWordmark';

/** The "Voyager" wordmark at `height` px, painted in the current text colour. */
export function VoyagerWordmark({ label, height }: { label: string; height: number }) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={VOYAGER_WORDMARK_VIEWBOX}
      width={Math.round(height * VOYAGER_WORDMARK_ASPECT)}
      height={height}
      fill="currentColor"
      className="block"
    >
      <path d={VOYAGER_WORDMARK_PATH} />
    </svg>
  );
}
