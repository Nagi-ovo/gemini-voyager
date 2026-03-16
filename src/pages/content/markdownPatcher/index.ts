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
        parent.closest('.math-inline') ||
        // Skip editable areas to avoid modifying user input
        parent.closest('rich-textarea') ||
        parent.closest('[contenteditable="true"]') ||
        parent.closest('[role="textbox"]'))
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

    // Phase 2: Fix split-node bolds (e.g., "text**" -> element(s) -> "text**")
    // Walk forward through siblings to find the closing ** marker,
    // collecting all intermediate nodes (elements and text nodes without **).
    const startText = currentNode.textContent || '';
    const startIdx = startText.lastIndexOf('**');

    if (startIdx === -1) continue;

    // Collect intermediate siblings until we find a text node containing **
    const middleNodes: Node[] = [];
    let walker2: Node | null = currentNode.nextSibling;
    let endNode: Text | null = null;
    const MAX_WALK = 10; // safety limit to avoid walking too far

    for (let steps = 0; walker2 && steps < MAX_WALK; steps++) {
      if (walker2.nodeType === Node.TEXT_NODE) {
        const text = walker2.textContent || '';
        if (text.includes('**')) {
          endNode = walker2 as Text;
          break;
        }
        // Text node without ** — part of the bold content
        middleNodes.push(walker2);
      } else if (
        walker2.nodeType === Node.ELEMENT_NODE &&
        (walker2 as HTMLElement).hasAttribute('data-path-to-node')
      ) {
        middleNodes.push(walker2);
      } else {
        // Unknown node type — stop to avoid unexpected behavior
        break;
      }
      walker2 = walker2.nextSibling;
    }

    if (!endNode || middleNodes.length === 0) continue;

    const endText = endNode.textContent || '';
    const endIdx = endText.indexOf('**');

    if (endIdx === -1) continue;

    try {
      logger.info('Found broken markdown pattern due to injected node, applying fix...');

      // 1. Create wrapper
      const strong = document.createElement('strong');

      // 2. Insert the strong tag before the first middle node
      if (currentNode.parentNode) {
        currentNode.parentNode.insertBefore(strong, middleNodes[0]);
      }

      // 3. Extract and move content INTO the strong tag
      // Content from start node (after the **)
      const afterStart = startText.substring(startIdx + 2);
      if (afterStart) {
        strong.appendChild(document.createTextNode(afterStart));
      }

      // All intermediate nodes
      for (const mid of middleNodes) {
        strong.appendChild(mid);
      }

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
      nodesToScan.forEach((node) => {
        // Skip editable areas to avoid modifying user input
        if (
          node.closest('rich-textarea') ||
          node.closest('[contenteditable="true"]') ||
          node.closest('[role="textbox"]')
        ) {
          return;
        }
        fixBrokenBoldTags(node);
      });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
}
