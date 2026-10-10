import type { ManifestIssue } from '@/features/plugins/manifest/validate';

/** Path + message per manifest issue, as the local plugin gate reports them. */
export function LocalPluginIssueList({ issues }: { issues: readonly ManifestIssue[] }) {
  return (
    <ul className="mt-1 space-y-0.5" data-testid="local-plugin-issues">
      {issues.map((issue, index) => (
        <li key={index} className="font-mono text-[10px] break-all">
          {issue.path ? `${issue.path}: ${issue.message}` : issue.message}
        </li>
      ))}
    </ul>
  );
}
