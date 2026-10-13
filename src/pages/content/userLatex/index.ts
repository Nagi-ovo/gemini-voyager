/**
 * User Message LaTeX Renderer
 * Renders LaTeX math ($...$ and $$...$$) in user-typed messages.
 *
 * `renderUserLatex` / `restoreUserLatex` are site-neutral; the `userLatex`
 * public primitive drives them on Gemini and catalog sites.
 *
 * Target DOM structure (Gemini):
 *   span.user-query-bubble-with-background
 *     └─ span.horizontal-container
 *          └─ div.query-text.gds-body-l
 *               ├─ span.cdk-visually-hidden  ("你说" / "You said")
 *               └─ p.query-text-line.ng-star-inserted  ← processed here
 */
import { ensureKatexStyles } from '@/core/utils/katexStyles';
import { USER_LATEX_OWNER_ATTRIBUTE, hasUserLatexRendering } from '@/core/utils/userLatexSource';

/**
 * Lazily loaded KaTeX instance. KaTeX is only needed when a user message
 * actually contains LaTeX, so it is dynamically imported to keep it out of the
 * synchronously-loaded content-script chunk (mirrors loadMermaid()).
 */
let katexInstance: (typeof import('katex'))['default'] | null = null;
let katexLoadFailed = false;
let katexLoaderForTest: (() => Promise<typeof import('katex')>) | null = null;

/**
 * Reset internal loader state. Only for testing.
 * @internal
 */
export const _resetUserLatexKatexLoader = (): void => {
  katexInstance = null;
  katexLoadFailed = false;
  katexLoaderForTest = null;
};

/**
 * Override the KaTeX loader. Only for testing async load races.
 * @internal
 */
export const _setUserLatexKatexLoaderForTest = (
  loader: (() => Promise<typeof import('katex')>) | null,
): void => {
  katexInstance = null;
  katexLoadFailed = false;
  katexLoaderForTest = loader;
};

const loadKatex = async (): Promise<typeof katexInstance> => {
  ensureKatexStyles();
  if (katexInstance) return katexInstance;
  if (katexLoadFailed) return null;

  try {
    const mod = await (katexLoaderForTest ? katexLoaderForTest() : import('katex'));
    katexInstance = mod.default;
    return katexInstance;
  } catch (error) {
    katexLoadFailed = true;
    console.error('[Gemini Voyager] Failed to load KaTeX for user LaTeX:', error);
    return null;
  }
};

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

/** The nodes a render replaced, put back by {@link restoreUserLatex}. */
const replacedNodes = new WeakMap<HTMLElement, Node[]>();

/** Lets go of `el` when `owner` holds it, so another renderer may take it. */
function releaseUserLatex(el: HTMLElement, owner: string): void {
  if (el.getAttribute(USER_LATEX_OWNER_ATTRIBUTE) !== owner) return;
  el.removeAttribute(USER_LATEX_OWNER_ATTRIBUTE);
  delete el.dataset.userLatexProcessed;
}

/** The first Voyager (`gv-`) class of a node, or null for the host's own nodes. */
function voyagerClass(node: Node): string | null {
  if (!(node instanceof Element)) return null;
  return Array.from(node.classList).find((name) => name.startsWith('gv-')) ?? null;
}

/**
 * The nodes to put back over a rendering. A Voyager decoration that was in the
 * line before the render (a quote marker) comes back only while its feature
 * still decorates the line: if that feature was torn down meanwhile, it already
 * turned its live copy back into text, so the saved one returns as text too.
 */
function nodesToRestore(el: HTMLElement, saved: readonly Node[]): Node[] {
  return saved.map((node) => {
    const decoration = voyagerClass(node);
    if (!decoration || el.getElementsByClassName(decoration).length > 0) return node;
    return el.ownerDocument.createTextNode(node.textContent ?? '');
  });
}

/** Undo a rendering whoever made it: the element's text and markers go back. */
function clearUserLatex(el: HTMLElement): void {
  const original = el.dataset.userLatexOriginal;
  // Only over our own rendering: after a host repaint the element already holds the host's text.
  if (original !== undefined && hasUserLatexRendering(el)) {
    const saved = replacedNodes.get(el);
    el.replaceChildren(
      ...(saved ? nodesToRestore(el, saved) : [el.ownerDocument.createTextNode(original)]),
    );
  }
  replacedNodes.delete(el);
  delete el.dataset.userLatexOriginal;
  delete el.dataset.userLatexProcessed;
  el.removeAttribute(USER_LATEX_OWNER_ATTRIBUTE);
}

/**
 * Forget a rendering the host has since painted over, so its source no longer
 * describes the element and the next render reads the host's new text.
 * Whoever rendered it: nobody's rendering is on the element any more.
 */
export function dropStaleUserLatex(el: HTMLElement): void {
  if (el.dataset.userLatexOriginal !== undefined && !hasUserLatexRendering(el)) {
    clearUserLatex(el);
  }
}

/**
 * Every element one renderer has claimed, kept so its stop can put back and
 * release even those the host detached meanwhile: a scan of the document
 * misses them, and a detached line the host re-inserts later would otherwise
 * keep the stopped renderer's claim and its rendering for good. Held weakly,
 * so a line the host dropped for good is not kept alive by this list.
 */
export interface UserLatexClaims {
  /** Called by {@link renderUserLatex} the moment it claims `el`. */
  add(el: HTMLElement): void;
  /** Forget elements that are gone or no longer held by this owner. */
  prune(): void;
  /** Put back and release every element this owner still holds, attached or not. */
  restoreAll(): void;
}

export function createUserLatexClaims(owner: string): UserLatexClaims {
  const claimed = new Set<WeakRef<HTMLElement>>();
  return {
    add(el) {
      claimed.add(new WeakRef(el));
    },
    prune() {
      for (const ref of claimed) {
        const el = ref.deref();
        if (!el || el.getAttribute(USER_LATEX_OWNER_ATTRIBUTE) !== owner) claimed.delete(ref);
      }
    },
    restoreAll() {
      for (const ref of claimed) {
        const el = ref.deref();
        if (el) restoreUserLatex(el, owner);
      }
      claimed.clear();
    },
  };
}

/**
 * Whether a renderer other than `owner` holds an element around or inside
 * `el`, its claim still waiting for KaTeX included: the owner attribute goes on
 * before KaTeX loads, the rendering only after.
 */
function heldAroundByOther(el: HTMLElement, owner: string): boolean {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const holder = node.getAttribute(USER_LATEX_OWNER_ATTRIBUTE);
    if (holder !== null && holder !== owner) return true;
  }
  for (const node of el.querySelectorAll(`[${USER_LATEX_OWNER_ATTRIBUTE}]`)) {
    if (node.getAttribute(USER_LATEX_OWNER_ATTRIBUTE) !== owner) return true;
  }
  return false;
}

export interface UserLatexRenderOptions {
  /** The renderer's token (`createUserLatexOwner`); an element another token holds is left alone. */
  readonly owner: string;
  /** Once aborted, a render still waiting for KaTeX lets the element go untouched. */
  readonly signal?: AbortSignal;
  /** Asked after KaTeX loads; false lets the element go untouched. */
  readonly canReplace?: () => boolean;
  /** Told of the claim, so the renderer's stop reaches the element even once it is detached. */
  readonly claims?: UserLatexClaims;
}

/**
 * Render LaTeX in a single user message paragraph element. The element is
 * claimed for `owner` before anything else changes and stays claimed while
 * KaTeX loads; a failed load, an abort, a repaint or `canReplace` saying no
 * releases it without touching its text. An element inside or around one
 * another renderer holds is left alone, so a whole line and a leaf in it are
 * never both claimed.
 */
export async function renderUserLatex(
  el: HTMLElement,
  { owner, signal, canReplace, claims }: UserLatexRenderOptions,
): Promise<void> {
  // An edited message repainted over the same element would otherwise keep its old source forever.
  dropStaleUserLatex(el);
  // Processed and owner are set and cleared together: a processed element is someone's.
  if (el.dataset.userLatexProcessed) return;
  // A whole line over another renderer's formula would save that formula's KaTeX text as its source.
  if (heldAroundByOther(el, owner)) return;

  const raw = el.textContent ?? '';

  // Claimed up-front, lines without math included, so the debounced observer
  // can't re-enter this element while KaTeX is loading and no other renderer
  // takes a line this one will put back.
  el.setAttribute(USER_LATEX_OWNER_ATTRIBUTE, owner);
  el.dataset.userLatexProcessed = '1';
  claims?.add(el);

  // Quick exit: no $ means no LaTeX
  if (!raw.includes('$')) return;

  const segments = parseSegments(raw);
  if (!segments.some((s) => s.kind === 'math')) return;

  const katex = await loadKatex();
  // Load failed: leave the original "$...$" text, and the element free for another try.
  if (!katex || signal?.aborted) {
    releaseUserLatex(el, owner);
    return;
  }
  // Restored (or taken over after a repaint) while KaTeX loaded: no longer ours to render.
  if (el.getAttribute(USER_LATEX_OWNER_ATTRIBUTE) !== owner) return;

  // If Gemini repainted this node while KaTeX was loading, the captured `raw`
  // (and its segments) are stale. Bail and let a later observer pass reprocess
  // the fresh content instead of clobbering it with the old rendering.
  // Same text can still be a different element now (an inline editor took its place).
  if (el.textContent !== raw || (canReplace && !canReplace())) {
    releaseUserLatex(el, owner);
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
  replacedNodes.set(el, Array.from(el.childNodes));
  el.textContent = '';
  el.appendChild(frag);
}

/** Undo {@link renderUserLatex} on an element `owner` holds, putting the host's own text nodes back. */
export function restoreUserLatex(el: HTMLElement, owner: string): void {
  if (el.getAttribute(USER_LATEX_OWNER_ATTRIBUTE) !== owner) return;
  clearUserLatex(el);
}
