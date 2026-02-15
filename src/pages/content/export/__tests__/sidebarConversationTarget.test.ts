import { afterEach, describe, expect, it } from 'vitest';

import { resolveSidebarConversationTarget } from '../sidebarConversationTarget';

function asRect(left: number, top: number, width: number, height: number): DOMRect {
  const right = left + width;
  const bottom = top + height;
  return {
    x: left,
    y: top,
    width,
    height,
    top,
    left,
    right,
    bottom,
    toJSON: () => ({}),
  } as DOMRect;
}

function setRect(el: Element, left: number, top: number, width: number = 100, height: number = 28) {
  (el as HTMLElement).getBoundingClientRect = () => asRect(left, top, width, height);
}

function createConversation(id: string, title: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.setAttribute('data-test-id', 'conversation');
  link.href = `https://gemini.google.com/app/${id}`;
  link.textContent = title;
  document.body.appendChild(link);
  return link;
}

describe('resolveSidebarConversationTarget', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves target from aria-label title hint', () => {
    const sidebar = document.createElement('div');
    sidebar.setAttribute('data-test-id', 'overflow-container');
    document.body.appendChild(sidebar);

    createConversation('abc123', 'A股PEG估值与SEPA策略');
    const trigger = document.createElement('button');
    trigger.setAttribute('data-test-id', 'actions-menu-button');
    trigger.setAttribute('aria-label', 'More options for A股PEG估值与SEPA策略');
    sidebar.appendChild(trigger);

    const target = resolveSidebarConversationTarget(trigger);
    expect(target?.conversationId).toBe('abc123');
  });

  it('prefers nearest conversation when titles duplicate', () => {
    const sidebar = document.createElement('div');
    sidebar.setAttribute('data-test-id', 'overflow-container');
    document.body.appendChild(sidebar);

    const near = createConversation('near-id', 'Duplicate title');
    const far = createConversation('far-id', 'Duplicate title');
    const trigger = document.createElement('button');
    trigger.setAttribute('data-test-id', 'actions-menu-button');
    trigger.setAttribute('aria-label', 'More options for Duplicate title');
    sidebar.appendChild(trigger);

    setRect(trigger, 20, 210, 28, 28);
    setRect(near, 40, 200, 220, 32);
    setRect(far, 40, 420, 220, 32);

    const target = resolveSidebarConversationTarget(trigger);
    expect(target?.conversationId).toBe('near-id');
  });

  it('uses closest conversation container when trigger is nested inside it', () => {
    const conversation = document.createElement('div');
    conversation.setAttribute('data-test-id', 'conversation');
    const link = document.createElement('a');
    link.href = 'https://gemini.google.com/app/nested-id';
    link.textContent = 'Nested title';
    conversation.appendChild(link);

    const trigger = document.createElement('button');
    trigger.setAttribute('data-test-id', 'actions-menu-button');
    trigger.setAttribute('aria-label', 'More options for Nested title');
    conversation.appendChild(trigger);

    document.body.appendChild(conversation);

    const target = resolveSidebarConversationTarget(trigger);
    expect(target?.conversationId).toBe('nested-id');
  });

  it('returns null when no conversation target can be inferred', () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('data-test-id', 'actions-menu-button');
    trigger.setAttribute('aria-label', 'More options for Missing title');
    document.body.appendChild(trigger);

    const target = resolveSidebarConversationTarget(trigger);
    expect(target).toBeNull();
  });
});
