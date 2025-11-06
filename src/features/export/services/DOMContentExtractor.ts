/**
 * DOM Content Extractor
 * Extracts rich content from Gemini's DOM structure preserving formatting
 */

export interface ExtractedContent {
  text: string;
  html: string;
  hasImages: boolean;
  hasFormulas: boolean;
  hasTables: boolean;
  hasCode: boolean;
}

export interface ExtractedTurn {
  user: ExtractedContent;
  assistant: ExtractedContent;
  starred: boolean;
}

/**
 * Extracts structured content from Gemini's DOM
 * Preserves formatting including LaTeX formulas, code blocks, tables, etc.
 */
export class DOMContentExtractor {
  private static DEBUG = false;
  /**
   * Extract user query content
   */
  static extractUserContent(element: HTMLElement): ExtractedContent {
    const result: ExtractedContent = {
      text: '',
      html: '',
      hasImages: false,
      hasFormulas: false,
      hasTables: false,
      hasCode: false,
    };

    // Check for images
    const images = element.querySelectorAll('user-query-file-preview img, .preview-image');
    result.hasImages = images.length > 0;

    // Extract text from query-text-line paragraphs
    const textLines = element.querySelectorAll('.query-text-line');
    const textParts: string[] = [];
    textLines.forEach((line) => {
      const text = this.normalizeText(line.textContent || '');
      if (text) textParts.push(text);
    });
    result.text = textParts.join('\n');

    // Build HTML representation
    const htmlParts: string[] = [];

    // Add image markdown
    const imageMarkdown: string[] = [];
    images.forEach((img, index) => {
      const src = (img as HTMLImageElement).src;
      const alt = (img as HTMLImageElement).alt || `Uploaded image ${index + 1}`;
      htmlParts.push(`<img src="${src}" alt="${alt}" />`);
      imageMarkdown.push(`![${alt}](${src})`);
    });

    // Combine image markdown and text
    const allTextParts: string[] = [];
    if (imageMarkdown.length > 0) {
      allTextParts.push(imageMarkdown.join('\n\n'));
    }
    if (textParts.length > 0) {
      allTextParts.push(textParts.join('\n'));
    }
    result.text = allTextParts.join('\n\n');

    // Add text paragraphs to HTML
    textParts.forEach((text) => {
      htmlParts.push(`<p>${this.escapeHtml(text)}</p>`);
    });

    result.html = htmlParts.join('\n');

    return result;
  }

  /**
   * Extract assistant response content with rich formatting
   */
  static extractAssistantContent(element: HTMLElement): ExtractedContent {
    if (this.DEBUG) console.log('[DOMContentExtractor] extractAssistantContent called, element:', element);

    const result: ExtractedContent = {
      text: '',
      html: '',
      hasImages: false,
      hasFormulas: false,
      hasTables: false,
      hasCode: false,
    };

    // Find message-content first (contains main text and formulas)
    let messageContent = element.querySelector('message-content');

    if (!messageContent) {
      // Try markdown container
      messageContent = element.querySelector(
        '.markdown-main-panel, ' +
          '.markdown, ' +
          '.model-response-text',
      );
    }

    // If still not found, check if element itself is a valid container
    if (!messageContent) {
      if (
        element.classList.contains('markdown') ||
        element.tagName.toLowerCase() === 'message-content'
      ) {
        messageContent = element;
      }
    }

    if (!messageContent) {
      // Last resort: use element directly
      console.warn('[DOMContentExtractor] Response container not found, using element directly');
      messageContent = element;
    }

    if (this.DEBUG) console.log('[DOMContentExtractor] Using container:', messageContent.tagName, messageContent.className);

    // Don't clone! Angular custom elements may lose content when cloned
    // Instead, skip model-thoughts during processNodes
    const htmlParts: string[] = [];
    const textParts: string[] = [];

    // STRATEGY CHANGE: Instead of recursing through DOM (which misses Angular-rendered elements),
    // process the .markdown div directly and then search for response-elements
    const markdownDiv = messageContent.querySelector('.markdown, .markdown-main-panel');

    if (this.DEBUG) {
      console.log('[DOMContentExtractor] messageContent tagName:', messageContent.tagName);
      console.log('[DOMContentExtractor] messageContent className:', messageContent.className);
      console.log('[DOMContentExtractor] markdownDiv found?', !!markdownDiv);
    }

    if (markdownDiv) {
      if (this.DEBUG) {
        console.log('[DOMContentExtractor] markdownDiv tagName:', markdownDiv.tagName);
        console.log('[DOMContentExtractor] markdownDiv className:', markdownDiv.className);
        console.log('[DOMContentExtractor] markdownDiv innerHTML preview:', (markdownDiv as HTMLElement).innerHTML.substring(0, 300));
      }

      // First, process all direct children of markdown that are NOT response-element
      this.processNodes(markdownDiv, htmlParts, textParts, result);

      // Note: response-element contents are processed by processNodes recursion above
    } else {
      // Fallback to old method
      if (this.DEBUG) console.log('[DOMContentExtractor] No markdown div found, using fallback');
      this.processNodes(messageContent, htmlParts, textParts, result);
    }

    // Additionally, look for code blocks and tables at the element level
    // These might be siblings to message-content in response-element containers
    // IMPORTANT: Angular may use Shadow DOM, so we need to search both light DOM and shadow DOM
    if (this.DEBUG) {
      console.log('[DOMContentExtractor] Searching for code blocks in:', element.tagName, element.className);
      console.log('[DOMContentExtractor] Element HTML preview:', element.outerHTML.substring(0, 200));
    }

    // Helper function to search in both light DOM and shadow DOM
    const searchAll = (root: Element, selector: string): Element[] => {
      const results: Element[] = [];

      // Search in light DOM
      results.push(...Array.from(root.querySelectorAll(selector)));

      // Search in shadow DOM recursively
      const searchShadow = (el: Element) => {
        const shadowRoot = (el as any).shadowRoot as ShadowRoot | null;
        if (shadowRoot) {
          console.log(`[DOMContentExtractor] Searching in Shadow DOM of`, el.tagName);
          results.push(...Array.from(shadowRoot.querySelectorAll(selector)));
        }

        // Recursively check children for shadow roots
        Array.from(el.children).forEach(searchShadow);
      };

      searchShadow(root);
      return results;
    };

    // Also search for raw code elements regardless of presence of code-block
    const altCodeBlocks = searchAll(messageContent, 'pre > code, [data-test-id="code-content"]');
    if (this.DEBUG) console.log('[DOMContentExtractor] Found', altCodeBlocks.length, 'raw code elements with alternative selector');
    altCodeBlocks.forEach((codeEl, idx) => {
      // Avoid duplicates if already processed
      if ((codeEl as any).processedByGV) return;
      // Skip if inside a code-block (already handled by processNodes)
      if (codeEl.closest && codeEl.closest('code-block')) return;
      if (this.DEBUG) console.log(`[DOMContentExtractor] Processing raw code element ${idx + 1}/${altCodeBlocks.length}`);
      const extracted = this.extractCodeFromCodeElement(codeEl as HTMLElement);
      if (extracted.text) {
        (codeEl as any).processedByGV = true;
        result.hasCode = true;
        htmlParts.push(extracted.html);
        textParts.push(`\n${extracted.text}\n`);
      }
    });
    // Note: tables and code-blocks were already processed via processNodes()

    result.html = htmlParts.join('\n');
    // Clean up multiple newlines but preserve intentional spacing
    let combinedText = textParts
      .join('')
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .trim();
    // Last-chance fallback: if no structured text captured, use plain innerText
    if (!combinedText) {
      const fallbackContainer =
        (messageContent as HTMLElement) ||
        (element.querySelector('message-content') as HTMLElement | null) ||
        (element as HTMLElement);
      try {
        const plain = (fallbackContainer as HTMLElement).innerText || fallbackContainer.textContent || '';
        combinedText = this.normalizeText(plain);
      } catch {
        /* ignore */
      }
    }
    result.text = combinedText;

    return result;
  }

  /**
   * Process DOM nodes recursively
   */
  private static processNodes(
    container: Element,
    htmlParts: string[],
    textParts: string[],
    flags: Pick<ExtractedContent, 'hasImages' | 'hasFormulas' | 'hasTables' | 'hasCode'>,
  ): void {
    const children = Array.from(container.children);
    if (this.DEBUG) console.log(`[DOMContentExtractor] processNodes: ${children.length} children in`, container.tagName, container.className);

    // Check for Shadow DOM
    const shadowRoot = (container as any).shadowRoot;
    if (shadowRoot) {
      if (this.DEBUG) console.log('[DOMContentExtractor] Found Shadow DOM! Processing shadow children');
      this.processNodes(shadowRoot, htmlParts, textParts, flags);
    }

    for (const child of children) {
      const tagName = child.tagName.toLowerCase();
      if (this.DEBUG) console.log('[DOMContentExtractor] Processing child:', tagName, child.className);

      // Skip certain elements
      if (this.shouldSkipElement(child)) {
        if (this.DEBUG) console.log('[DOMContentExtractor] Skipping element:', tagName);
        continue;
      }

      // Math block (display formula)
      if (child.classList.contains('math-block')) {
        const latex = child.getAttribute('data-math') || '';
        if (this.DEBUG) console.log('[DOMContentExtractor] Found math-block, latex:', latex);
        flags.hasFormulas = true;
        htmlParts.push(`<div class="math-block">$$${latex}$$</div>`);
        textParts.push(`\n$$\n${latex}\n$$\n`);
        continue;
      }

      // Code block (check for nested code-block first)
      const codeBlock = child.querySelector('code-block');
      if (tagName === 'code-block' || child.classList.contains('code-block') || codeBlock) {
        if (this.DEBUG) console.log('[DOMContentExtractor] Found code block!');
        const elementToExtract = (codeBlock || child) as HTMLElement;
        const codeContent = this.extractCodeBlock(elementToExtract);
        if (this.DEBUG) console.log('[DOMContentExtractor] Code content:', codeContent.text);
        if (codeContent.text) {
          flags.hasCode = true;
          htmlParts.push(codeContent.html);
          textParts.push(`\n${codeContent.text}\n`);
        }
        continue;
      }

      // Table block (check for nested table-block first)
      const tableBlock = child.querySelector('table-block');
      if (tagName === 'table-block' || tableBlock || child.querySelector('table')) {
        if (this.DEBUG) console.log('[DOMContentExtractor] Found table block!');
        const elementToExtract = (tableBlock || child) as HTMLElement;
        const tableContent = this.extractTable(elementToExtract);
        if (this.DEBUG) console.log('[DOMContentExtractor] Table content:', tableContent.text);
        if (tableContent.text) {
          // Only add if table was successfully extracted
          flags.hasTables = true;
          htmlParts.push(tableContent.html);
          textParts.push(`\n${tableContent.text}\n`);
        }
        continue;
      }

      // Horizontal rule
      if (tagName === 'hr') {
        htmlParts.push('<hr>');
        textParts.push('\n---\n');
        continue;
      }

      // Paragraph with possible inline formulas
      if (tagName === 'p') {
        const processed = this.processInlineContent(child as HTMLElement);
        if (processed.hasFormulas) flags.hasFormulas = true;
        htmlParts.push(`<p>${processed.html}</p>`);
        textParts.push(`${processed.text}\n`);
        continue;
      }

      // Headings
      if (/^h[1-6]$/.test(tagName)) {
        const text = this.extractTextWithInlineFormulas(child as HTMLElement);
        const level = tagName[1];
        htmlParts.push(`<h${level}>${text.html}</h${level}>`);
        textParts.push(`\n${'#'.repeat(parseInt(level))} ${text.text}\n`);
        continue;
      }

      // Lists
      if (tagName === 'ul' || tagName === 'ol') {
        const listContent = this.extractList(child as HTMLElement);
        htmlParts.push(listContent.html);
        textParts.push(`\n${listContent.text}\n`);
        continue;
      }

      // Generic containers - recurse into children
      if (
        tagName === 'response-element' ||
        tagName === 'div' ||
        tagName === 'section' ||
        tagName === 'article' ||
        child.classList.contains('horizontal-scroll-wrapper') ||
        child.classList.contains('table-block-component')
      ) {
        if (this.DEBUG) console.log('[DOMContentExtractor] Recursing into container:', tagName, child.className);
        // Recursively process children instead of extracting text directly
        this.processNodes(child, htmlParts, textParts, flags);
        continue;
      }

      // Default: extract text content for unknown inline elements
      const text = this.normalizeText(child.textContent || '');
      if (text) {
        // Only add text if it's not already processed by parent
        htmlParts.push(`<span>${this.escapeHtml(text)}</span>`);
        textParts.push(text);
      }
    }
  }

  /**
   * Check if element should be skipped
   */
  private static shouldSkipElement(element: Element): boolean {
    // Skip buttons, tooltips, and action elements
    if (element.tagName === 'BUTTON' || element.tagName === 'MAT-ICON') {
      return true;
    }

    // Skip model thoughts completely (including the toggle button)
    if (element.tagName === 'MODEL-THOUGHTS' || element.classList.contains('model-thoughts')) {
      return true;
    }

    // Skip action buttons and controls
    if (
      element.classList.contains('copy-button') ||
      element.classList.contains('action-button') ||
      element.classList.contains('table-footer') ||
      element.classList.contains('export-sheets-button') ||
      element.classList.contains('thoughts-header')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Process inline content (text with inline formulas)
   */
  private static processInlineContent(element: HTMLElement): { html: string; text: string; hasFormulas: boolean } {
    let hasFormulas = false;
    const htmlParts: string[] = [];
    const textParts: string[] = [];

    // Process all child nodes including text nodes
    const processNode = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.trim()) {
          htmlParts.push(this.escapeHtml(text));
          textParts.push(text);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;

        // Inline formula
        if (el.classList.contains('math-inline')) {
          const latex = el.getAttribute('data-math') || '';
          hasFormulas = true;
          htmlParts.push(`<span class="math-inline">$${latex}$</span>`);
          textParts.push(`$${latex}$`);
          return;
        }

        // Emphasis
        if (el.tagName === 'I' || el.tagName === 'EM') {
          const text = this.normalizeText(el.textContent || '');
          htmlParts.push(`<em>${this.escapeHtml(text)}</em>`);
          textParts.push(`*${text}*`);
          return;
        }

        // Strong
        if (el.tagName === 'B' || el.tagName === 'STRONG') {
          const text = this.normalizeText(el.textContent || '');
          htmlParts.push(`<strong>${this.escapeHtml(text)}</strong>`);
          textParts.push(`**${text}**`);
          return;
        }

        // Code
        if (el.tagName === 'CODE' && !el.closest('pre')) {
          const text = this.normalizeText(el.textContent || '');
          htmlParts.push(`<code>${this.escapeHtml(text)}</code>`);
          textParts.push(`\`${text}\``);
          return;
        }

        // Recurse for other elements
        Array.from(el.childNodes).forEach(processNode);
      }
    };

    Array.from(element.childNodes).forEach(processNode);

    return {
      html: htmlParts.join(''),
      text: textParts.join(''),
      hasFormulas,
    };
  }

  /**
   * Extract text with inline formulas
   */
  private static extractTextWithInlineFormulas(element: HTMLElement): { html: string; text: string } {
    const processed = this.processInlineContent(element);
    return { html: processed.html, text: processed.text };
  }

  /**
   * Extract code block content
   */
  private static extractCodeBlock(element: HTMLElement): { html: string; text: string } {
    const codeElement = element.querySelector('code[role="text"], code');
    const code = codeElement?.textContent || '';

    // Try to detect language from class or label
    let language = '';
    const langLabel = element.querySelector('.code-block-decoration');
    if (langLabel) {
      language = this.normalizeText(langLabel.textContent || '').toLowerCase();
    }

    return {
      html: `<pre><code class="language-${language}">${this.escapeHtml(code)}</code></pre>`,
      text: `\`\`\`${language}\n${code}\n\`\`\``,
    };
  }

  /**
   * Extract code directly from a <code> element (fallback path)
   */
  private static extractCodeFromCodeElement(codeEl: HTMLElement): { html: string; text: string } {
    const code = codeEl.textContent || '';
    // Try to infer language from class names like "language-python"
    let language = '';
    const className = (codeEl.getAttribute('class') || '').toLowerCase();
    const langMatch = className.match(/language-([a-z0-9]+)/i);
    if (langMatch) {
      language = langMatch[1];
    } else {
      // Try to find a nearby header label inside a surrounding code-block component
      const parentBlock = codeEl.closest('code-block') as HTMLElement | null;
      if (parentBlock) {
        const label = parentBlock.querySelector('.code-block-decoration');
        if (label) {
          language = this.normalizeText(label.textContent || '').toLowerCase();
        }
      }
    }
    return {
      html: `<pre><code class="language-${language}">${this.escapeHtml(code)}</code></pre>`,
      text: `\`\`\`${language}\n${code}\n\`\`\``,
    };
  }

  /**
   * Extract table content
   */
  private static extractTable(element: HTMLElement): { html: string; text: string } {
    // Accept either a container that holds a <table>, or a <table> element itself
    let table: HTMLTableElement | null = null;
    if (element.tagName && element.tagName.toLowerCase() === 'table') {
      table = element as HTMLTableElement;
    } else {
      table = element.querySelector('table') as HTMLTableElement | null;
    }
    if (!table) {
      return { html: '', text: '' };
    }

    // Extract HTML (clean version)
    const cleanTable = table.cloneNode(true) as HTMLElement;
    // Remove any action buttons
    cleanTable.querySelectorAll('button, mat-icon').forEach((el) => el.remove());

    // Convert to Markdown
    const rows: string[][] = [];
    const headerCells = Array.from(table.querySelectorAll('thead tr td, thead tr th'));
    if (headerCells.length > 0) {
      rows.push(headerCells.map((cell) => this.normalizeText(cell.textContent || '')));
    }

    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      rows.push(cells.map((cell) => this.normalizeText(cell.textContent || '')));
    });

    // Build Markdown table
    const markdownLines: string[] = [];
    if (rows.length > 0) {
      // Header
      markdownLines.push('| ' + rows[0].join(' | ') + ' |');
      markdownLines.push('| ' + rows[0].map(() => '---').join(' | ') + ' |');
      // Body
      for (let i = 1; i < rows.length; i++) {
        markdownLines.push('| ' + rows[i].join(' | ') + ' |');
      }
    } else {
      // Fallback: treat first tbody row as header if no thead present
      const firstBodyRow = table.querySelector('tbody tr');
      if (firstBodyRow) {
        const header = Array.from(firstBodyRow.querySelectorAll('td, th')).map((cell) =>
          this.normalizeText(cell.textContent || ''),
        );
        if (header.length > 0) {
          markdownLines.push('| ' + header.join(' | ') + ' |');
          markdownLines.push('| ' + header.map(() => '---').join(' | ') + ' |');
          const rest = Array.from(table.querySelectorAll('tbody tr')).slice(1);
          rest.forEach((row) => {
            const cells = Array.from(row.querySelectorAll('td, th')).map((cell) =>
              this.normalizeText(cell.textContent || ''),
            );
            markdownLines.push('| ' + cells.join(' | ') + ' |');
          });
        }
      }
    }

    return {
      html: cleanTable.outerHTML,
      text: markdownLines.join('\n'),
    };
  }

  /**
   * Extract list content
   */
  private static extractList(element: HTMLElement): { html: string; text: string } {
    const isOrdered = element.tagName === 'OL';
    const items = Array.from(element.querySelectorAll(':scope > li'));

    const textLines: string[] = [];
    items.forEach((item, index) => {
      const text = this.normalizeText(item.textContent || '');
      const prefix = isOrdered ? `${index + 1}. ` : '- ';
      textLines.push(prefix + text);
    });

    return {
      html: element.outerHTML,
      text: textLines.join('\n'),
    };
  }

  /**
   * Normalize whitespace in text
   */
  private static normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Escape HTML special characters
   */
  private static escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
