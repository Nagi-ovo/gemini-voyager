import { Fragment, type ReactNode } from 'react';

import type { OpDiagnostic } from '@/features/plugins/runtime/opDiagnostics';
import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';
import type { TranslationKey } from '@/utils/translations';

/** Fill `{name}` slots with nodes; selector labels stay isolated inside RTL text. */
function fill(template: string, slots: Readonly<Record<string, ReactNode>>): ReactNode {
  return template.split(/(\{\w+\})/).map((part, index) => {
    const slot = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={index}>{slot && slot in slots ? slots[slot] : part}</Fragment>;
  });
}

function labels(ops: readonly OpDiagnostic[]): ReactNode {
  return ops.map((op, index) => (
    <Fragment key={op.index}>
      {index > 0 && ', '}
      <bdi>{op.label}</bdi>
    </Fragment>
  ));
}

/**
 * What each of a plugin's DOM changes finds on the page. A running plugin
 * whose health check names changes that found nothing gets a warning, shown
 * like the other status notes; the per-change counts appear while its row is
 * expanded, whether it is on or not.
 */
export function PluginOpsNotes({
  status,
  isOpen,
  t,
}: {
  status: PluginStatus | undefined;
  isOpen: boolean;
  t: (key: TranslationKey) => string;
}) {
  const ops = status?.ops ?? [];
  if (ops.length === 0) return null;
  // A plugin that found nothing at all already says so (`no-effect`).
  const zero = status?.kind === 'no-effect' ? [] : (status?.zeroOps ?? []);
  const missing = ops.filter((op) => zero.includes(op.index));
  return (
    <>
      {missing.length > 0 && (
        <p className="text-warning mt-1 text-[11px] leading-snug">
          {missing.length === ops.length
            ? t('pluginNoEffectOnPage')
            : fill(t('pluginOpsPartlyFound'), {
                count: missing.length,
                total: ops.length,
                targets: labels(missing),
              })}
        </p>
      )}
      {isOpen && (
        <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
          {fill(t('pluginOpsFoundOnPage'), {
            ops: ops.map((op, index) => (
              <Fragment key={op.index}>
                {index > 0 && ', '}
                <bdi>{op.label}</bdi> · {op.count}
              </Fragment>
            )),
          })}
        </p>
      )}
    </>
  );
}
