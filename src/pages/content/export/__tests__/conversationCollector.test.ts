import { afterEach, describe, expect, it } from 'vitest';

import { resolveExportAdapter } from '../adapter/platformAdapters';
import { createConversationCollector } from '../conversationCollector';

function renderConversation(): void {
  document.body.innerHTML = `
    <main>
      <div class="user-query-container">first prompt</div>
      <div class="response-container">
        <model-thoughts><message-content>hidden reasoning</message-content></model-thoughts>
        <message-content>first answer</message-content>
        <button class="menu-trigger" data-test-id="more-menu-button">more</button>
      </div>
      <div class="user-query-container">second prompt</div>
      <div class="response-container"><message-content>second answer</message-content></div>
    </main>
  `;
}

describe('createConversationCollector', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reads the response text outside an expanded thinking panel', () => {
    renderConversation();
    const collector = createConversationCollector(resolveExportAdapter());

    const pairs = collector.collectChatPairs();

    expect(pairs.map(({ user, assistant }) => ({ user, assistant }))).toEqual([
      { user: 'first prompt', assistant: 'first answer' },
      { user: 'second prompt', assistant: 'second answer' },
    ]);
  });

  it('exports only the response whose menu was opened', () => {
    renderConversation();
    const collector = createConversationCollector(resolveExportAdapter());
    const trigger = document.querySelector<HTMLElement>('.menu-trigger');

    const messageId = collector.assistantMessageIdFor(trigger);
    expect(messageId).not.toBeNull();

    const turns = collector.turnsForMessageIds(new Set([messageId!]));
    expect(turns).toHaveLength(1);
    expect(turns[0].user).toBe('');
    expect(turns[0].assistant).toBe('first answer');
    expect(turns[0].assistantElement?.textContent).toBe('first answer');
  });

  it('lists one selectable message per user prompt and response', () => {
    renderConversation();
    const collector = createConversationCollector(resolveExportAdapter());

    const messages = collector.collectSelectionMessages();

    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(new Set(messages.map((message) => message.messageId)).size).toBe(4);
    expect(collector.turnsForMessageIds(new Set())).toEqual([]);
  });

  it('returns no message id for a trigger outside any response', () => {
    renderConversation();
    const collector = createConversationCollector(resolveExportAdapter());
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    expect(collector.assistantMessageIdFor(outside)).toBeNull();
    expect(collector.assistantMessageIdFor(null)).toBeNull();
  });
});
