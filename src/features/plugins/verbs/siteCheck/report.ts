/**
 * The site check report: what the person previews, copies as Markdown or
 * downloads as JSON. Built only from closed vocabularies, counts, Voyager's own
 * selectors and the sanitized skeleton, never from page text: no title, no
 * host, query or hash, no conversation id, no account detail. The Markdown is
 * English on purpose; maintainers read it, whatever the reporter's language.
 */
import {
  type VoyagerDiagnosticsPayload,
  buildVoyagerDiagnostics,
} from '@/core/services/DiagnosticsExportService';

import { isLocalPluginId } from '../../local/localPluginId';
import type { PluginStatus } from '../../runtime/pluginStatus';
import type { SiteAdapter } from '../../types';
import { type Probe, type ProbeResult, probeMatches } from './probes';
import { redactRoute } from './route';
import { ancestorChain, buildSkeleton, clampPick, describeElement, isInsideOnly } from './skeleton';

export const SITE_CHECK_FORMAT = 'voyager.site-check.v1' as const;
export const LOCAL_SELECTOR_PLACEHOLDER = '(local plugin)';

export interface PickedSection {
  /** Outermost first; `matches` names the probes that find that element. */
  readonly path: readonly { readonly element: string; readonly matches: readonly string[] }[];
  readonly skeleton: readonly string[];
  readonly truncated: boolean;
}

export interface SiteCheckReport {
  readonly format: typeof SITE_CHECK_FORMAT;
  readonly generatedAt: string;
  readonly site: { readonly id: string; readonly label: string } | null;
  readonly page: {
    readonly route: string;
    readonly conversation: boolean;
    readonly scheme: 'light' | 'dark' | 'unknown';
    readonly lang: string | null;
  };
  readonly extension: VoyagerDiagnosticsPayload['extension'];
  readonly pluginEngine: VoyagerDiagnosticsPayload['pluginEngine'];
  readonly environment: Omit<VoyagerDiagnosticsPayload['environment'], 'activeSite'>;
  readonly summary: {
    readonly checked: number;
    readonly missing: number;
    readonly invalid: number;
    readonly unresolved: number;
  };
  readonly selectors: readonly {
    readonly source: string;
    readonly name: string;
    readonly selector: string | null;
    readonly within?: string;
    readonly count: number;
    readonly expect: ProbeResult['expect'];
    readonly verdict: ProbeResult['verdict'];
  }[];
  readonly plugins: readonly {
    readonly id: string;
    readonly version: string;
    readonly status: string;
  }[];
  readonly picked: PickedSection | null;
}

/** A probe's source and name, as the picked-element section and the summary list it. */
export function probeLabel(probe: Pick<Probe, 'source' | 'name'>, ids: PluginIds): string {
  return `${ids.label(probe.source)} · ${probe.name}`;
}

/** Plugin ids as the report shows them: a local plugin's own name stays on the device. */
export interface PluginIds {
  label(id: string): string;
}

export function pluginIds(ids: readonly string[]): PluginIds {
  const locals = [...new Set(ids.filter(isLocalPluginId))];
  return {
    label(id) {
      if (id === 'site') return id;
      if (isLocalPluginId(id)) return `local.#${locals.indexOf(id) + 1}`;
      return /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id) ? id : 'unknown';
    },
  };
}

/** Semantic keys whose elements hold a message, which its author's markup can style. */
const TURN_KEYS = new Set(['userTurn', 'assistantTurn']);

/**
 * The picked element's section: its ancestors' matches and its own sanitized
 * subtree. A pick inside a drawing or a diagram becomes the drawing itself.
 */
export function describePick(
  picked: Element,
  probes: readonly Probe[],
  ids: PluginIds,
): PickedSection {
  const element = clampPick(picked);
  const turns = probes.flatMap((probe) =>
    probe.source === 'site' && TURN_KEYS.has(probe.name) && probe.selector ? [probe.selector] : [],
  );
  const inContent = (node: Element) => isInsideOnly(node, turns);
  const path = ancestorChain(element).map((node) => ({
    element: describeElement(node, { withoutClasses: inContent(node) }),
    matches: probes
      .filter((probe) => probeMatches(node, probe))
      .map((probe) => probeLabel(probe, ids)),
  }));
  const { lines, truncated } = buildSkeleton(element, inContent);
  return { path, skeleton: lines, truncated };
}

const LANG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/;
const VERSION = /^[a-z0-9][a-z0-9.+_-]{0,63}$/i;

export interface ReportInput {
  readonly url: string;
  readonly doc: Document;
  readonly adapter: SiteAdapter | null;
  readonly results: readonly ProbeResult[];
  readonly statuses: readonly PluginStatus[];
  readonly picked: PickedSection | null;
  readonly now?: Date;
  /** Test seam; the page's own diagnostics otherwise. */
  readonly diagnostics?: VoyagerDiagnosticsPayload;
}

export function buildSiteCheckReport(input: ReportInput): SiteCheckReport {
  const { adapter, results } = input;
  const ids = pluginIds([...results.map((r) => r.source), ...input.statuses.map((s) => s.id)]);
  const diagnostics = input.diagnostics ?? buildVoyagerDiagnostics({ now: input.now });
  const { activeSite: _activeSite, ...environment } = diagnostics.environment;
  const route = redactRoute(input.url, adapter);
  const scheme = input.doc.documentElement.getAttribute('data-gv-scheme');
  const lang = input.doc.documentElement.lang;
  const count = (verdict: ProbeResult['verdict']) =>
    results.filter((result) => result.verdict === verdict).length;
  return {
    format: SITE_CHECK_FORMAT,
    generatedAt: (input.now ?? new Date()).toISOString(),
    site: adapter ? { id: adapter.id, label: adapter.label } : null,
    page: {
      route: route.route,
      conversation: route.conversation,
      scheme: scheme === 'light' || scheme === 'dark' ? scheme : 'unknown',
      lang: LANG.test(lang) ? lang : null,
    },
    extension: diagnostics.extension,
    pluginEngine: diagnostics.pluginEngine,
    environment,
    summary: {
      checked: results.length,
      missing: count('missing'),
      invalid: count('invalid'),
      unresolved: count('unresolved'),
    },
    selectors: results.map((result) => ({
      source: ids.label(result.source),
      name: result.name,
      selector: result.local ? LOCAL_SELECTOR_PLACEHOLDER : result.selector,
      ...(result.within && !result.local ? { within: result.within } : {}),
      count: result.count,
      expect: result.expect,
      verdict: result.verdict,
    })),
    plugins: input.statuses
      .map((status) => ({
        id: ids.label(status.id),
        version: VERSION.test(status.version) ? status.version : 'unknown',
        status: status.kind,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    picked: input.picked,
  };
}

/** Problems first: what a maintainer reads before the full table. */
export function reportProblems(report: SiteCheckReport): string[] {
  return report.selectors
    .filter(
      (row) =>
        row.verdict === 'missing' || row.verdict === 'invalid' || row.verdict === 'unresolved',
    )
    .map((row) => `${row.source} · ${row.name} (${row.verdict})`);
}

const cell = (value: string): string => value.replace(/\|/g, '\\|').replace(/`/g, "'");
const code = (value: string): string => `\`${cell(value)}\``;

export function formatSiteCheckMarkdown(report: SiteCheckReport): string {
  const { page, extension, environment } = report;
  const site = report.site ? `${report.site.label} (\`${report.site.id}\`)` : 'unknown site';
  const lines = [
    '### Voyager site check',
    '',
    '| | |',
    '| --- | --- |',
    `| Site | ${site} |`,
    `| Route | ${code(page.route)}${page.conversation ? ' (conversation)' : ''} |`,
    `| Voyager | ${extension.version} · ${extension.buildTarget} build · plugin engine ${report.pluginEngine.version} |`,
    `| Browser | ${environment.browser} ${environment.browserVersion ?? ''} · ${environment.os} |`,
    `| Page | ${page.scheme} theme · lang ${page.lang ?? 'unknown'} |`,
    `| Generated | ${report.generatedAt} |`,
    '',
  ];
  const problems = reportProblems(report);
  lines.push(
    problems.length
      ? `**Likely broken (${problems.length}):** ${problems.map(code).join(', ')}`
      : '**Every selector expected on this page matched.**',
    '',
    '#### Selectors',
    '',
    '| Source | Name | Matches | Expected | Result | Selector |',
    '| --- | --- | ---: | --- | --- | --- |',
  );
  for (const row of report.selectors) {
    const selector = row.selector === null ? '—' : code(row.selector);
    const within = row.within ? ` in ${code(row.within)}` : '';
    lines.push(
      `| ${cell(row.source)} | ${cell(row.name)} | ${row.count} | ${row.expect} | ${row.verdict} | ${selector}${within} |`,
    );
  }
  lines.push('', '#### Plugins on this page', '');
  if (report.plugins.length === 0) lines.push('None.');
  else {
    lines.push('| Plugin | Version | Status |', '| --- | --- | --- |');
    for (const plugin of report.plugins) {
      lines.push(`| ${cell(plugin.id)} | ${cell(plugin.version)} | ${plugin.status} |`);
    }
  }
  lines.push('', '#### Picked element', '');
  if (!report.picked) lines.push('None picked.');
  else {
    lines.push('Path, outermost first:', '');
    for (const step of report.picked.path) {
      const matches = step.matches.length ? ` — matches ${step.matches.map(code).join(', ')}` : '';
      lines.push(`- ${code(step.element)}${matches}`);
    }
    lines.push('', 'Structure (no text, no text-bearing attributes):', '', '```text');
    lines.push(...report.picked.skeleton.map((line) => line.replace(/`/g, "'")));
    lines.push('```');
    if (report.picked.truncated) lines.push('', '_Structure truncated at the size limit._');
  }
  return lines.join('\n');
}

export function serializeSiteCheckReport(report: SiteCheckReport): string {
  return JSON.stringify(report, null, 2);
}
