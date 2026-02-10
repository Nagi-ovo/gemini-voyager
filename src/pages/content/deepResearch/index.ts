/**
 * Deep Research export feature - Main entry point
 * Detects Deep Research conversations and injects download button into menu
 */
import { injectDownloadButton } from './menuButton';

/**
 * Check if we're in a Deep Research conversation
 */
function isDeepResearchConversation(): boolean {
  return !!document.querySelector('deep-research-immersive-panel');
}

function getMenuPanelsFromNode(node: HTMLElement): HTMLElement[] {
  const panels: HTMLElement[] = [];
  if (node.matches('.mat-mdc-menu-panel[role="menu"]')) {
    panels.push(node);
  }
  panels.push(
    ...Array.from(node.querySelectorAll<HTMLElement>('.mat-mdc-menu-panel[role="menu"]')),
  );
  return panels;
}

/**
 * Observe menu opening and inject button if needed
 */
function observeMenuOpening(): void {
  // Use MutationObserver to watch for menu panel appearing
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          const panels = getMenuPanelsFromNode(node);
          if (panels.length === 0) return;
          if (!isDeepResearchConversation()) return;
          panels.forEach((panel) => {
            // Small delay to ensure menu is fully rendered
            setTimeout(() => {
              void injectDownloadButton(panel);
            }, 50);
          });
        }
      });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log('[Gemini Voyager] Deep Research export observer initialized');
}

/**
 * Start Deep Research export feature
 */
export function startDeepResearchExport(): void {
  try {
    // Only run on gemini.google.com
    if (location.hostname !== 'gemini.google.com') {
      return;
    }

    console.log('[Gemini Voyager] Initializing Deep Research export feature');

    // Start observing for menu opening
    observeMenuOpening();
  } catch (error) {
    console.error('[Gemini Voyager] Error starting Deep Research export:', error);
  }
}
