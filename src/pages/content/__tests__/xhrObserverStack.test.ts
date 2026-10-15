import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The MAIN-world observers that wrap XMLHttpRequest, in manifest order.
const OBSERVERS = [
  'response-complete-observer.js',
  'usage-observer.js',
  'conversation-history-observer.js',
].map((name) => readFileSync(resolve(process.cwd(), 'public', name), 'utf-8'));

const INSTALL_FLAGS = [
  '__gvResponseCompleteObserverInstalled',
  '__gvUsageObserverInstalled',
  '__gvHistoryObserverInstalled',
] as const;

const NativeXMLHttpRequest = window.XMLHttpRequest;
const nativeFetch = window.fetch;

function resetPage(): void {
  for (const flag of INSTALL_FLAGS) delete (window as unknown as Record<string, unknown>)[flag];
  Object.defineProperty(window, 'XMLHttpRequest', {
    value: NativeXMLHttpRequest,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'fetch', {
    value: nativeFetch,
    writable: true,
    configurable: true,
  });
}

describe('stacked XMLHttpRequest observers', () => {
  beforeEach(() => {
    resetPage();
    vi.spyOn(window, 'postMessage').mockImplementation(() => {});
    // oxlint-disable-next-line no-eval -- evaluating the observers under test is what this suite exercises
    for (const source of OBSERVERS) (0, eval)(source);
  });

  afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
    vi.restoreAllMocks();
    resetPage();
  });

  it('keeps the page XMLHttpRequest constants and instanceof checks working', () => {
    expect(window.XMLHttpRequest).not.toBe(NativeXMLHttpRequest);

    const xhr = new window.XMLHttpRequest();

    expect(window.XMLHttpRequest.DONE).toBe(4);
    expect(window.XMLHttpRequest.UNSENT).toBe(0);
    expect(xhr).toBeInstanceOf(window.XMLHttpRequest);
    expect(xhr).toBeInstanceOf(NativeXMLHttpRequest);
    expect(typeof window.XMLHttpRequest.prototype.open).toBe('function');
  });
});
