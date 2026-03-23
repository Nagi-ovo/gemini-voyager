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

const LOG_TAG = '[userLatex]';

/** Selector for user message text paragraph elements. */
const USER_MSG_SELECTOR = 'p.query-text-line';

type Segment = { kind: 'text'; value: string } | { kind: 'math'; value: string; display: boolean };

/**
 * Split text into plain-text and LaTeX ($$...$$, $...$) segments.
 * Display math ($$) takes priority over inline ($).
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
    const closeStr = display ? '$$' : '$';
    const closeIdx = text.indexOf(closeStr, i + openLen);

    if (closeIdx === -1) {
      // No closing delimiter — treat this $ as plain text and move on
      i++;
      continue;
    }

    // Flush accumulated plain text
    if (i > textStart) {
      out.push({ kind: 'text', value: text.slice(textStart, i) });
    }

    const mathValue = text.slice(i + openLen, closeIdx);
    out.push({ kind: 'math', value: mathValue, display });

    i = closeIdx + closeStr.length;
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

  console.log(`${LOG_TAG} found element with LaTeX:`, raw.slice(0, 100));

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
        console.log(
          `${LOG_TAG} rendered ${seg.display ? 'display' : 'inline'} math:`,
          seg.value.slice(0, 60),
        );
      } catch {
        // Fallback: show original delimiters
        span.textContent = seg.display ? `$$${seg.value}$$` : `$${seg.value}$`;
        console.warn(`${LOG_TAG} KaTeX render failed for:`, seg.value.slice(0, 60));
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
  console.log(`${LOG_TAG} observer started`);

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
