import { afterEach, describe, expect, it, vi } from 'vitest';

import { FolderManager } from '../manager';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

type TestableManager = {
  collectPopulatedConversations: () => Array<{ id: string; title: string; url: string }>;
  destroy: () => void;
};

/** Build a native sidebar conversation row in the lr26 shape. */
function makeConversation(opts: { hexId?: string; title?: string | null }): HTMLElement {
  const item = document.createElement('gem-nav-list-item');
  item.setAttribute('data-test-id', 'conversation');
  if (opts.hexId) {
    const link = document.createElement('a');
    link.setAttribute('href', `/app/${opts.hexId}`);
    if (opts.title) {
      const titleEl = document.createElement('span');
      titleEl.className = 'title-text gds-body-s';
      titleEl.textContent = opts.title;
      link.appendChild(titleEl);
    }
    item.appendChild(link);
  }
  return item;
}

/** An empty virtualized stub: data-test-id present, but no link/title yet. */
function makeStub(): HTMLElement {
  const item = document.createElement('gem-nav-list-item');
  item.setAttribute('data-test-id', 'conversation');
  return item;
}

describe('AI Organize – collectPopulatedConversations', () => {
  let manager: FolderManager | null = null;

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function collect() {
    manager = new FolderManager();
    return (manager as unknown as TestableManager).collectPopulatedConversations();
  }

  it('collects id/title/url from populated rows', () => {
    document.body.append(
      makeConversation({ hexId: 'abcdef1234567890', title: 'First chat' }),
      makeConversation({ hexId: '0123456789abcdef', title: 'Second chat' }),
    );

    const result = collect();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'abcdef1234567890',
      title: 'First chat',
      url: 'https://gemini.google.com/app/abcdef1234567890',
    });
    expect(result[1].title).toBe('Second chat');
  });

  it('drops virtualized stubs that have no link yet (the #725 bug)', () => {
    document.body.append(makeStub(), makeStub(), makeStub());
    expect(collect()).toEqual([]);
  });

  it('returns only populated rows when stubs and real rows are mixed', () => {
    document.body.append(
      makeStub(),
      makeConversation({ hexId: 'aaaabbbbccccdddd', title: 'Real one' }),
      makeStub(),
    );

    const result = collect();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('aaaabbbbccccdddd');
  });

  it('dedupes rows that resolve to the same conversation id', () => {
    document.body.append(
      makeConversation({ hexId: 'deadbeefdeadbeef', title: 'Dup' }),
      makeConversation({ hexId: 'deadbeefdeadbeef', title: 'Dup' }),
    );

    const result = collect();
    expect(result).toHaveLength(1);
  });

  it('falls back to "Untitled" when a populated row has no readable title', () => {
    document.body.append(makeConversation({ hexId: 'feedfacefeedface', title: null }));

    const result = collect();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Untitled');
  });
});
