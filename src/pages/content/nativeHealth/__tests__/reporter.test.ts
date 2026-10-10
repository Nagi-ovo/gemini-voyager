// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/u/1/app/0123456789abcdef" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NATIVE_HEALTH_STATUS_MESSAGE } from '@/core/gemini/nativeHealth';

import { NativeHealthReporter } from '../index';
import { MIN_CONVERSATION_TEXT_CHARS, hasRenderedConversationContent } from '../pageEvidence';

const GRACE_MS = 1_000;
const CONVERSATION_PATH = '/u/1/app/0123456789abcdef';
const conversationText = 'Rendered conversation text. '.repeat(20);

type MessageListener = (message: unknown, sender: unknown, respond: (r: unknown) => void) => void;

function renderConversation(text = conversationText): void {
  document.body.innerHTML = `<main><div class="renamed-turn"><p>${text}</p></div></main>`;
}

function lastMessageListener(): MessageListener {
  const calls = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls;
  return calls[calls.length - 1][0] as unknown as MessageListener;
}

function askStatus(listener: MessageListener): unknown {
  let response: unknown;
  listener({ type: NATIVE_HEALTH_STATUS_MESSAGE }, {}, (value) => {
    response = value;
  });
  return response;
}

describe('NativeHealthReporter', () => {
  let reporter: NativeHealthReporter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    history.replaceState(null, '', CONVERSATION_PATH);
    renderConversation();
    reporter = new NativeHealthReporter(GRACE_MS);
    reporter.start();
  });

  afterEach(() => {
    reporter.stop();
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const missingTurns = (recheck = () => false) => ({
    route: 'conversation' as const,
    recheck,
    expected: () => hasRenderedConversationContent(),
  });

  it('waits out the grace period before reporting a miss', () => {
    vi.setSystemTime(Date.UTC(2026, 9, 1, 12, 0));
    reporter.reportMissing('timeline', missingTurns());

    vi.advanceTimersByTime(GRACE_MS - 1);
    expect(reporter.getEntries()).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(reporter.getEntries()).toEqual([
      {
        feature: 'timeline',
        anchor: 'turn.user',
        status: 'broken',
        route: 'conversation',
        firstSeenAt: Date.UTC(2026, 9, 1, 12, 0, 1),
        lastSeenAt: Date.UTC(2026, 9, 1, 12, 0, 1),
        extensionVersion: 'unknown',
      },
    ]);
  });

  it('does not report when the anchor appears before the verdict', () => {
    let present = false;
    reporter.reportMissing(
      'timeline',
      missingTurns(() => present),
    );
    present = true;
    vi.advanceTimersByTime(GRACE_MS);
    expect(reporter.getEntries()).toEqual([]);

    reporter.reportMissing('timeline', missingTurns());
    reporter.reportFound('timeline');
    vi.advanceTimersByTime(GRACE_MS);
    expect(reporter.getEntries()).toEqual([]);
  });

  it('never alarms on a new chat, where there are no turns to find', () => {
    for (const path of ['/app', '/u/1/app', '/gem/coding-partner']) {
      history.replaceState(null, '', path);
      reporter.reportMissing('timeline', missingTurns());
      expect(vi.getTimerCount(), path).toBe(0);
    }
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(reporter.getEntries()).toEqual([]);
  });

  it('never alarms on a conversation route that has not rendered content', () => {
    document.body.innerHTML =
      '<main><button>Tools</button><div contenteditable="true">' +
      'draft '.repeat(80) +
      '</div><p>Gemini can make mistakes</p></main>';
    reporter.reportMissing('timeline', missingTurns());
    vi.advanceTimersByTime(GRACE_MS);
    expect(reporter.getEntries()).toEqual([]);
  });

  it('clears an entry once the owner finds its anchor again', () => {
    reporter.reportMissing('export', missingTurns());
    vi.advanceTimersByTime(GRACE_MS);
    expect(reporter.getEntries().map((entry) => entry.feature)).toEqual(['export']);

    reporter.reportFound('export');
    expect(reporter.getEntries()).toEqual([]);
  });

  it('keeps firstSeenAt when a later verdict confirms the miss', () => {
    vi.setSystemTime(Date.UTC(2026, 9, 1, 12, 0));
    reporter.reportMissing('timeline', missingTurns());
    vi.advanceTimersByTime(GRACE_MS);
    reporter.reportMissing('timeline', missingTurns());
    vi.advanceTimersByTime(GRACE_MS);
    const [entry] = reporter.getEntries();
    expect(entry.firstSeenAt).toBe(Date.UTC(2026, 9, 1, 12, 0, 1));
    expect(entry.lastSeenAt).toBe(Date.UTC(2026, 9, 1, 12, 0, 2));
  });

  it('drops an entry when the page leaves the route the probe needs', () => {
    reporter.reportMissing('timeline', missingTurns());
    vi.advanceTimersByTime(GRACE_MS);
    history.replaceState(null, '', '/app');
    reporter.reportMissing('timeline', missingTurns());
    expect(reporter.getEntries()).toEqual([]);
  });

  describe('scopes reports to the page they were made on', () => {
    const confirmMiss = () => {
      reporter.reportMissing('export', missingTurns());
      vi.advanceTimersByTime(GRACE_MS);
      expect(reporter.getEntries().map((entry) => entry.feature)).toEqual(['export']);
    };

    it('drops a confirmed failure after navigating to another conversation', () => {
      confirmMiss();
      history.replaceState(null, '', '/u/1/app/fedcba9876543210');
      expect(reporter.getEntries()).toEqual([]);
      expect((askStatus(lastMessageListener()) as { entries: unknown[] }).entries).toEqual([]);
    });

    it('drops a confirmed failure after opening a new chat', () => {
      confirmMiss();
      history.replaceState(null, '', '/u/1/app');
      expect(reporter.getEntries()).toEqual([]);
    });

    it('drops a confirmed failure after switching account on the same conversation', () => {
      confirmMiss();
      history.replaceState(null, '', '/u/2/app/0123456789abcdef');
      expect(reporter.getEntries()).toEqual([]);
    });

    it('does not carry elapsed grace into the next conversation', () => {
      reporter.reportMissing('timeline', missingTurns());
      vi.advanceTimersByTime(GRACE_MS - 1);
      history.replaceState(null, '', '/u/1/app/fedcba9876543210');
      reporter.reportMissing('timeline', missingTurns());

      vi.advanceTimersByTime(1);
      expect(reporter.getEntries()).toEqual([]);
      vi.advanceTimersByTime(GRACE_MS - 1);
      expect(reporter.getEntries().map((entry) => entry.feature)).toEqual(['timeline']);
    });

    it('drops a pending probe whose page is gone by the verdict', () => {
      reporter.reportMissing('timeline', missingTurns());
      history.replaceState(null, '', '/u/1/app/fedcba9876543210');
      vi.advanceTimersByTime(GRACE_MS);
      expect(reporter.getEntries()).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('postpones the verdict while the tab is hidden', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    reporter.reportMissing('timeline', missingTurns());
    vi.advanceTimersByTime(GRACE_MS * 3);
    expect(reporter.getEntries()).toEqual([]);

    visibility.mockReturnValue('visible');
    vi.advanceTimersByTime(GRACE_MS);
    expect(reporter.getEntries()).toHaveLength(1);
  });

  it('answers the popup with closed identifiers only', () => {
    reporter.reportMissing('folders', {
      route: 'any',
      status: 'degraded',
      recheck: () => false,
    });
    vi.advanceTimersByTime(GRACE_MS);

    const listener = lastMessageListener();
    const response = askStatus(listener) as { ok: boolean; entries: unknown[] };
    expect(response.ok).toBe(true);
    expect(response.entries).toEqual([
      expect.objectContaining({ feature: 'folders', anchor: 'folder.sidebarAnchor' }),
    ]);
    expect(JSON.stringify(response)).not.toContain('0123456789abcdef');
    expect(JSON.stringify(response)).not.toContain('Rendered conversation');

    let unrelated: unknown = 'untouched';
    listener({ type: 'gv.other' }, {}, (value) => {
      unrelated = value;
    });
    expect(unrelated).toBe('untouched');
  });

  it('stops cleanly: timers, entries and the popup listener all go', () => {
    reporter.reportMissing('timeline', missingTurns());
    reporter.reportMissing('composer', { route: 'conversation', recheck: () => false });
    vi.advanceTimersByTime(GRACE_MS);
    reporter.reportMissing('timeline', missingTurns());
    const listener = lastMessageListener();

    reporter.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(reporter.getEntries()).toEqual([]);
    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(listener);

    reporter.reportMissing('timeline', missingTurns());
    vi.advanceTimersByTime(GRACE_MS);
    expect(vi.getTimerCount()).toBe(0);
    expect(reporter.getEntries()).toEqual([]);
  });

  it('treats a throwing owner check as no evidence', () => {
    reporter.reportMissing('timeline', {
      route: 'conversation',
      recheck: () => {
        throw new Error('detached');
      },
    });
    vi.advanceTimersByTime(GRACE_MS);
    expect(reporter.getEntries()).toEqual([]);
  });
});

describe('hasRenderedConversationContent', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('counts conversation text but not controls, the composer or Voyager UI', () => {
    const filler = 'x'.repeat(MIN_CONVERSATION_TEXT_CHARS);
    document.body.innerHTML = `<main>
      <button>${filler}</button>
      <div role="button">${filler}</div>
      <div contenteditable="true">${filler}</div>
      <textarea>${filler}</textarea>
      <div class="gv-folder-container">${filler}</div>
    </main><aside>${filler}</aside>`;
    expect(hasRenderedConversationContent()).toBe(false);

    document.querySelector('main')!.insertAdjacentHTML('beforeend', `<p>${filler}</p>`);
    expect(hasRenderedConversationContent()).toBe(true);
  });

  it('needs a main region rather than falling back to the sidebar text', () => {
    document.body.innerHTML = `<div>${'x'.repeat(MIN_CONVERSATION_TEXT_CHARS * 2)}</div>`;
    expect(hasRenderedConversationContent()).toBe(false);
  });
});
