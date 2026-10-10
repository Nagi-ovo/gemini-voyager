// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app/0123456789abcdef" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NATIVE_HEALTH_GRACE_MS, nativeHealthReporter } from '../../nativeHealth';
import { resolveExportAdapter } from '../adapter/platformAdapters';
import { createConversationCollector } from '../conversationCollector';
import { noteExportTurns } from '../exportHealth';

const RENAMED_CONVERSATION = `<main>
  <div class="renamed-user-turn"><p>${'How do I profile a slow query? '.repeat(6)}</p></div>
  <div class="renamed-model-turn"><p>${'Start with EXPLAIN ANALYZE and read the plan. '.repeat(6)}</p></div>
</main>`;

const KNOWN_CONVERSATION = `<main>
  <user-query><div class="user-query-bubble-with-background">${'Question text. '.repeat(10)}</div></user-query>
  <model-response><p>${'Answer text. '.repeat(20)}</p></model-response>
</main>`;

function featuresAfterGrace(): string[] {
  vi.advanceTimersByTime(NATIVE_HEALTH_GRACE_MS);
  return nativeHealthReporter.getEntries().map((entry) => `${entry.feature}:${entry.status}`);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  history.replaceState(null, '', '/app/0123456789abcdef');
  nativeHealthReporter.start();
});

afterEach(() => {
  nativeHealthReporter.stop();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('export', () => {
  const { collectChatPairs } = createConversationCollector(resolveExportAdapter());
  const probeExport = () =>
    noteExportTurns(collectChatPairs().length > 0, () => collectChatPairs().length > 0);

  it('reports broken when an export finds no turns in a rendered conversation', () => {
    document.body.innerHTML = RENAMED_CONVERSATION;
    expect(probeExport()).toBe(false);
    expect(featuresAfterGrace()).toEqual(['export:broken']);
  });

  it('stays healthy when the export finds turns', () => {
    document.body.innerHTML = KNOWN_CONVERSATION;
    expect(probeExport()).toBe(true);
    expect(featuresAfterGrace()).toEqual([]);
  });
});
