import { describe, expect, it } from 'vitest';

import { resolveExportAdapter } from '../adapter/platformAdapters';
import { createConversationCollector } from '../conversationCollector';

describe('collectChatPairs', () => {
  it('pairs repeated prompts by DOM order when virtualized turns expose mixed offsets', () => {
    document.body.innerHTML = `
      <main>
        <div class="user-query-container">repeat prompt</div>
        <div class="response-container">assistant-1</div>
        <div class="user-query-container">repeat prompt</div>
        <div class="response-container">assistant-2</div>
        <div class="user-query-container">user-3</div>
        <div class="response-container">assistant-3</div>
      </main>
    `;

    const userContainers = document.querySelectorAll<HTMLElement>('.user-query-container');
    const responseContainers = document.querySelectorAll<HTMLElement>('.response-container');
    [0, 0, 200].forEach((offsetTop, index) => {
      Object.defineProperty(userContainers[index], 'offsetTop', { value: offsetTop });
    });
    [100, 100, 300].forEach((offsetTop, index) => {
      Object.defineProperty(responseContainers[index], 'offsetTop', { value: offsetTop });
    });

    const pairs = createConversationCollector(resolveExportAdapter()).collectChatPairs();

    expect(pairs.map(({ user, assistant }) => ({ user, assistant }))).toEqual([
      { user: 'repeat prompt', assistant: 'assistant-1' },
      { user: 'repeat prompt', assistant: 'assistant-2' },
      { user: 'user-3', assistant: 'assistant-3' },
    ]);
  });
});
