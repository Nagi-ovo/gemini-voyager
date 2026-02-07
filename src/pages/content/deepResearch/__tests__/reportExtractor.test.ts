import { describe, expect, it } from 'vitest';

import { extractDeepResearchReportTitle, findDeepResearchReportRoot } from '../reportExtractor';

describe('reportExtractor', () => {
  it('finds report markdown outside thinking panels', () => {
    document.body.innerHTML = `
      <deep-research-immersive-panel>
        <thinking-panel>
          <div class="markdown">Thinking trace content should not be exported even if long.</div>
        </thinking-panel>
        <section>
          <div class="markdown-main-panel">
            <h1>Final Report</h1>
            <p>This is the final report body.</p>
          </div>
        </section>
      </deep-research-immersive-panel>
    `;

    const root = findDeepResearchReportRoot();
    expect(root).not.toBeNull();
    expect(root?.textContent).toContain('Final Report');
    expect(root?.textContent).not.toContain('Thinking trace');
  });

  it('returns null when immersive panel is missing', () => {
    document.body.innerHTML = '<div class="markdown">Standalone content</div>';
    const root = findDeepResearchReportRoot();
    expect(root).toBeNull();
  });

  it('extracts title from heading first, then document title', () => {
    document.title = 'Gemini';
    document.body.innerHTML = `
      <div class="markdown">
        <h1>Revenue Deep Research Report</h1>
        <p>Body</p>
      </div>
    `;
    const root = document.querySelector('.markdown') as HTMLElement;
    expect(extractDeepResearchReportTitle(root)).toBe('Revenue Deep Research Report');

    root.innerHTML = '<p>No heading here</p>';
    document.title = 'Cross-border Analysis';
    expect(extractDeepResearchReportTitle(root)).toBe('Cross-border Analysis');
  });
});
