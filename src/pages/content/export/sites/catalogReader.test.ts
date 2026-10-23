import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SiteAdapter } from '@/features/plugins/types';
import { provideDiagramExport } from '@/features/plugins/verbs/diagramExportRegistry';

import type { ExportPlatformAdapter } from '../adapter/platformAdapters';
import { captureCatalogWindow, readCatalogConversation } from './catalogReader';

interface FixtureMessage {
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

const TIMING = { pollMs: 10, stableSamples: 2, topTimeoutMs: 80, timeoutMs: 500 };

function fixture(
  messages: readonly FixtureMessage[],
  options: {
    onScroll?: (top: number) => void;
    unstableTop?: boolean;
    windowSize?: number;
    reuse?: boolean;
    pinnedTail?: boolean;
  } = {},
) {
  document.body.innerHTML = '<div id="scroll"></div>';
  const scroller = document.querySelector<HTMLElement>('#scroll')!;
  const windowSize = options.windowSize ?? 4;
  const viewportHeight = windowSize * 100;
  const reused: HTMLElement[] = [];
  let position = Math.min(200, Math.max(0, messages.length * 100 - viewportHeight));
  let heightReads = 0;
  const render = () => {
    const start = Math.min(Math.floor(position / 100), Math.max(0, messages.length - windowSize));
    const window = messages
      .slice(start, start + windowSize - (options.pinnedTail ? 1 : 0))
      .map((message, offset) => ({ message, index: start + offset }));
    if (options.pinnedTail && messages.length) {
      window.push({ message: messages[messages.length - 1], index: messages.length - 1 });
    }
    const nodes = window.map(({ message, index }, offset) => {
      const node = options.reuse
        ? (reused[offset] ??= document.createElement('article'))
        : document.createElement('article');
      node.className = message.role;
      node.setAttribute('data-message-id', `${index}`);
      const content = document.createElement('div');
      content.className = 'markdown';
      const paragraph = document.createElement('p');
      paragraph.textContent = message.text;
      content.append(paragraph);
      node.replaceChildren(content);
      node.getBoundingClientRect = () => new DOMRect(0, index * 100 - position, 800, 100);
      return node;
    });
    scroller.replaceChildren(...nodes);
  };
  Object.defineProperties(scroller, {
    scrollTop: {
      configurable: true,
      get: () => position,
      set: (top: number) => {
        position = Math.max(0, Math.min(Math.max(0, messages.length * 100 - viewportHeight), top));
        render();
        options.onScroll?.(position);
      },
    },
    scrollHeight: {
      configurable: true,
      get: () => messages.length * 100 + (options.unstableTop ? ++heightReads : 0),
    },
    clientHeight: { configurable: true, value: viewportHeight },
  });
  render();
  const site: SiteAdapter = {
    id: 'fixture',
    label: 'Fixture',
    matches: ['https://example.com/*'],
    selectors: {
      userTurn: '.user',
      assistantTurn: '.assistant',
      scrollContainer: '#scroll',
      thinkingBlock: '.thoughts',
    },
    theme: { hostSelector: 'body', lightSelector: 'body', darkSelector: 'body.dark' },
    capabilities: new Set(['chat']),
    conversationIdPattern: '^/chat/([^/?#]+)',
    export: {
      version: 1,
      read: 'virtual',
      messageKey: 'data-message-id',
      generating: '#generating',
    },
  };
  const adapter: ExportPlatformAdapter = {
    site,
    getUserSelectors: () => ['.user'],
    getAssistantSelectors: () => ['.assistant'],
    extractConversationTitle: () => 'Fixture',
    extractConversationIdFromUrl: () => 'test',
    resolveConversationRoot: () => scroller,
    extractUserImage: (element) => element.querySelectorAll('img'),
    extractUserText: (_lines, parts, element) => {
      parts.push(element.textContent ?? '');
    },
    getUserAttachmentCandidates: () => undefined,
    extractAssistantImage: () => false,
    extractFormula: () => false,
    extractCodeBlock: () => false,
    extractInlineFormula: () => false,
  };
  return { site, adapter, scroller };
}

async function collect(input: ReturnType<typeof fixture>, signal?: AbortSignal) {
  const pending = readCatalogConversation(input.site, input.adapter, { signal }, TIMING);
  await vi.runAllTimersAsync();
  return pending;
}

beforeEach(() => {
  vi.useFakeTimers();
  history.replaceState(null, '', '/chat/test');
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('catalog conversation snapshots on a virtual list', () => {
  it('exports the whole unmounted history in order and retains adjacent identical user messages', async () => {
    const messages: FixtureMessage[] = [
      { role: 'user', text: 'Opening' },
      { role: 'assistant', text: 'First answer' },
      { role: 'user', text: 'Next question' },
      { role: 'user', text: '继续' },
      { role: 'user', text: '继续' },
      { role: 'assistant', text: 'Second answer' },
      { role: 'user', text: 'Last question' },
      { role: 'assistant', text: 'Last answer' },
      { role: 'user', text: 'Final question' },
      { role: 'assistant', text: 'Final answer' },
    ];
    const input = fixture(messages);
    const result = await collect(input);
    expect(result.completeness).toBe('complete');
    expect(result.snapshots.map(({ role, text }) => ({ role, text }))).toEqual(messages);
    expect(new Set(result.snapshots.map(({ id }) => id)).size).toBe(messages.length);
    expect(result.snapshots[0].content.html).toContain('Opening');
    expect(result.snapshots[0].host.deref()?.isConnected).not.toBe(true);
    expect(input.scroller.scrollTop).toBe(200);
  });

  it('deduplicates remounted messages by native id while preserving identical bodies', async () => {
    const messages = Array.from({ length: 10 }, () => ({ role: 'user' as const, text: '继续' }));
    const input = fixture(messages);
    const result = await collect(input);
    expect(result.completeness).toBe('complete');
    expect(result.snapshots.map(({ id }) => id)).toEqual(
      messages.map((_, index) => `data-message-id:${index}`),
    );
    expect(result.snapshots.map(({ text }) => text)).toEqual(messages.map(({ text }) => text));
  });

  it('updates a native message snapshot when its placeholder hydrates without scrolling', async () => {
    const messages = Array.from({ length: 6 }, (_, i) => ({
      role: 'user' as const,
      text: `Message ${i}`,
    }));
    messages[5].text = 'Loading';
    let hydrationScheduled = false;
    const input = fixture(messages, {
      onScroll: (top) => {
        if (top !== 200 || hydrationScheduled) return;
        hydrationScheduled = true;
        setTimeout(() => {
          messages[5].text = 'Hydrated final answer';
          document.querySelector('[data-message-id="5"] p')!.textContent = messages[5].text;
        }, 5);
      },
    });
    const result = await collect(input);
    const hydrated = result.snapshots.find(({ id }) => id === 'data-message-id:5');
    expect(result.completeness).toBe('complete');
    expect(hydrated?.text).toBe('Hydrated final answer');
    expect(hydrated?.content.html).toContain('Hydrated final answer');
    expect(hydrated?.content.html).not.toContain('Loading');
  });

  it('places native messages before the final reply a sparse virtual list keeps pinned', async () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: 'user' as const,
      text: `Message ${i}`,
    }));
    const result = await collect(fixture(messages, { windowSize: 3, pinnedTail: true }));
    expect(result.completeness).toBe('complete');
    expect(result.snapshots.map(({ text }) => text)).toEqual(messages.map(({ text }) => text));
    expect(result.snapshots.map(({ id }) => id)).toEqual(
      messages.map((_, index) => `data-message-id:${index}`),
    );
  });

  it('stops as soon as generation starts and restores the scroll position', async () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({
      role: 'user' as const,
      text: `Message ${i}`,
    }));
    const input = fixture(messages, {
      onScroll: (top) => {
        if (top >= 400 && !document.querySelector('#generating')) {
          const indicator = document.createElement('span');
          indicator.id = 'generating';
          document.body.append(indicator);
        }
      },
    });
    const result = await collect(input);
    expect(result.completeness).toBe('partial');
    expect(result.reason).toBe('generating');
    expect(result.snapshots.length).toBeLessThan(messages.length);
    expect(input.scroller.scrollTop).toBe(200);
  });

  it('does not claim completeness when earlier history never stabilizes at the top', async () => {
    const input = fixture(
      Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, text: `${i}` })),
      { unstableTop: true },
    );
    const result = await collect(input);
    expect(result.completeness).toBe('partial');
    expect(result.reason).toBe('top');
    expect(input.scroller.scrollTop).toBe(200);
  });

  it('stops on a route change before recording another conversation', async () => {
    const input = fixture(
      Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, text: `${i}` })),
      {
        onScroll: (top) => {
          if (top >= 400) history.replaceState(null, '', '/chat/another');
        },
      },
    );
    const result = await collect(input);
    expect(result.completeness).toBe('partial');
    expect(result.reason).toBe('route');
    expect(result.snapshots.length).toBeLessThan(10);
    expect(input.scroller.scrollTop).toBe(200);
  });

  it('cancels a pending read and still restores scroll', async () => {
    const input = fixture(
      Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, text: `${i}` })),
    );
    const controller = new AbortController();
    const pending = readCatalogConversation(
      input.site,
      input.adapter,
      { signal: controller.signal },
      TIMING,
    );
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await vi.runAllTimersAsync();
    await rejected;
    expect(input.scroller.scrollTop).toBe(200);
  });

  it('keeps keyed order and completeness when layout height changes during scrolling', async () => {
    const messages = ['A', 'B', 'C', 'D'].map((text) => ({ role: 'user' as const, text }));
    const input = fixture(messages, {
      windowSize: 3,
      reuse: true,
      onScroll: (top) => {
        input.scroller.querySelectorAll<HTMLElement>('article').forEach((host, rank) => {
          host.getBoundingClientRect = () => new DOMRect(0, rank * 100 + top * 2, 800, 100 + top);
        });
      },
    });
    const result = await collect(input);
    expect(result.snapshots.map(({ text }) => text)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.completeness).toBe('complete');
  });

  it('reads only the mounted window once without merging identical messages or changing the DOM', async () => {
    const messages = ['Old 0', 'Old 1', '继续', '继续', '继续', 'Old 5'].map((text) => ({
      role: 'user' as const,
      text,
    }));
    const input = fixture(messages, { windowSize: 3 });
    const mounted = {
      ...input,
      site: { ...input.site, export: { version: 1 as const, read: 'mounted' as const } },
    };
    const first = input.scroller.firstElementChild;
    const result = await collect(mounted);
    expect(result.snapshots.map(({ text }) => text)).toEqual(['继续', '继续', '继续']);
    expect(new Set(result.snapshots.map(({ id }) => id)).size).toBe(3);
    expect(result.completeness).toBe('unknown');
    expect(input.scroller.firstElementChild).toBe(first);
    expect(input.scroller.scrollTop).toBe(200);
  });

  it('uses the existing rich-content extractor and excludes thoughts and controls from snapshots', () => {
    const input = fixture([{ role: 'assistant', text: 'Visible answer' }]);
    const live = input.scroller.querySelector<HTMLElement>('article')!;
    live.innerHTML =
      '<div class="thoughts">Private reasoning</div><div class="markdown"><p><strong>Visible</strong> answer</p><div role="button">Copy</div><pre data-gv-diagram-owner="mermaid:1"><code>graph TD; A--&gt;B</code></pre></div>';
    const block = live.querySelector('pre')!;
    const withdraw = provideDiagramExport(block, () => ({
      html: '<img alt="Chart" src="data:image/png;base64,AA==">',
      text: '```mermaid\ngraph TD; A-->B\n```',
    }));
    const [snapshot] = captureCatalogWindow(input.site, input.adapter);
    withdraw();
    expect(snapshot.content.text).toContain('**Visible** answer');
    expect(snapshot.content.text).toContain('```mermaid');
    expect(snapshot.content.html).toContain('alt="Chart"');
    expect(snapshot.content.html).not.toContain('Private reasoning');
    expect(snapshot.content.text).not.toContain('Copy');
    expect(live.textContent).toContain('Private reasoning');
  });
});
