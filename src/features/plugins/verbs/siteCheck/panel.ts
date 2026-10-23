/**
 * The site check panel: the summary, the selector table, the picked element
 * and the exact Markdown the copy action puts on the clipboard. Everything is
 * written with `textContent`, so no report value is ever parsed as markup.
 */
import { getTranslationSync } from '@/utils/i18n';
import type { TranslationKey } from '@/utils/translations';

import type { ProbeVerdict } from './probes';
import { type SiteCheckReport, formatSiteCheckMarkdown } from './report';

export interface PanelActions {
  rerun(): void;
  pick(): void;
  copy(): void;
  download(): void;
  openIssue(): void;
  close(): void;
}

const VERDICT_KEYS: Readonly<Record<ProbeVerdict, TranslationKey>> = {
  ok: 'siteCheckVerdictOk',
  missing: 'siteCheckVerdictMissing',
  'not-here': 'siteCheckVerdictNotHere',
  'not-judged': 'siteCheckVerdictNotJudged',
  invalid: 'siteCheckVerdictInvalid',
  unresolved: 'siteCheckVerdictUnresolved',
};

type Child = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  props: { className?: string; text?: string } = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  node.append(...children);
  return node;
}

function button(doc: Document, key: TranslationKey, onClick: () => void, primary = false) {
  const node = el(doc, 'button', { text: getTranslationSync(key) });
  node.type = 'button';
  if (primary) node.className = 'gv-sc-primary';
  node.addEventListener('click', onClick);
  return node;
}

function summary(doc: Document, report: SiteCheckReport): HTMLElement {
  const broken = report.summary.missing + report.summary.invalid + report.summary.unresolved;
  const text = getTranslationSync(broken > 0 ? 'siteCheckSummary' : 'siteCheckAllFound')
    .replace('{checked}', String(report.summary.checked))
    .replace('{broken}', String(broken));
  const node = el(doc, 'p', { className: 'gv-sc-summary', text });
  node.dataset.state = broken > 0 ? 'broken' : 'ok';
  node.setAttribute('role', 'status');
  return node;
}

function selectorTable(doc: Document, report: SiteCheckReport): HTMLTableElement {
  const head = el(doc, 'tr', {}, [
    el(doc, 'th', { text: getTranslationSync('siteCheckColSource') }),
    el(doc, 'th', { text: getTranslationSync('siteCheckColName') }),
    el(doc, 'th', { text: getTranslationSync('siteCheckColMatches') }),
    el(doc, 'th', { text: getTranslationSync('siteCheckColResult') }),
  ]);
  const rows = report.selectors.map((row) => {
    const tr = el(doc, 'tr', {}, [
      el(doc, 'td', { text: row.source }),
      el(doc, 'td', {}, [el(doc, 'code', { text: row.name })]),
      el(doc, 'td', { className: 'gv-sc-count', text: String(row.count) }),
      el(doc, 'td', {
        className: 'gv-sc-verdict',
        text: getTranslationSync(VERDICT_KEYS[row.verdict]),
      }),
    ]);
    tr.dataset.verdict = row.verdict;
    if (row.selector) tr.title = row.selector;
    return tr;
  });
  return el(doc, 'table', {}, [el(doc, 'thead', {}, [head]), el(doc, 'tbody', {}, rows)]);
}

function pickedSection(doc: Document, report: SiteCheckReport): Node[] {
  const heading = el(doc, 'h3', { text: getTranslationSync('siteCheckPicked') });
  const picked = report.picked;
  if (!picked) {
    return [
      heading,
      el(doc, 'p', { className: 'gv-sc-note', text: getTranslationSync('siteCheckPickedNone') }),
    ];
  }
  const anyMatch = picked.path.some((step) => step.matches.length > 0);
  const list = el(
    doc,
    'ul',
    {},
    picked.path.map((step) =>
      el(doc, 'li', {}, [
        el(doc, 'code', { text: step.element }),
        ...(step.matches.length ? [` → ${step.matches.join(', ')}`] : []),
      ]),
    ),
  );
  return [
    heading,
    ...(anyMatch
      ? []
      : [
          el(doc, 'p', {
            className: 'gv-sc-note',
            text: getTranslationSync('siteCheckPickedNoMatch'),
          }),
        ]),
    list,
    el(doc, 'pre', { text: picked.skeleton.join('\n') }),
  ];
}

/** Replace the panel's content with `report`. */
export function renderPanel(
  root: ShadowRoot,
  doc: Document,
  report: SiteCheckReport,
  actions: PanelActions,
): HTMLElement {
  root.querySelector('.gv-sc-panel')?.remove();
  const title = el(doc, 'h2', { text: getTranslationSync('siteCheckTitle') });
  title.id = 'gv-sc-title';
  const close = button(doc, 'siteCheckClose', actions.close);
  close.className = 'gv-sc-close';
  close.textContent = '×';
  close.setAttribute('aria-label', getTranslationSync('siteCheckClose'));
  const preview = el(doc, 'details', {}, [
    el(doc, 'summary', { text: getTranslationSync('siteCheckPreview') }),
    el(doc, 'pre', { text: formatSiteCheckMarkdown(report) }),
  ]);
  const panel = el(doc, 'section', { className: 'gv-sc-panel' }, [
    el(doc, 'div', { className: 'gv-sc-head' }, [title, close]),
    el(doc, 'div', { className: 'gv-sc-body' }, [
      el(doc, 'p', { className: 'gv-sc-note', text: getTranslationSync('siteCheckPrivacy') }),
      summary(doc, report),
      el(doc, 'div', { className: 'gv-sc-row' }, [
        button(doc, 'siteCheckRerun', actions.rerun),
        button(doc, 'siteCheckPick', actions.pick),
      ]),
      el(doc, 'h3', { text: getTranslationSync('siteCheckSelectors') }),
      selectorTable(doc, report),
      ...pickedSection(doc, report),
      preview,
    ]),
    el(doc, 'div', { className: 'gv-sc-foot' }, [
      button(doc, 'siteCheckDownload', actions.download),
      button(doc, 'siteCheckCopy', actions.copy),
      button(doc, 'siteCheckOpenIssue', actions.openIssue, true),
    ]),
  ]);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', title.id);
  root.append(panel);
  return panel;
}
