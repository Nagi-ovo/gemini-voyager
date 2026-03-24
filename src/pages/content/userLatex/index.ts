/**
 * User Message LaTeX Renderer
 * Renders LaTeX math ($...$ and $$...$$) in user-typed messages.
 *
 * Target DOM structure (Gemini):
 *   span.user-query-bubble-with-background
 *     └─ span.horizontal-container
 *          └─ div.query-text.gds-body-l
 *               ├─ span.cdk-visually-hidden  ("你说" / "You said")
 *               └─ p.query-text-line.ng-star-inserted  ← processed here
 */
import katex from 'katex';

/** Selector for user message text paragraph elements. */
const USER_MSG_SELECTOR = 'p.query-text-line';

type Segment = { kind: 'text'; value: string } | { kind: 'math'; value: string; display: boolean };

/**
 * Check if a character is a digit, indicating a currency context (e.g. $5).
 */
function isDigit(ch: string | undefined): boolean {
  if (!ch) return false;
  return /\d/.test(ch);
}

/**
 * Split text into plain-text and LaTeX ($$...$$, $...$) segments.
 * Display math ($$) takes priority over inline ($).
 *
 * For inline math ($...$), we require:
 * - The opening $ must NOT be followed by a digit (to avoid matching $5, $3 etc.)
 * - The closing $ must NOT be preceded by a digit that follows a non-math pattern
 * - The content between delimiters must contain at least one non-digit character
 *   (pure numbers like $5$ are likely currency, not math)
 */
export function parseSegments(text: string): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  let textStart = 0;

  while (i < text.length) {
    if (text[i] !== '$') {
      i++;
      continue;
    }

    const display = text[i + 1] === '$';
    const openLen = display ? 2 : 1;

    // For inline math: skip if $ is immediately followed by a digit (likely currency)
    if (!display && isDigit(text[i + 1])) {
      i++;
      continue;
    }

    // For inline math, find a standalone $ (not part of $$)
    let closeIdx: number;
    if (display) {
      closeIdx = text.indexOf('$$', i + openLen);
    } else {
      closeIdx = -1;
      let search = i + openLen;
      while (search < text.length) {
        const idx = text.indexOf('$', search);
        if (idx === -1) break;
        // Skip if this $ is part of a $$ sequence
        if (text[idx + 1] === '$' || (idx > 0 && text[idx - 1] === '$')) {
          search = idx + 1;
          continue;
        }
        closeIdx = idx;
        break;
      }
    }

    if (closeIdx === -1) {
      // No closing delimiter — treat this $ as plain text and move on
      i++;
      continue;
    }

    const mathValue = text.slice(i + openLen, closeIdx);

    // For inline math: skip if content is empty or purely numeric (likely currency)
    if (!display && (!mathValue.trim() || /^\d+([.,]\d+)?$/.test(mathValue.trim()))) {
      i++;
      continue;
    }

    // Flush accumulated plain text
    if (i > textStart) {
      out.push({ kind: 'text', value: text.slice(textStart, i) });
    }

    out.push({ kind: 'math', value: mathValue, display });

    i = closeIdx + openLen;
    textStart = i;
  }

  // Remaining plain text
  if (textStart < text.length) {
    out.push({ kind: 'text', value: text.slice(textStart) });
  }

  return out;
}

/**
 * Render LaTeX in a single user message paragraph element.
 */
function processElement(el: HTMLElement): void {
  if (el.dataset.userLatexProcessed) return;

  const raw = el.textContent ?? '';

  // Quick exit: no $ means no LaTeX
  if (!raw.includes('$')) {
    el.dataset.userLatexProcessed = '1';
    return;
  }

  const segments = parseSegments(raw);
  const hasMath = segments.some((s) => s.kind === 'math');

  if (!hasMath) {
    el.dataset.userLatexProcessed = '1';
    return;
  }

  const frag = document.createDocumentFragment();

  for (const seg of segments) {
    if (seg.kind === 'text') {
      frag.appendChild(document.createTextNode(seg.value));
    } else {
      const span = document.createElement('span');
      span.className = seg.display ? 'gv-user-latex-display' : 'gv-user-latex-inline';
      try {
        span.innerHTML = katex.renderToString(seg.value, {
          displayMode: seg.display,
          throwOnError: false,
          output: 'html',
        });
      } catch {
        // Fallback: show original delimiters
        span.textContent = seg.display ? `$$${seg.value}$$` : `$${seg.value}$`;
      }
      frag.appendChild(span);
    }
  }

  // Replace element content with rendered output
  el.textContent = '';
  el.appendChild(frag);
  el.dataset.userLatexProcessed = '1';
}

/** Scan all currently visible user message lines. */
function processAll(): void {
  document.querySelectorAll<HTMLElement>(USER_MSG_SELECTOR).forEach(processElement);
}

let observer: MutationObserver | null = null;

/**
 * Start rendering LaTeX in user messages.
 * Processes existing messages immediately and watches for new ones.
 */
export function startUserLatex(): void {
  // Process messages already on the page
  processAll();

  if (observer) return;

  let debounceTimer: ReturnType<typeof setTimeout>;
  observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processAll, 300);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
