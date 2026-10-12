import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { type HighlightColor } from '@/core/types/highlight';

import type { StopNativeFeature } from '../../featureLifecycle';
import { startHighlightAction } from '../../highlight/highlightAction';
import { startSelectionToolbarHost } from '../../selectionToolbar/host';
import { startQuoteAction } from '../quoteAction';
import { startRenderedQuoteStyling } from '../renderedQuotes';

interface QuoteReplyOptions {
  quoteEnabled?: boolean;
  highlightEnabled?: boolean;
  highlightDefaultColor?: HighlightColor;
  highlightColorPalette?: readonly HighlightColor[];
  highlightTimelineMarkersEnabled?: boolean;
}

/**
 * Test composition of the selection toolbar, sent-quote styling and both actions in one call,
 * stopping the actions before the toolbar host they registered with. The page starts them
 * separately through `selectionStartup.ts`.
 */
export function startQuoteReply(options: QuoteReplyOptions = {}): StopNativeFeature {
  const stopHost = startSelectionToolbarHost();
  const stopRenderedQuoteStyling = startRenderedQuoteStyling();
  const stopQuote = options.quoteEnabled !== false ? startQuoteAction() : null;
  let stopHighlight =
    options.highlightEnabled !== false
      ? startHighlightAction({
          defaultColor: options.highlightDefaultColor,
          colorPalette: options.highlightColorPalette,
          timelineMarkersEnabled: options.highlightTimelineMarkersEnabled,
        })
      : null;

  function onStorageChanged(
    changes: Record<string, browser.Storage.StorageChange>,
    areaName: string,
  ): void {
    const change = areaName === 'sync' ? changes[StorageKeys.HIGHLIGHT_ENABLED] : undefined;
    if (!change) return;
    if (change.newValue === true) {
      stopHighlight ??= startHighlightAction();
    } else if (stopHighlight) {
      stopHighlight();
      stopHighlight = null;
    }
  }
  browser.storage.onChanged.addListener(onStorageChanged);

  return () => {
    browser.storage.onChanged.removeListener(onStorageChanged);
    stopHighlight?.();
    stopHighlight = null;
    stopQuote?.();
    stopRenderedQuoteStyling();
    stopHost();
  };
}
