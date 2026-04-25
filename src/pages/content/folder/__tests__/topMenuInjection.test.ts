import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FolderManager } from '../manager';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

type TestableManager = {
  extractConversationInfoFromPage: () => { id: string; title: string; url: string } | null;
};

describe('extractConversationInfoFromPage', () => {
  let manager: TestableManager;

  beforeEach(() => {
    manager = new FolderManager() as unknown as TestableManager;
  });

  afterEach(() => {
    // Restore any mocked globals
    vi.restoreAllMocks();
    // Clean up any added DOM elements
    document.querySelectorAll('.conversation-title-container, top-bar-actions').forEach((el) => {
      el.remove();
    });
    // Reset location via JSDOM
    window.history.pushState({}, '', '/');
  });

  it('returns null when URL has no conversation ID', () => {
    window.history.pushState({}, '', '/');
    expect(manager.extractConversationInfoFromPage()).toBeNull();
  });

  it('returns null on the homepage (/app)', () => {
    window.history.pushState({}, '', '/app');
    expect(manager.extractConversationInfoFromPage()).toBeNull();
  });

  it('returns null on /app/ with no hex ID', () => {
    window.history.pushState({}, '', '/app/');
    expect(manager.extractConversationInfoFromPage()).toBeNull();
  });

  it('extracts ID from /app/<hexId> URL', () => {
    const hexId = 'a1b2c3d4e5f6a7b8';
    window.history.pushState({}, '', `/app/${hexId}`);

    // Add a title element to the DOM
    const titleContainer = document.createElement('div');
    titleContainer.className = 'conversation-title-container';
    const titleSpan = document.createElement('span');
    titleSpan.setAttribute('data-test-id', 'conversation-title');
    titleSpan.textContent = 'My Chat Title';
    titleContainer.appendChild(titleSpan);
    document.body.appendChild(titleContainer);

    const result = manager.extractConversationInfoFromPage();
    expect(result).not.toBeNull();
    expect(result!.id).toBe(hexId);
    expect(result!.title).toBe('My Chat Title');
    expect(result!.url).toContain(hexId);

    titleContainer.remove();
  });

  it('extracts ID from /gem/<gemId>/<hexId> URL', () => {
    const hexId = 'deadbeef12345678';
    window.history.pushState({}, '', `/gem/my-gem/${hexId}`);

    const titleContainer = document.createElement('div');
    titleContainer.className = 'conversation-title-container';
    const titleSpan = document.createElement('span');
    titleSpan.setAttribute('data-test-id', 'conversation-title');
    titleSpan.textContent = 'Gem Chat';
    titleContainer.appendChild(titleSpan);
    document.body.appendChild(titleContainer);

    const result = manager.extractConversationInfoFromPage();
    expect(result).not.toBeNull();
    expect(result!.id).toBe(hexId);
    expect(result!.url).toContain(`/gem/my-gem/${hexId}`);

    titleContainer.remove();
  });

  it('extracts ID from /u/1/app/<hexId> (multi-user prefix)', () => {
    const hexId = 'abcdef0123456789';
    window.history.pushState({}, '', `/u/1/app/${hexId}`);

    const el = document.createElement('div');
    el.className = 'conversation-title-container';
    const span = document.createElement('span');
    span.setAttribute('data-test-id', 'conversation-title');
    span.textContent = 'Multi-user chat';
    el.appendChild(span);
    document.body.appendChild(el);

    const result = manager.extractConversationInfoFromPage();
    expect(result).not.toBeNull();
    expect(result!.id).toBe(hexId);

    el.remove();
  });

  it('falls back to document.title when DOM title element is missing', () => {
    const hexId = 'a1b2c3d4e5f6a7b8';
    window.history.pushState({}, '', `/app/${hexId}`);

    // No title element in DOM — simulate document.title set by Gemini
    Object.defineProperty(document, 'title', {
      value: 'Async Title - Gemini',
      writable: true,
      configurable: true,
    });

    const result = manager.extractConversationInfoFromPage();
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Async Title');
    expect(result!.id).toBe(hexId);
  });

  it('falls back to "Untitled" when no title source is available', () => {
    const hexId = 'a1b2c3d4e5f6a7b8';
    window.history.pushState({}, '', `/app/${hexId}`);

    // No title element, document.title is default
    Object.defineProperty(document, 'title', {
      value: 'Google Gemini',
      writable: true,
      configurable: true,
    });

    const result = manager.extractConversationInfoFromPage();
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Untitled');
    expect(result!.id).toBe(hexId);
  });

  it('returns null for short hex IDs (less than 8 chars)', () => {
    window.history.pushState({}, '', '/app/a1b2c3');
    expect(manager.extractConversationInfoFromPage()).toBeNull();
  });

  it('returns null for non-hex IDs', () => {
    window.history.pushState({}, '', '/app/not-a-valid-id');
    expect(manager.extractConversationInfoFromPage()).toBeNull();
  });

  it('ignores disallowed titles like "New chat"', () => {
    const hexId = 'a1b2c3d4e5f6a7b8';
    window.history.pushState({}, '', `/app/${hexId}`);

    const el = document.createElement('div');
    el.className = 'conversation-title-container';
    const span = document.createElement('span');
    span.setAttribute('data-test-id', 'conversation-title');
    span.textContent = 'New chat';
    el.appendChild(span);
    document.body.appendChild(el);

    Object.defineProperty(document, 'title', {
      value: 'Google Gemini',
      writable: true,
      configurable: true,
    });

    const result = manager.extractConversationInfoFromPage();
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Untitled');

    el.remove();
  });

  it.each([
    '新对话',
    '新對話',
    '新しいチャット',
    '새 채팅',
    'Nuevo chat',
    'Nouveau chat',
    'Novo chat',
    'Новый чат',
    'محادثة جديدة',
  ])('ignores localized "New chat" placeholder: %s', (placeholder) => {
    const hexId = 'a1b2c3d4e5f6a7b8';
    window.history.pushState({}, '', `/app/${hexId}`);

    const el = document.createElement('div');
    el.className = 'conversation-title-container';
    const span = document.createElement('span');
    span.setAttribute('data-test-id', 'conversation-title');
    span.textContent = placeholder;
    el.appendChild(span);
    document.body.appendChild(el);

    Object.defineProperty(document, 'title', {
      value: 'Google Gemini',
      writable: true,
      configurable: true,
    });

    const result = manager.extractConversationInfoFromPage();
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Untitled');

    el.remove();
  });

  it('uses second selector when first has disallowed title', () => {
    const hexId = 'a1b2c3d4e5f6a7b8';
    window.history.pushState({}, '', `/app/${hexId}`);

    // First selector returns disallowed title
    const el1 = document.createElement('div');
    el1.className = 'conversation-title-container';
    const span1 = document.createElement('span');
    span1.setAttribute('data-test-id', 'conversation-title');
    span1.textContent = 'Gemini';
    el1.appendChild(span1);
    document.body.appendChild(el1);

    // Second selector returns valid title
    const el2 = document.createElement('div');
    el2.className = 'top-bar-actions';
    const span2 = document.createElement('span');
    span2.setAttribute('data-test-id', 'conversation-title');
    span2.textContent = 'Valid Title';
    el2.appendChild(span2);
    document.body.appendChild(el2);

    const result = manager.extractConversationInfoFromPage();
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Valid Title');

    el1.remove();
    el2.remove();
  });
});
