import { LoggerService } from '@/core/services/LoggerService';

const logger = LoggerService.getInstance().createChild('MarkdownPatcher');

/**
 * Scans a container for broken bold markdown syntax caused by injected HTML tags
 * and fixes them by wrapping the content in <strong> tags.
 *
 * Specific target pattern:
 * TextNode containing "**" -> ElementNode(b[data-path-to-node]) -> TextNode containing "**"
 */
// Export for testing
export function fixBrokenBoldTags(root: HTMLElement) {
  // Use a TreeWalker to safely iterate text nodes
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    // Skip if inside code block, pre tags, or math/formula containers
    if (
      parent &&
      (parent.tagName === 'CODE' ||
        parent.tagName === 'PRE' ||
        parent.tagName === 'MATH-BLOCK' || // Gemini custom element
        parent.tagName === 'MATH-INLINE' || // Gemini custom element
        parent.classList.contains('math-block') ||
        parent.classList.contains('math-inline') ||
        parent.closest('code') ||
        parent.closest('pre') ||
        parent.closest('code-block') ||
        parent.closest('.math-block') ||
        parent.closest('.math-inline'))
    ) {
      continue;
    }

    if (node.textContent?.includes('**')) {
      textNodes.push(node as Text);
    }
  }

  for (const startNode of textNodes) {
    if (!startNode.isConnected) continue;

    let currentNode = startNode;
    const originalText = currentNode.textContent || '';

    // Phase 1: Fix intra-node bolds (e.g., "start **bold** end")
    // We match all complete pairs of **...** within the node
    // Improved Regex: require non-whitespace immediately inside the asterisks
    // and prevent matching across long distances if not intended.
    // However, maintaining the basic structure, let's enforce:
    // **(non-space...non-space)** to be safer.
    // Updated regex: \*\*([^\s].*?[^\s]|[^\s])\*\* OR \*\*([^\s])\*\*
    // This prevents matching "** " or " **"
    const matches = Array.from(originalText.matchAll(/\*\*([^\s].*?[^\s]|[^\s])\*\*/g));

    if (matches.length > 0) {
      const fragment = document.createDocumentFragment();
      let lastCursor = 0;
      let lastTextNode: Text | null = null;

      matches.forEach((m) => {
        const matchStart = m.index!;
        const matchEnd = matchStart + m[0].length;
        const content = m[1];

        // Text before
        if (matchStart > lastCursor) {
          fragment.appendChild(document.createTextNode(originalText.slice(lastCursor, matchStart)));
        }

        // Bold content
        const strong = document.createElement('strong');
        strong.textContent = content;
        fragment.appendChild(strong);

        lastCursor = matchEnd;
      });

      // Text after (this might contain a trailing unmatched '**' for Phase 2)
      if (lastCursor < originalText.length) {
        lastTextNode = document.createTextNode(originalText.slice(lastCursor));
        fragment.appendChild(lastTextNode);
      }

      // Replace the original node with our processed fragment
      if (currentNode.parentNode) {
        currentNode.parentNode.replaceChild(fragment, currentNode);
      }

      // Prepare for Phase 2:
      // If we created a trailing text node, that is now the candidate for the "split" check.
      // If we didn't (node ended with bold), there's no dangling start marker, so we're done with this node.
      if (lastTextNode) {
        currentNode = lastTextNode;
      } else {
        continue;
      }
    }

    // Phase 2: Fix split-node bolds (e.g., "text**" -> element -> "text**")
    // This logic handles cases where the bold marker is interrupted by an injected element
    const startText = currentNode.textContent || '';
    const startIdx = startText.lastIndexOf('**');

    if (startIdx === -1) continue;

    const nextNode = currentNode.nextSibling;

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

            // 2. Insert the strong tag into the DOM first
            if (currentNode.parentNode) {
              currentNode.parentNode.insertBefore(strong, nextNode);
            }

            // 3. Extract and move content INTO the strong tag
            // Content from start node (after the **)
            const afterStart = startText.substring(startIdx + 2);
            if (afterStart) {
              strong.appendChild(document.createTextNode(afterStart));
            }

            // The middle element
            strong.appendChild(middleElement);

            // Content from end node (before the **)
            const beforeEnd = endText.substring(0, endIdx);
            if (beforeEnd) {
              strong.appendChild(document.createTextNode(beforeEnd));
            }

            // 4. Cleanup original text nodes
            currentNode.textContent = startText.substring(0, startIdx);
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
