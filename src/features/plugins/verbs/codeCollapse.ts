/**
 * `codeCollapse` primitive: Gemini's long code block collapse
 * (`pages/content/codeBlockCollapse`) on another site's code blocks, through
 * the same engine, thresholds, toggle and labels. Blocks come from the
 * `codeBlock` param or the site adapter's `codeBlock`, inside its
 * `assistantTurn` and outside its `thinkingBlock`.
 *
 * Unlike Gemini, a long block starts collapsed: the plugin is opt-in to fold
 * them. The user's choice per block, and an expand-all / collapse-all, stand
 * while the reply streams. Collapsing only stamps classes, and this
 * primitive's stylesheet clips the code element with a fade, so the host's
 * code and copy controls stay as they were. Turning the plugin off removes the
 * toggles, the bar, the classes and the stylesheet.
 */
import {
  type CodeBlockCollapse,
  createCodeBlockCollapse,
} from '@/pages/content/codeBlockCollapse/engine';
import { onCachedLanguageChange } from '@/utils/i18n';

import type { ManifestIssue } from '../manifest/validate';
import { COLLAPSE_ALL_CLASS, createCollapseAllBar } from './codeCollapseAll';
import { getPrimitiveContract } from './contracts';
import type { Primitive } from './types';

export interface CodeCollapseParams {
  readonly codeBlock?: string;
  readonly code?: string;
  readonly action?: string;
}

const PARAM_NAMES: readonly string[] = ['codeBlock', 'code', 'action'];
const MAX_SELECTOR_LENGTH = 2_000;
const DEFAULT_CODE = 'pre';
const STYLE_ID = 'gv-code-collapse-style';

const PAGE_CSS = `
.gv-code-block-collapsed .gv-code-block-clip,
.gv-code-block-clip.gv-code-block-collapsed {
  max-height: clamp(240px, 38vh, 340px) !important;
  overflow-y: hidden !important;
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 72px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 72px), transparent);
}
.gv-code-block-toggle,
.${COLLAPSE_ALL_CLASS} button {
  box-sizing: border-box;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 6px;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color 160ms ease;
}
.gv-code-block-toggle:hover,
.${COLLAPSE_ALL_CLASS} button:hover:not(:disabled) {
  background: rgb(127 127 127 / 14%);
}
.gv-code-block-toggle:focus-visible,
.${COLLAPSE_ALL_CLASS} button:focus-visible {
  outline: 2px solid var(--gv-pm-brand, currentcolor);
  outline-offset: 1px;
}
.gv-code-block-toggle svg,
.${COLLAPSE_ALL_CLASS} svg {
  width: 16px;
  height: 16px;
  pointer-events: none;
}
.${COLLAPSE_ALL_CLASS} {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin: 8px 0 4px;
}
.${COLLAPSE_ALL_CLASS} button:disabled {
  opacity: 0.45;
  cursor: default;
}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function first(root: Element, selector: string): HTMLElement | null {
  try {
    return root.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

function within(element: Element, selector: string): boolean {
  try {
    return element.closest(selector) !== null;
  } catch {
    return false;
  }
}

export const codeCollapsePrimitive: Primitive<CodeCollapseParams> = {
  contract: getPrimitiveContract('codeCollapse')!,

  validateParams(raw: unknown) {
    if (raw !== undefined && !isRecord(raw)) {
      return { success: false, error: [{ path: 'params', message: 'must be an object' }] };
    }
    const issues: ManifestIssue[] = [];
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw ?? {})) {
      if (!PARAM_NAMES.includes(key)) {
        issues.push({ path: `params.${key}`, message: 'unknown parameter' });
      } else if (typeof value !== 'string' || !value.trim() || value.length > MAX_SELECTOR_LENGTH) {
        issues.push({ path: `params.${key}`, message: 'must be a non-empty selector' });
      } else {
        params[key] = value;
      }
    }
    return issues.length > 0 ? { success: false, error: issues } : { success: true, data: params };
  },

  activate(scope, params, context) {
    const { doc, adapter } = context;
    const turn = adapter?.selectors.assistantTurn;
    const hostSelector = params.codeBlock ?? adapter?.selectors.codeBlock;
    if (!turn || !hostSelector) return;
    const thinking = adapter?.selectors.thinkingBlock;
    context.setTargetCounter(() => doc.querySelectorAll(turn).length);

    let engine: CodeBlockCollapse | null = null;
    const bar = createCollapseAllBar(doc, () => engine!);
    engine = createCodeBlockCollapse({
      root: () => doc.body,
      hostSelector,
      accepts: (host) =>
        within(host, turn) && !(thinking && within(host, thinking)) && !host.isContentEditable,
      code: (host) => first(host, params.code ?? DEFAULT_CODE) ?? host,
      actions(host) {
        const action = params.action ? first(host, params.action) : null;
        if (action?.parentElement) return action.parentElement;
        // No button row: the toggle goes at the end of the block, never inside the code itself.
        return first(host, params.code ?? DEFAULT_CODE) ? host : null;
      },
      clip: (_host, code) => code,
      collapseByDefault: true,
      onChange: () => bar.sync(),
    });
    const running = engine;

    // One effect owns the whole lifetime, so unmount restores the page in one synchronous step.
    scope.effect(() => {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = PAGE_CSS;
      doc.head.append(style);
      running.start();
      const stopFollowingLanguage = onCachedLanguageChange(() => {
        running.relabel();
        bar.relabel();
      });
      return () => {
        stopFollowingLanguage();
        running.stop();
        bar.remove();
        style.remove();
      };
    }, 'code-collapse');
    // No settings: a settings change must not restart it and drop the user's choices.
    return { updateSettings() {} };
  },
};
