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
 * Detect a currency-like pattern starting at position i (the `$`).
 * Matches: $5, $3.50, $1,000, $100K — i.e. $ followed by digits (with
 * optional comma/period grouping) and then a word boundary (space, end,
 * punctuation, or closing $).
 *
 * Returns the index to resume scanning from, or -1 if not currency.
 */
function tryCurrencySkip(text: string, i: number): number {
  let j = i + 1;
  if (j >= text.length || !/\d/.test(text[j])) return -1;

  // Consume digits, commas, periods (e.g. 1,000.50)
  while (j < text.length && /[\d,.]/.test(text[j])) j++;

  // After the numeric part, check what follows:
  const next = text[j] as string | undefined;
  // Currency if followed by: end of string, space, punctuation, or closing $
  if (next === undefined || /[\s,;:!?)}\]]/.test(next)) return j;
  // $5$ pattern — closing $ followed by non-$
  if (next === '$' && text[j + 1] !== '$') return j + 1;

  // Common currency suffixes: $100K, $5M, $2B, $5m, $1k, $3T
  // Accept if a single letter suffix is followed by a word boundary
  if (next && /[KkMmBbTt]/.test(next)) {
    const afterSuffix = text[j + 1] as string | undefined;
    if (afterSuffix === undefined || /[\s,;:!?)}\]]/.test(afterSuffix)) return j + 1;
    if (afterSuffix === '$' && text[j + 2] !== '$') return j + 2;
  }

  // Followed by a letter/operator/backslash → likely math (e.g. $2x+1$, $10^2$)
  return -1;
}

/**
 * Split text into plain-text and LaTeX ($$...$$, $...$) segments.
 * Display math ($$) takes priority over inline ($).
 *
 * Currency amounts ($5, $3.50, $1,000) are detected by lookahead after
 * the digit sequence. Math that starts with digits ($2x+1$, $10^2$) is
 * correctly parsed because the digit sequence is followed by a non-boundary
 * character.
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

    // For inline $, try to detect currency patterns before searching for closing $
    if (!display) {
      const skipTo = tryCurrencySkip(text, i);
      if (skipTo !== -1) {
        i = skipTo;
        continue;
      }
    }

    // Find the closing delimiter
    let closeIdx: number;
    if (display) {
      closeIdx = text.indexOf('$$', i + openLen);
    } else {
      // Find a standalone $ (not part of $$)
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

    // Skip empty content
    if (!display && !mathValue.trim()) {
      i = closeIdx + 1;
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

  // Preserve original text for downstream features (export, timeline)
  el.dataset.userLatexOriginal = raw;
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
