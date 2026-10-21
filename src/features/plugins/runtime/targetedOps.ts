/**
 * DOM ops that address page elements (everything but `native`), and how one
 * of them writes to a matched element through the shared `DomEffectLedger`.
 */
import { logger } from '@/core/services/LoggerService';

import { PLUGIN_HIDDEN_CLASS } from '../constants';
import { attributeIssue, styleValueIssue } from '../manifest/sinkGuards';
import type { DomOperation, NativeOperation } from '../types';
import type { DomEffectLedger } from './domEffectLedger';

export type TargetedOperation = Exclude<DomOperation, NativeOperation>;

export function isTargetedOp(op: DomOperation): op is TargetedOperation {
  return op.op !== 'native';
}

/**
 * Apply `op` to one matched element on behalf of plugin `id`. `render`
 * substitutes the plugin's current setting values into templated strings.
 * Returns false when the rendered attribute is rejected: the op then stops for
 * every remaining element too.
 */
export function applyOpToElement(
  ledger: DomEffectLedger,
  id: string,
  el: Element,
  op: TargetedOperation,
  render: (value: string) => string,
): boolean {
  switch (op.op) {
    case 'addClass':
      ledger.addClass(id, el, op.className);
      break;
    case 'hide':
      ledger.addClass(id, el, PLUGIN_HIDDEN_CLASS);
      break;
    case 'setAttribute': {
      const value = render(op.value);
      const issue = attributeIssue(op.name, value);
      if (issue) {
        logger.warn('Rendered plugin attribute rejected', { id, name: op.name, issue });
        return false;
      }
      // A whole `style` write joins the per-property layers: kept in a ledger of
      // its own, restoring it would wipe another live plugin's setStyle values.
      if (op.name === 'style' && el instanceof HTMLElement) {
        for (const [prop, declared, priority] of ledger.styles().parse(value)) {
          ledger.setStyle(id, el, prop, declared, priority);
        }
      } else {
        ledger.setAttribute(id, el, op.name, value);
      }
      break;
    }
    case 'setStyle':
      if (el instanceof HTMLElement) {
        for (const [prop, raw] of Object.entries(op.styles)) {
          const value = render(raw);
          const issue = styleValueIssue(value);
          if (issue) {
            logger.warn('Rendered plugin style rejected', { id, prop, issue });
            continue;
          }
          // Literal shorthands expand; variable shorthands retain their declaration
          // while the ledger captures every longhand they cover before writing it.
          for (const [longhand, declared, priority] of ledger.styles().property(prop, value)) {
            ledger.setStyle(id, el, longhand, declared, priority);
          }
        }
      }
      break;
  }
  return true;
}
