/**
 * `tableCopy` primitive: a copy toolbar above every table in a reply, which
 * copies the table as Markdown (the exporter's own table, formulas as LaTeX)
 * or as TSV for spreadsheets.
 *
 * Host safety: the table is never moved or edited. Each toolbar is one
 * shadow-root element right before its table; a table the host re-renders or
 * replaces gets a fresh toolbar on the next scan. Unmount removes every
 * toolbar, so the page is exactly as the host left it.
 */
import { createToaster } from '@/core/ui/toast/toaster';
import { onCachedLanguageChange } from '@/utils/i18n';

import type { ManifestIssue } from '../../manifest/validate';
import type { Dispose } from '../../runtime/pluginScope';
import { getPrimitiveContract } from '../contracts';
import type { Primitive } from '../types';
import { type TableCopyFormat, serializeTable } from './serialize';
import { type TableCopyToolbar, createTableCopyToolbar, tableCopyText } from './toolbar';

export interface TableCopyParams {
  readonly turn?: string;
  readonly table?: string;
}

const PARAM_NAMES: readonly string[] = ['turn', 'table'];
const MAX_SELECTOR_LENGTH = 2_000;
/** Streaming replies rebuild their tables; toolbars follow once the reply settles. */
const RESCAN_DELAY_MS = 300;
const TOAST_MS = 2_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function querySafe(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

function isTable(element: Element): element is HTMLTableElement {
  return element.localName === 'table';
}

export const tableCopyPrimitive: Primitive<TableCopyParams> = {
  contract: getPrimitiveContract('tableCopy')!,

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
    const turn = params.turn ?? adapter?.selectors.assistantTurn;
    if (!turn) return;
    const tableSelector = params.table ?? 'table';
    const thinking = adapter?.selectors.thinkingBlock;
    // Replies, not tables: a conversation without a table is not a plugin with no effect.
    context.setTargetCounter(() => querySafe(doc, turn).length);

    const toolbars = new Map<HTMLTableElement, TableCopyToolbar>();
    const hosts = new WeakSet<Node>();
    const toaster = createToaster();

    const copy = async (table: HTMLTableElement, format: TableCopyFormat): Promise<void> => {
      let copied = false;
      try {
        // Read on click, with no await before writeText, so the click still allows the write.
        const text = serializeTable(table, format);
        if (text) {
          await navigator.clipboard.writeText(text);
          copied = true;
        }
      } catch {
        // Clipboard permission denied or the API is missing: the toast says so.
      }
      toaster.show({
        message: tableCopyText(copied ? 'copied' : 'failed'),
        tone: copied ? 'success' : 'error',
        channel: 'table-copy',
        durationMs: TOAST_MS,
      });
    };

    const remove = (table: HTMLTableElement): void => {
      toolbars.get(table)?.host.remove();
      toolbars.delete(table);
    };

    const eligible = (table: HTMLTableElement): boolean =>
      !table.parentElement?.closest('table') && !(thinking && table.closest(thinking));

    const scan = (): void => {
      if (scope.isDisposed) return;
      for (const [table, toolbar] of Array.from(toolbars)) {
        if (!table.isConnected || toolbar.host.nextElementSibling !== table) remove(table);
      }
      for (const reply of querySafe(doc, turn)) {
        for (const table of querySafe(reply, tableSelector)) {
          if (!isTable(table) || toolbars.has(table) || !eligible(table)) continue;
          const toolbar = createTableCopyToolbar(doc, (format) => void copy(table, format));
          hosts.add(toolbar.host);
          table.before(toolbar.host);
          toolbars.set(table, toolbar);
        }
      }
    };

    // Registered first so it runs last: observers and timers are gone before toolbars go.
    scope.effect(
      () => () => {
        Array.from(toolbars.keys()).forEach(remove);
        toaster.destroy();
      },
      'tableCopy:remove-toolbars',
    );
    scope.effect(() => {
      const stop = onCachedLanguageChange(() => toolbars.forEach((toolbar) => toolbar.relabel()));
      return () => void stop();
    }, 'tableCopy:language');

    const ownNodes = (nodes: NodeList): boolean =>
      Array.from(nodes).every((node) => hosts.has(node));
    let rescan: Dispose | null = null;
    scope.observe(doc.body, { childList: true, subtree: true }, (records) => {
      if (scope.isDisposed) return;
      // Adding or removing a toolbar is a mutation too; only the host's own changes need a scan.
      if (records.every((record) => ownNodes(record.addedNodes) && ownNodes(record.removedNodes))) {
        return;
      }
      void rescan?.();
      rescan = scope.timer(scan, RESCAN_DELAY_MS);
    });
    scan();
  },
};
