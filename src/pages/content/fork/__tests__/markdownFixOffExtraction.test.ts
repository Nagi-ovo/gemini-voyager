import { marked } from 'marked';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createContentExtractor,
  extractTurnContent,
} from '@/features/export/services/DOMContentExtractor';
import { MarkdownFormatter } from '@/features/export/services/MarkdownFormatter';
import { resolveExportAdapter } from '@/pages/content/export/adapter/platformAdapters';

import { collectForkChatPairs } from '../chatPairs';
import { buildForkMarkdown } from '../markdown';

describe('export and fork with Markdown rendering fix off', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it.each([
    {
      kind: 'intra-node bold markers',
      html: '<p>Compare **Alpha** and **Beta** today.</p>',
    },
    {
      kind: 'bold markers split by Gemini-injected bold nodes',
      html: '<p>Compare **<b data-path-to-node="0,1">Alpha</b>** and **<b data-path-to-node="0,2">Beta</b>** today.</p>',
    },
  ])('preserves readable export and fork content for $kind', ({ html }) => {
    // Never mount the patcher: these are Gemini's original, unpatched response nodes.
    document.body.innerHTML = `
      <main>
        <div class="user-query-container">Compare the algorithms</div>
        <div class="response-container">
          <message-content><div class="markdown">${html}</div></message-content>
        </div>
      </main>
    `;
    const userElement = document.querySelector<HTMLElement>('.user-query-container')!;
    const assistantElement = document.querySelector<HTMLElement>('.response-container')!;
    const responseBefore = assistantElement.innerHTML;
    const turn = extractTurnContent(
      { user: '', assistant: '', starred: false, userElement, assistantElement },
      createContentExtractor(resolveExportAdapter()),
    );
    const exported = MarkdownFormatter.format([turn], {
      title: 'Comparison',
      count: 1,
      exportedAt: '2026-10-16T12:00:00Z',
      url: 'https://gemini.google.com/app/example',
    });
    const pairs = collectForkChatPairs();
    const forked = buildForkMarkdown('Comparison', pairs, false);

    expect(pairs).toHaveLength(1);
    expect(pairs[0].user).toBe('Compare the algorithms');
    expect(exported).toContain('### 🤖 Assistant');
    expect(forked).toContain('### 🤖 Assistant');

    // Check the complete answer without depending on Gemini's bold delimiter layout.
    for (const markdown of [turn.assistantContent?.text, pairs[0].assistant, exported, forked]) {
      const renderedMarkdown = document.createElement('div');
      renderedMarkdown.innerHTML = marked.parse(markdown ?? '', { async: false });
      expect(renderedMarkdown.textContent).toContain('Compare Alpha and Beta today.');
    }

    // HTML-based exports faithfully retain the host's visible formatting artifacts.
    const renderedHtml = document.createElement('div');
    renderedHtml.innerHTML = turn.assistantContent?.html ?? '';
    expect(renderedHtml.textContent).toBe('Compare **Alpha** and **Beta** today.');
    expect(assistantElement.innerHTML).toBe(responseBefore);
  });
});
