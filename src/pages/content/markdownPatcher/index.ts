import { LoggerService } from '@/core/services/LoggerService';

const logger = LoggerService.getInstance().createChild('MarkdownPatcher');

/**
 * Scans a container for broken bold markdown syntax caused by injected HTML tags
 * and fixes them by wrapping the content in <strong> tags.
 *
 * Specific target pattern:
 * TextNode containing "**" -> ElementNode(b[data-path-to-node]) -> TextNode containing "**"
 */
function fixBrokenBoldTags(root: HTMLElement) {
  // Use a TreeWalker to safely iterate text nodes
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Node | null;

  while ((node = walker.nextNode())) {
    if (node.textContent?.includes('**')) {
      textNodes.push(node as Text);
    }
  }

  for (const startNode of textNodes) {
    if (!startNode.isConnected) continue;

    const startText = startNode.textContent || '';
    const startIdx = startText.lastIndexOf('**');

    // Currently we only handle the case where the opening delimiter is the last one in the node
    // or we just take the last one found.
    if (startIdx === -1) continue;

    const nextNode = startNode.nextSibling;

    // Check if the next sibling is the interfering element
    if (
      nextNode &&
      nextNode.nodeType === Node.ELEMENT_NODE &&
      (nextNode as HTMLElement).hasAttribute('data-path-to-node')
    ) {
      const middleElement = nextNode as HTMLElement;
      const endNode = nextNode.nextSibling;

      // Check if the node after the element is text and has the closing delimiter
      if (endNode && endNode.nodeType === Node.TEXT_NODE && endNode.textContent?.includes('**')) {
        const endText = endNode.textContent || '';
        const endIdx = endText.indexOf('**'); // Find first occurrence

        if (endIdx !== -1) {
          try {
            logger.info('Found broken markdown pattern due to injected node, applying fix...');

            // 1. Create wrapper
            const strong = document.createElement('strong');

            // 2. Insert the strong tag into the DOM first (before modifying/moving siblings)
            // We insert it before the middleElement (newNode).
            // Current state: [startNode] [middleElement] [endNode]
            // Desired state: [startNode] [strong] [endNode]
            //                 strong contains [text] [middleElement] [text]
            if (startNode.parentNode) {
              startNode.parentNode.insertBefore(strong, nextNode);
            }

            // 3. Extract and move content INTO the strong tag
            // Moving middleElement removes it from its original position, which is fine
            // because we already used it as the reference for insertion.

            // Content from start node (after the **)
            const afterStart = startText.substring(startIdx + 2);
            if (afterStart) {
              strong.appendChild(document.createTextNode(afterStart));
            }

            // The middle element (citation/highlight)
            strong.appendChild(middleElement);

            // Content from end node (before the **)
            const beforeEnd = endText.substring(0, endIdx);
            if (beforeEnd) {
              strong.appendChild(document.createTextNode(beforeEnd));
            }

            // 4. Cleanup original text nodes
            // Remove the ** and the moved text from startNode
            startNode.textContent = startText.substring(0, startIdx);

            // Remove the ** and the moved text from endNode
            endNode.textContent = endText.substring(endIdx + 2);
          } catch (e) {
            logger.error('Failed to apply markdown fix', { error: e });
          }
        }
      }
    }
  }
}

/**
 * Starts the observer to patch broken markdown rendering in Gemini
 */
export function startMarkdownPatcher() {
  logger.info('Starting Markdown Patcher');

  // Initial fix
  fixBrokenBoldTags(document.body);

  const observer = new MutationObserver((mutations) => {
    // Collect all added nodes to scan them
    const nodesToScan: HTMLElement[] = [];

    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          nodesToScan.push(node as HTMLElement);
        }
      });
    }

    if (nodesToScan.length > 0) {
      // Debounce or just run?
      // Since specific nodes are added, running on them is usually fast.
      nodesToScan.forEach((node) => fixBrokenBoldTags(node));
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
}
