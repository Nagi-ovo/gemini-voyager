import { afterEach, describe, expect, it, vi } from 'vitest';

import claudeData from '@/features/plugins/catalog/sites/claude/site.json';
import { validateSiteAdapterData } from '@/features/plugins/sites/siteAdapterData';

import { buildCatalogExportAdapter } from '../adapter/platform/catalog';
import { readCatalogConversation } from './catalogReader';

function turnKey(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

/** Claude initially mounts messages 3..10; reaching the top loads the two older messages. */
function claudeFixture() {
  const validated = validateSiteAdapterData(claudeData);
  if (!validated.success) throw new Error(JSON.stringify(validated.error));
  const site = validated.data;
  document.body.innerHTML = '<main data-autoscroll-container="true"></main>';
  const scroller = document.querySelector<HTMLElement>('main')!;
  const items: HTMLElement[] = [];
  let historyLoaded = false;
  let historyScheduled = false;
  for (let index = 0; index < 10; index++) {
    const item = document.createElement('div');
    item.innerHTML =
      index % 2 === 0
        ? `<div data-cds="UserMessage" data-turn-key="${turnKey(index)}"><div><div><div><div data-testid="user-message">Prompt ${index}</div></div></div></div>`
        : `<div data-testid="assistant-message" data-turn-key="${turnKey(index)}-hub-reply" data-is-streaming="false"><p>Answer ${index}</p></div>`;
    items.push(item);
  }
  scroller.append(...items.slice(2));
  const height = () => (historyLoaded ? 18416 : 14816);
  let top = 2300;
  Object.defineProperties(scroller, {
    scrollTop: {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, Math.min(height() - 1213, value));
        if (top !== 0 || historyScheduled) return;
        historyScheduled = true;
        setTimeout(() => {
          scroller.prepend(...items.slice(0, 2));
          historyLoaded = true;
        }, 5);
      },
    },
    scrollHeight: { configurable: true, get: height },
    clientHeight: { configurable: true, value: 1213 },
  });
  return { site, scroller };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('Claude conversation export', () => {
  it('reads stable keys and roles while loading the virtualized conversation', async () => {
    vi.useFakeTimers();
    const { site, scroller } = claudeFixture();
    expect(
      scroller.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]'),
    ).toHaveLength(8);

    const pending = readCatalogConversation(
      site,
      buildCatalogExportAdapter(site),
      {},
      { pollMs: 10, stableSamples: 2, topTimeoutMs: 80, timeoutMs: 1000 },
    );
    await vi.advanceTimersByTimeAsync(1100);
    const result = await pending;

    expect(result.snapshots).toHaveLength(10);
    expect(result.snapshots.map(({ nativeId }) => nativeId)).toEqual(
      Array.from(
        { length: 10 },
        (_, index) => `data-turn-key:${turnKey(index)}${index % 2 === 1 ? '-hub-reply' : ''}`,
      ),
    );
    expect(result.snapshots.map(({ role }) => role)).toEqual(
      Array.from({ length: 10 }, (_, index) => (index % 2 === 0 ? 'user' : 'assistant')),
    );
    expect(result.snapshots.map(({ text }) => text)).toEqual(
      Array.from({ length: 10 }, (_, index) => `${index % 2 === 0 ? 'Prompt' : 'Answer'} ${index}`),
    );
    expect(result.completeness).toBe('complete');
    expect(scroller.scrollTop).toBe(2300);
  });
});
