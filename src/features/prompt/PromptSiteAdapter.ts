/**
 * What the Prompt Manager needs to know about the site it runs on.
 *
 * The panel itself is the same on every site; only these facts differ. A site
 * is resolved once per page by `resolvePromptSiteAdapter` in the content
 * module. When the panel runs at all (always, or only while the user's
 * custom-website list covers the host) is the content entry's decision, not a
 * fact about the site.
 */
import type { HighlightPlatform } from '@/core/types/highlight';

export type PromptScheme = 'light' | 'dark';

/** Distances, in px, from the viewport's bottom-right corner. */
export interface PromptTriggerSpot {
  right: number;
  bottom: number;
}

export interface PromptSiteAdapter {
  /** Slash completion and sent-prompt chips run here. */
  readonly slash: boolean;
  /** Puts `text` into the site's composer; false when there is none, and the caller copies instead. */
  insert(text: string): boolean;
  /** The page's light/dark right now; prompt surfaces start in it. */
  scheme(): PromptScheme;
  /** Where the floating ball sits until the user drags it; null keeps the stylesheet's corner. */
  defaultTriggerSpot(ballHeight: number): PromptTriggerSpot | null;
  /** Whose highlights the Saved Library shows here. */
  readonly highlightPlatform: HighlightPlatform;
}
