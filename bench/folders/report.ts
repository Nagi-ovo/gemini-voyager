/** Markdown tables for a bench run. */
import type { DatasetSummary } from './datasets';
import type { BenchResult } from './stats';

export interface BenchReport {
  readonly meta: {
    readonly date: string;
    readonly commit: string;
    readonly machine: string;
    readonly node?: string;
    readonly browser?: string;
    readonly userAgent?: string;
    readonly crossOriginIsolated?: boolean;
    readonly cpuThrottle: number;
    readonly runScale: number;
  };
  readonly datasets: readonly DatasetSummary[];
  readonly node: readonly BenchResult[];
  readonly browser: readonly BenchResult[];
}

function ms(value: number): string {
  if (!Number.isFinite(value)) return '–';
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  if (value >= 0.1) return value.toFixed(2);
  return value.toFixed(4);
}

function row(result: BenchResult): string {
  const s = result.stats;
  const cells = [
    result.dataset,
    result.metric,
    s ? ms(s.p50) : 'n/a',
    s ? ms(s.p95) : 'n/a',
    s ? String(s.runs) : '–',
    !s ? '–' : result.longTasks === null ? `${result.samplesOver50ms}*` : String(result.longTasks),
    result.domElements === undefined ? '' : String(result.domElements),
    result.note ?? '',
  ];
  return `| ${cells.join(' | ')} |`;
}

export function resultTables(results: readonly BenchResult[]): string {
  const bySurface = new Map<string, BenchResult[]>();
  for (const result of results) {
    const list = bySurface.get(result.surface) ?? [];
    list.push(result);
    bySurface.set(result.surface, list);
  }
  const out: string[] = [];
  for (const [surface, list] of bySurface) {
    out.push(`#### ${surface}`, '');
    out.push('| Dataset | Metric | p50 ms | p95 ms | Runs | Long tasks | DOM elements | Note |');
    out.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const result of list) out.push(row(result));
    out.push('');
  }
  return out.join('\n');
}

export function datasetTable(datasets: readonly DatasetSummary[]): string {
  const out = [
    '| Dataset | Folders | Buckets | Refs | Unique conversations | Max depth | JSON size |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const d of datasets) {
    out.push(
      `| ${d.name} | ${d.folders} | ${d.buckets} | ${d.refs} | ${d.uniqueConversations} | ${d.maxDepth} | ${(d.jsonBytes / 1024).toFixed(0)} KiB |`,
    );
  }
  return out.join('\n');
}

export function toMarkdown(report: BenchReport): string {
  const { meta } = report;
  return [
    `### Run ${meta.date}`,
    '',
    `- Commit: \`${meta.commit}\``,
    `- Machine: ${meta.machine}`,
    meta.node ? `- Node: ${meta.node}` : '',
    meta.browser
      ? `- Browser: ${meta.browser} (cross-origin isolated: ${meta.crossOriginIsolated})`
      : '',
    `- CPU throttle: ${meta.cpuThrottle}x, run scale: ${meta.runScale}`,
    '',
    datasetTable(report.datasets),
    '',
    report.browser.length ? '### Browser (headless Chrome)\n' : '',
    resultTables(report.browser),
    report.node.length ? '### Node\n' : '',
    resultTables(report.node),
    '`*` node has no Long Tasks API: the count is samples over 50 ms.',
    '',
  ]
    .filter((line, index, lines) => line !== '' || lines[index - 1] !== '')
    .join('\n');
}
