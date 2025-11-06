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
    console.log('[DOMContentExtractor] extractAssistantContent called, element:', element);

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

    console.log('[DOMContentExtractor] Using container:', messageContent.tagName, messageContent.className);

    // Clone and remove model-thoughts before processing
    const cloned = messageContent.cloneNode(true) as Element;
    cloned.querySelectorAll('model-thoughts, .model-thoughts').forEach((el) => el.remove());
    messageContent = cloned;

    const htmlParts: string[] = [];
    const textParts: string[] = [];

    // Process main content (text, formulas, etc.)
    this.processNodes(messageContent, htmlParts, textParts, result);

    // Additionally, look for code blocks and tables at the element level
    // These might be siblings to message-content in response-element containers
    const codeBlocks = element.querySelectorAll('code-block, .code-block');
    codeBlocks.forEach((codeBlock) => {
      console.log('[DOMContentExtractor] Found code block outside message-content!');
      const codeContent = this.extractCodeBlock(codeBlock as HTMLElement);
      if (codeContent.text) {
        result.hasCode = true;
        htmlParts.push(codeContent.html);
        textParts.push(`\n${codeContent.text}\n`);
      }
    });

    const tableBlocks = element.querySelectorAll('table-block, .table-block');
    tableBlocks.forEach((tableBlock) => {
      console.log('[DOMContentExtractor] Found table block outside message-content!');
      const tableContent = this.extractTable(tableBlock as HTMLElement);
      if (tableContent.text) {
        result.hasTables = true;
        htmlParts.push(tableContent.html);
        textParts.push(`\n${tableContent.text}\n`);
      }
    });

    result.html = htmlParts.join('\n');
    // Clean up multiple newlines but preserve intentional spacing
    result.text = textParts
      .join('')
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .trim();

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

    for (const child of children) {
      const tagName = child.tagName.toLowerCase();
      console.log('[DOMContentExtractor] Processing child:', tagName, child.className);

      // Skip certain elements
      if (this.shouldSkipElement(child)) {
        console.log('[DOMContentExtractor] Skipping element:', tagName);
        continue;
      }

      // Math block (display formula)
      if (child.classList.contains('math-block')) {
        const latex = child.getAttribute('data-math') || '';
        console.log('[DOMContentExtractor] Found math-block, latex:', latex);
        flags.hasFormulas = true;
        htmlParts.push(`<div class="math-block">$$${latex}$$</div>`);
        textParts.push(`\n$$\n${latex}\n$$\n`);
        continue;
      }

      // Code block (check for nested code-block first)
      const codeBlock = child.querySelector('code-block');
      if (tagName === 'code-block' || child.classList.contains('code-block') || codeBlock) {
        console.log('[DOMContentExtractor] Found code block!');
        const elementToExtract = (codeBlock || child) as HTMLElement;
        const codeContent = this.extractCodeBlock(elementToExtract);
        console.log('[DOMContentExtractor] Code content:', codeContent.text);
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
        console.log('[DOMContentExtractor] Found table block!');
        const elementToExtract = (tableBlock || child) as HTMLElement;
        const tableContent = this.extractTable(elementToExtract);
        console.log('[DOMContentExtractor] Table content:', tableContent.text);
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
        console.log('[DOMContentExtractor] Recursing into container:', tagName, child.className);
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
   * Extract table content
   */
  private static extractTable(element: HTMLElement): { html: string; text: string } {
    const table = element.querySelector('table');
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
