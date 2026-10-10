import { beforeEach, describe, expect, it } from 'vitest';

import { turnConversationId } from './conversationId';

const chatgpt = {
  siteId: 'chatgpt',
  conversationIdAttribute: 'data-chatgpt-selection-conversation-id',
  turnItemSelector: '[data-turn-key]',
};

/** Sanitized from live ChatGPT: one item per exchange, the id on the reply only. */
function exchange(conversation: string | null): HTMLElement {
  const item = document.createElement('div');
  item.setAttribute('data-turn-key', 'turn');
  item.innerHTML = `
    <div data-chatgpt-search-message-ids="m1"><div data-user-message-bubble="true">prompt</div></div>
    <div data-chatgpt-search-message-ids="m2"><h4 data-conversation-role="assistant"></h4></div>
  `;
  if (conversation !== null) {
    const reply = document.createElement('div');
    reply.setAttribute('data-chatgpt-selection-conversation-id', conversation);
    reply.setAttribute('data-chatgpt-selection-message-id', 'm2');
    item.lastElementChild!.append(reply);
  }
  document.body.append(item);
  return item.querySelector<HTMLElement>('[data-user-message-bubble]')!;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('turnConversationId', () => {
  it("reads the id from the reply in the prompt's item", () => {
    expect(turnConversationId(chatgpt, exchange('abc'))).toBe('chatgpt:conv:abc');
  });

  it('has no id for a turn whose reply has not rendered yet', () => {
    expect(turnConversationId(chatgpt, exchange(null))).toBeNull();
  });

  it('has no id when an item names two conversations', () => {
    const prompt = exchange('abc');
    const extra = document.createElement('div');
    extra.setAttribute('data-chatgpt-selection-conversation-id', 'other');
    prompt.closest('[data-turn-key]')!.append(extra);
    expect(turnConversationId(chatgpt, prompt)).toBeNull();
  });

  it("never reads another exchange's id", () => {
    exchange('abc');
    expect(turnConversationId(chatgpt, exchange(null))).toBeNull();
  });

  it('prefers the nearest ancestor that carries the id, as Claude marks its thread', () => {
    const claude = { siteId: 'claude', conversationIdAttribute: 'data-conv-id' };
    document.body.innerHTML = '<div data-conv-id="x"><div><p id="turn">hi</p></div></div>';
    expect(turnConversationId(claude, document.getElementById('turn')!)).toBe('claude:conv:x');
    document.body.innerHTML = '<div><p id="turn">hi</p></div>';
    expect(turnConversationId(claude, document.getElementById('turn')!)).toBeNull();
  });

  it('says nothing where the site names no attribute', () => {
    expect(turnConversationId({ siteId: 'deepseek' }, exchange('abc'))).toBeUndefined();
  });
});
