/**
 * The bug report form, prefilled with a short title and summary only. GitHub
 * fills an issue form field from a query parameter named after the field's
 * `id` (`.github/ISSUE_TEMPLATE/bug_report.yml`); fields without an id (the
 * OS, browser and site dropdowns, the diagnostics box) cannot be prefilled. The
 * report itself never goes into the URL: the person pastes what they copied.
 */
import { type SiteCheckReport, reportProblems } from './report';

export const ISSUE_FORM_URL = 'https://github.com/voyager-crew/voyager/issues/new';
const MAX_NAMES = 4;

export function buildIssueUrl(report: SiteCheckReport): string {
  const site = report.site?.label ?? 'unknown site';
  const problems = reportProblems(report);
  const title =
    problems.length > 0
      ? `[Bug] ${site}: site check found ${problems.length} broken selector${problems.length === 1 ? '' : 's'}`
      : `[Bug] ${site}: `;
  const names = problems.slice(0, MAX_NAMES).join(', ');
  const more = problems.length > MAX_NAMES ? `, and ${problems.length - MAX_NAMES} more` : '';
  const summary =
    problems.length > 0
      ? `Voyager's site check on ${site} found nothing for ${names}${more}. The full site check report is pasted under Sanitized Diagnostics.`
      : `The Voyager site check report from ${site} is pasted under Sanitized Diagnostics.`;
  const params = new URLSearchParams({
    template: 'bug_report.yml',
    title,
    description: summary,
    'extension-version': report.extension.version,
  });
  const { browser, browserVersion } = report.environment;
  if (browserVersion) params.set('browser-version', `${browser} ${browserVersion}`);
  return `${ISSUE_FORM_URL}?${params.toString()}`;
}
