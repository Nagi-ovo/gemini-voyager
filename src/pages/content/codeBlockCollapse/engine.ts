/**
 * Site-agnostic engine behind long code block collapse: Gemini's native
 * feature (`index.ts`) and the `codeCollapse` plugin primitive
 * (`features/plugins/verbs/codeCollapse.ts`) both drive it with a
 * {@link CodeBlockCollapseSite} that says where a site keeps its blocks.
 *
 * A block is long at {@link LONG_CODE_BLOCK_MIN_LINES} lines or
 * {@link LONG_CODE_BLOCK_MIN_HEIGHT}px of rendered code. A long block gets the
 * collapsible class and an icon-only toggle in its actions; collapsing only
 * toggles a class on the block, so CSS does the clipping and the host's code
 * and copy controls are never touched. The state lives on the block element,
 * so a host that swaps the `pre` inside (highlighting, streaming) keeps it.
 *
 * Work is incremental: after the first scan, a mutation only queues the block
 * it happened in (or blocks it added), and a debounced flush measures those
 * blocks before writing to any of them.
 */
import {
  CODE_BLOCK_CLIP_CLASS,
  CODE_BLOCK_COLLAPSED_CLASS,
  CODE_BLOCK_COLLAPSIBLE_CLASS,
  addClass,
  createToggle,
  isCollapsed,
  removeClasses,
  updateToggle,
} from './toggle';

export const LONG_CODE_BLOCK_MIN_LINES = 24;
export const LONG_CODE_BLOCK_MIN_HEIGHT = 520;
const SCAN_DEBOUNCE_MS = 120;

export interface CodeBlockCollapseSite {
  /** Element observed for new and changing blocks. */
  root(): HTMLElement;
  /** One code block: the element that carries the collapsed state. */
  readonly hostSelector: string;
  /** Whether a matched block is one this site collapses (scope, diagrams, …). */
  accepts(host: HTMLElement): boolean;
  /** The element holding the code text, measured for length. */
  code(host: HTMLElement): HTMLElement | null;
  /** Where the toggle goes; null leaves the block alone. */
  actions(host: HTMLElement): HTMLElement | null;
  /** The element to mark with the clip class, when the site's CSS clips by class. */
  clip?(host: HTMLElement, code: HTMLElement): HTMLElement | null;
  /** Collapse a block when it first turns long, until the user expands it. */
  readonly collapseByDefault?: boolean;
  /** Runs after a pass or a toggle may have changed which blocks are collapsible or collapsed. */
  onChange?(): void;
}

export interface CodeBlockCollapse {
  start(): void;
  enhance(host: HTMLElement): void;
  process(root?: ParentNode): void;
  /** Collapsible blocks, in no particular order. */
  blocks(): HTMLElement[];
  /** Collapses or expands every collapsible block, and every block that turns long later. */
  setAllCollapsed(collapsed: boolean): void;
  /** Re-reads the toggle labels after the Voyager language changes. */
  relabel(): void;
  stop(): void;
}

interface ManagedBlock {
  button: HTMLButtonElement | null;
  clip: HTMLElement | null;
}

interface Measurement {
  host: HTMLElement;
  code: HTMLElement | null;
  actions: HTMLElement | null;
  shouldEnhance: boolean;
}

function lineCount(text: string): number {
  if (!text) return 0;
  return text.split(/\r\n?|\n/).length;
}

export function isLongCodeBlock(code: HTMLElement): boolean {
  if (lineCount(code.textContent ?? '') >= LONG_CODE_BLOCK_MIN_LINES) return true;

  const pre = code.closest('pre');
  const renderedHeight = Math.max(
    code.scrollHeight,
    pre instanceof HTMLElement ? pre.scrollHeight : 0,
  );

  return renderedHeight >= LONG_CODE_BLOCK_MIN_HEIGHT;
}

export function createCodeBlockCollapse(site: CodeBlockCollapseSite): CodeBlockCollapse {
  const managed = new Map<HTMLElement, ManagedBlock>();
  // The user's choice outlives the block's eligibility, so a block that turns
  // short and long again (threshold, re-render) comes back as they left it.
  const decisions = new WeakMap<HTMLElement, boolean>();
  const observed = new Set<HTMLElement>();
  const pending = new Set<HTMLElement>();
  let defaultCollapsed = site.collapseByDefault ?? false;
  let observer: MutationObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let scanTimer: number | null = null;

  const setCollapsed = (host: HTMLElement, collapsed: boolean): void => {
    decisions.set(host, collapsed);
    if (collapsed) addClass(host, CODE_BLOCK_COLLAPSED_CLASS);
    else removeClasses(host, CODE_BLOCK_COLLAPSED_CLASS);
    const button = managed.get(host)?.button;
    if (button) updateToggle(host, button);
  };

  const removeEnhancement = (host: HTMLElement): void => {
    const block = managed.get(host);
    block?.button?.remove();
    if (block?.clip) removeClasses(block.clip, CODE_BLOCK_CLIP_CLASS);
    managed.delete(host);
    removeClasses(host, CODE_BLOCK_COLLAPSIBLE_CLASS, CODE_BLOCK_COLLAPSED_CLASS);
  };

  const observeBlock = (host: HTMLElement): void => {
    if (!resizeObserver || observed.has(host)) return;
    resizeObserver.observe(host);
    observed.add(host);
  };

  const measure = (host: HTMLElement): Measurement => {
    observeBlock(host);
    const code = site.code(host);
    const actions = code ? site.actions(host) : null;
    return {
      host,
      code,
      actions,
      shouldEnhance: Boolean(code && actions && site.accepts(host) && isLongCodeBlock(code)),
    };
  };

  const apply = ({ host, code, actions, shouldEnhance }: Measurement): void => {
    if (!shouldEnhance || !actions || !code) {
      removeEnhancement(host);
      return;
    }

    let block = managed.get(host);
    if (!block) {
      block = { button: null, clip: null };
      managed.set(host, block);
      if (decisions.get(host) ?? defaultCollapsed) addClass(host, CODE_BLOCK_COLLAPSED_CLASS);
    }
    addClass(host, CODE_BLOCK_COLLAPSIBLE_CLASS);

    let button = block.button;
    if (!button || !button.isConnected || button.parentElement !== actions) {
      button?.remove();
      button = createToggle(host.ownerDocument, () => {
        setCollapsed(host, !isCollapsed(host));
        site.onChange?.();
      });
      actions.appendChild(button);
      block.button = button;
    }

    const clip = site.clip?.(host, code) ?? null;
    if (block.clip !== clip) {
      if (block.clip) removeClasses(block.clip, CODE_BLOCK_CLIP_CLASS);
      if (clip) addClass(clip, CODE_BLOCK_CLIP_CLASS);
      block.clip = clip;
    }

    updateToggle(host, button);
  };

  const cleanupDisconnectedBlocks = (): void => {
    // oxlint-disable-next-line unicorn/no-useless-spread -- snapshot: the loop body mutates the collection
    for (const host of [...observed]) {
      if (host.isConnected) continue;
      resizeObserver?.unobserve(host);
      observed.delete(host);
    }
    for (const host of Array.from(managed.keys())) {
      if (!host.isConnected) removeEnhancement(host);
    }
  };

  const enhance = (host: HTMLElement): void => apply(measure(host));

  const process = (root: ParentNode = site.root()): void => {
    root.querySelectorAll<HTMLElement>(site.hostSelector).forEach(enhance);
    cleanupDisconnectedBlocks();
    site.onChange?.();
  };

  const flushPending = (): void => {
    const measurements = [...pending].filter((host) => host.isConnected).map(measure);
    pending.clear();

    // Finish every layout read before adding/removing buttons and classes. This
    // prevents one block's DOM write from forcing the next block's measurement.
    measurements.forEach(apply);
    cleanupDisconnectedBlocks();
    site.onChange?.();
  };

  const schedulePendingFlush = (): void => {
    if (scanTimer !== null) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      flushPending();
    }, SCAN_DEBOUNCE_MS);
  };

  const collectContaining = (node: Node): void => {
    const element = node instanceof Element ? node : node.parentElement;
    const host = element?.closest<HTMLElement>(site.hostSelector);
    if (host) pending.add(host);
  };

  const collectAdded = (node: Node): void => {
    if (!(node instanceof Element)) return;
    if (node.matches(site.hostSelector)) pending.add(node as HTMLElement);
    node.querySelectorAll<HTMLElement>(site.hostSelector).forEach((host) => pending.add(host));
  };

  const onMutations = (records: MutationRecord[]): void => {
    for (const record of records) {
      collectContaining(record.target);
      record.addedNodes.forEach(collectAdded);
    }
    schedulePendingFlush();
  };

  const stop = (): void => {
    observer?.disconnect();
    observer = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (scanTimer !== null) {
      window.clearTimeout(scanTimer);
      scanTimer = null;
    }
    pending.clear();
    observed.clear();
    for (const host of Array.from(managed.keys())) removeEnhancement(host);
  };

  return {
    start() {
      stop();
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (entry.target instanceof HTMLElement && entry.target.matches(site.hostSelector)) {
              pending.add(entry.target);
            }
          }
          if (pending.size > 0) schedulePendingFlush();
        });
      }
      const root = site.root();
      process(root);
      observer = new MutationObserver(onMutations);
      observer.observe(root, { childList: true, subtree: true, characterData: true });
    },
    enhance,
    process,
    blocks: () => Array.from(managed.keys()),
    setAllCollapsed(collapsed) {
      defaultCollapsed = collapsed;
      for (const host of managed.keys()) setCollapsed(host, collapsed);
      site.onChange?.();
    },
    relabel() {
      for (const [host, block] of managed) if (block.button) updateToggle(host, block.button);
    },
    stop,
  };
}
