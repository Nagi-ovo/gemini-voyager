import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { type HighlightColor } from '@/core/types/highlight';
import { getAssistantTurnSelectors, getUserTurnSelectors } from '@/core/utils/selectors';

import { HighlightManager } from '../highlight/manager';
import { createHighlightColorPicker } from './highlightColorPicker';
import { insertQuotedSelection } from './quoteInsertion';
import { startRenderedQuoteStyling } from './renderedQuotes';
import { createSelectionToolbar } from './selectionToolbar';

const SELECTION_DEBOUNCE_MS = 250;
const getQuoteableMessageSelector = (): string =>
  ['.conversation-container', ...getUserTurnSelectors(), ...getAssistantTurnSelectors()].join(', ');

interface QuoteReplyOptions {
  quoteEnabled?: boolean;
  highlightEnabled?: boolean;
  highlightDefaultColor?: HighlightColor;
  highlightColorPalette?: readonly HighlightColor[];
  highlightTimelineMarkersEnabled?: boolean;
}

export function startQuoteReply(options: QuoteReplyOptions = {}) {
  const quoteEnabled = options.quoteEnabled !== false;
  let highlightEnabled = options.highlightEnabled !== false;
  let highlightTimelineMarkersEnabled = options.highlightTimelineMarkersEnabled !== false;
  let highlightManager: HighlightManager | null = null;
  let currentSelectionRange: Range | null = null;
  let isInternalClick = false;
  let selectionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const onInternalClick = () => {
    isInternalClick = true;
  };
  const picker = createHighlightColorPicker(options, {
    onInternalClick,
    restoreSelection: restoreCurrentSelection,
    onPaletteChange: (colors) => highlightManager?.setColorPalette(colors),
  });
  const toolbar = createSelectionToolbar(quoteEnabled, picker, {
    onInternalClick,
    onQuote: handleQuoteClick,
    onHighlight: handleHighlightClick,
  });
  const stopRenderedQuoteStyling = startRenderedQuoteStyling();

  function startHighlightManager(): void {
    if (highlightManager) return;
    const manager = new HighlightManager();
    manager.setColorPalette(picker.colors);
    manager.setTimelineMarkersEnabled(highlightTimelineMarkersEnabled);
    highlightManager = manager;
    void manager.init();
  }

  function stopHighlightManager(): void {
    highlightManager?.destroy();
    highlightManager = null;
  }

  if (highlightEnabled) startHighlightManager();

  function restoreCurrentSelection(): void {
    if (!currentSelectionRange) return;
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(currentSelectionRange.cloneRange());
  }

  async function handleHighlightClick() {
    const manager = highlightManager;
    if (!currentSelectionRange || !manager) return;
    const range = currentSelectionRange.cloneRange();
    const saved = await manager.createFromRange(range, picker.color);
    if (!saved) return;
    toolbar.hide();
    currentSelectionRange = null;
    window.getSelection()?.removeAllRanges();
  }

  function handleQuoteClick(): void {
    if (!currentSelectionRange || !insertQuotedSelection(currentSelectionRange)) return;
    toolbar.hide();
    currentSelectionRange = null;
    window.getSelection()?.removeAllRanges();
  }

  function handleSelectionChange() {
    // Debounce to let selection settle and avoid redundant updates on rapid key events
    if (selectionDebounceTimer) clearTimeout(selectionDebounceTimer);
    selectionDebounceTimer = setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        toolbar.hide();
        currentSelectionRange = null;
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        toolbar.hide();
        currentSelectionRange = null;
        return;
      }

      // Check if selection is within a message user/model bubble
      // We don't want to quote random UI elements
      const anchor = selection.anchorNode;
      if (!anchor) return;

      const element =
        anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as HTMLElement);

      // Check if selection is inside main content area
      // Gemini uses <main> or sometimes specific classes. We want to avoid nav, sidebar, etc.
      const mainContent = document.querySelector('main');
      if (mainContent && !mainContent.contains(element)) {
        toolbar.hide();
        return;
      }

      // Also explicitly check for sidebar classes just in case
      if (
        element?.closest('nav') ||
        element?.closest('[role="navigation"]') ||
        element?.closest('.sidebar') ||
        element?.closest('.mat-drawer')
      ) {
        toolbar.hide();
        return;
      }

      // Selectors for valid areas: user-query-container, model-response, conversation-container
      // Or just check if it's not the input box itself
      if (element?.closest('[contenteditable="true"]')) {
        toolbar.hide();
        return;
      }

      // Only conversation turns are quoteable. Gemini also renders a greeting and
      // prompt suggestions inside <main> on the new-chat screen, but those are not
      // messages and must not expose Quote Reply.
      const range = selection.getRangeAt(0);
      const commonAncestor =
        range.commonAncestorContainer instanceof Element
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      const quoteableMessageSelector = getQuoteableMessageSelector();
      if (
        !element?.closest(quoteableMessageSelector) ||
        !commonAncestor?.closest(quoteableMessageSelector)
      ) {
        toolbar.hide();
        currentSelectionRange = null;
        return;
      }

      currentSelectionRange = range.cloneRange();
      const canHighlight =
        highlightEnabled && (highlightManager?.canCreateFromRange(range) ?? false);
      toolbar.show(currentSelectionRange, canHighlight);
      if (!quoteEnabled && (!canHighlight || !highlightEnabled)) {
        toolbar.hide();
        currentSelectionRange = null;
        return;
      }
    }, SELECTION_DEBOUNCE_MS);
  }

  function onMouseUp(event: MouseEvent): void {
    if (isInternalClick) {
      isInternalClick = false;
      return;
    }
    picker.handleDismissal(event);
    handleSelectionChange();
  }

  function onKeys(event: KeyboardEvent): void {
    if (picker.handleDismissal(event)) return;
    if (event.key === 'Shift' || event.key.startsWith('Arrow')) handleSelectionChange();
  }

  function onStorageChanged(
    changes: Record<string, browser.Storage.StorageChange>,
    areaName: string,
  ): void {
    if ((areaName === 'sync' || areaName === 'local') && changes[StorageKeys.LANGUAGE]) {
      toolbar.updateText();
    }
    if (areaName === 'sync' && changes[StorageKeys.HIGHLIGHT_ENABLED]) {
      highlightEnabled = changes[StorageKeys.HIGHLIGHT_ENABLED].newValue === true;
      if (highlightEnabled) startHighlightManager();
      else stopHighlightManager();
      const canHighlight =
        currentSelectionRange !== null &&
        highlightEnabled &&
        (highlightManager?.canCreateFromRange(currentSelectionRange) ?? false);
      if (!highlightEnabled) picker.hide();
      toolbar.refreshAvailability(currentSelectionRange, canHighlight);
    }
    if (areaName === 'sync') {
      picker.applyStorageChanges(changes);
      const timelineMarkersChange = changes[StorageKeys.HIGHLIGHT_TIMELINE_MARKERS_ENABLED];
      if (timelineMarkersChange) {
        highlightTimelineMarkersEnabled = timelineMarkersChange.newValue !== false;
        highlightManager?.setTimelineMarkersEnabled(highlightTimelineMarkersEnabled);
      }
    }
  }

  // Mouseup waits for a finished drag; keyup also supports keyboard selections.
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keyup', onKeys);
  browser.storage.onChanged.addListener(onStorageChanged);

  return () => {
    stopRenderedQuoteStyling();
    toolbar.hide();
    if (selectionDebounceTimer) clearTimeout(selectionDebounceTimer);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keyup', onKeys);
    browser.storage.onChanged.removeListener(onStorageChanged);
    stopHighlightManager();
    toolbar.destroy();
  };
}
