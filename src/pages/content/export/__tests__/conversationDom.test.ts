import { describe, expect, it } from 'vitest';

import { filterOutDeepResearchImmersiveNodes, resolveConversationRoot } from '../conversationDom';

describe('conversationDom', () => {
  it('prefers #chat-history as conversation root when available', () => {
    document.body.innerHTML = `
      <main id="main-root">
        <div id="chat-history">
          <div class="user-query-container">left conversation message</div>
        </div>
        <deep-research-immersive-panel>
          <div class="user-query-container">report panel content</div>
        </deep-research-immersive-panel>
      </main>
    `;

    const root = resolveConversationRoot({
      userSelectors: ['.user-query-container'],
      doc: document,
    });

    expect(root.id).toBe('chat-history');
  });

  it('filters out nodes inside deep research immersive panel', () => {
    document.body.innerHTML = `
      <main>
        <div id="chat-history">
          <div id="msg-left" class="response-container">left conversation response</div>
        </div>
        <deep-research-immersive-panel>
          <div id="msg-report" class="response-container">report response</div>
        </deep-research-immersive-panel>
      </main>
    `;

    const all = Array.from(document.querySelectorAll<HTMLElement>('.response-container'));
    const filtered = filterOutDeepResearchImmersiveNodes(all);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('msg-left');
  });
});
