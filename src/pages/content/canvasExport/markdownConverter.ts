/**
 * Convert the Gemini Canvas (immersive-editor) ProseMirror DOM to plain Markdown.
 *
 * The ProseMirror tree uses ordinary HTML elements (h1-h6, p, strong, em, code,
 * ul/ol/li, blockquote, pre > code, a, img, hr, br), so we walk the DOM and emit
 * CommonMark-style text.  We keep the converter minimal on purpose — Canvas
 * currently only produces these primitives, and leaning on a full HTML→MD library
 * would pull unnecessary weight into the content script bundle.
 */

const VOID_INLINE_TAGS = new Set(['BR']);

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function renderChildren(node: Node): string {
  let out = '';
  node.childNodes.forEach((child) => {
    out += renderNode(child);
  });
  return out;
}

function renderInlineChildren(node: Node): string {
  return renderChildren(node);
}

function renderListItems(list: HTMLElement, ordered: boolean): string {
  const items = Array.from(list.children).filter((el): el is HTMLLIElement => el.tagName === 'LI');
  const lines: string[] = [];

  items.forEach((item, index) => {
    const marker = ordered ? `${index + 1}.` : '-';
    const raw = renderListItemContent(item);
    const [first, ...rest] = raw.split('\n');
    lines.push(`${marker} ${first ?? ''}`.trimEnd());
    for (const line of rest) {
      lines.push(line ? `   ${line}` : '');
    }
  });

  return lines.join('\n');
}

function renderListItemContent(li: HTMLLIElement): string {
  const segments: string[] = [];
  let inlineBuffer = '';

  const flushInline = () => {
    if (inlineBuffer.trim().length > 0) {
      segments.push(inlineBuffer.replace(/\s+$/, ''));
    }
    inlineBuffer = '';
  };

  li.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      inlineBuffer += collapseWhitespace(child.textContent || '');
      return;
    }
    if (!(child instanceof HTMLElement)) return;

    const tag = child.tagName;
    if (tag === 'UL' || tag === 'OL') {
      flushInline();
      segments.push(renderListItems(child, tag === 'OL'));
      return;
    }
    if (tag === 'P') {
      flushInline();
      const text = renderInlineChildren(child).trim();
      if (text) segments.push(text);
      return;
    }
    inlineBuffer += renderNode(child);
  });

  flushInline();
  return segments.join('\n').trimEnd();
}

function renderCodeBlock(pre: HTMLElement): string {
  const codeEl = pre.querySelector('code');
  const langCandidate = codeEl?.className.match(/language-([\w-]+)/)?.[1] ?? '';
  const text = (codeEl?.textContent ?? pre.textContent ?? '').replace(/\s+$/, '');
  return `\n\n\`\`\`${langCandidate}\n${text}\n\`\`\`\n\n`;
}

function renderTable(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((cell) =>
      collapseWhitespace(renderInlineChildren(cell)).trim().replace(/\|/g, '\\|'),
    ),
  );
  if (rows.length === 0) return '';
  const columnCount = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) => {
    while (r.length < columnCount) r.push('');
    return r;
  });
  const [head, ...body] = normalized;
  const lines: string[] = [];
  lines.push(`| ${head.join(' | ')} |`);
  lines.push(`| ${head.map(() => '---').join(' | ')} |`);
  body.forEach((r) => lines.push(`| ${r.join(' | ')} |`));
  return `\n\n${lines.join('\n')}\n\n`;
}

function renderNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return collapseWhitespace(node.textContent || '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName;

  if (VOID_INLINE_TAGS.has(tag)) {
    return '  \n';
  }

  switch (tag) {
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6': {
      const level = Number(tag.slice(1));
      const text = renderInlineChildren(el).trim();
      return `\n\n${'#'.repeat(level)} ${text}\n\n`;
    }
    case 'P': {
      const text = renderInlineChildren(el).trim();
      return text ? `\n\n${text}\n\n` : '\n\n';
    }
    case 'STRONG':
    case 'B': {
      const text = renderInlineChildren(el).trim();
      return text ? `**${text}**` : '';
    }
    case 'EM':
    case 'I': {
      const text = renderInlineChildren(el).trim();
      return text ? `*${text}*` : '';
    }
    case 'CODE': {
      if (el.parentElement?.tagName === 'PRE') {
        return el.textContent ?? '';
      }
      const text = el.textContent ?? '';
      return text ? `\`${text}\`` : '';
    }
    case 'PRE':
      return renderCodeBlock(el);
    case 'BLOCKQUOTE': {
      const inner = renderChildren(el).trim();
      const quoted = inner
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
      return `\n\n${quoted}\n\n`;
    }
    case 'UL':
      return `\n\n${renderListItems(el, false)}\n\n`;
    case 'OL':
      return `\n\n${renderListItems(el, true)}\n\n`;
    case 'LI':
      return renderListItemContent(el as HTMLLIElement);
    case 'A': {
      const href = el.getAttribute('href') || '';
      const text = renderInlineChildren(el).trim();
      if (!href) return text;
      return `[${text || href}](${href})`;
    }
    case 'IMG': {
      const alt = el.getAttribute('alt') || '';
      const src = el.getAttribute('src') || '';
      return src ? `![${alt}](${src})` : '';
    }
    case 'HR':
      return '\n\n---\n\n';
    case 'DIV':
    case 'SPAN':
    case 'SECTION':
    case 'ARTICLE':
      return renderChildren(el);
    case 'TABLE':
      return renderTable(el);
    default:
      return renderChildren(el);
  }
}

/**
 * Convert a ProseMirror root element to Markdown text.
 */
export function convertCanvasDomToMarkdown(root: Element): string {
  if (!root) return '';
  const raw = renderChildren(root);
  return raw
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[\s\n]+|[\s\n]+$/g, '')
    .concat('\n');
}
