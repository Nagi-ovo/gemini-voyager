import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.restoreAllMocks());

it('keeps the loaded model snapshot when an optimistic choice changes during the thinking read', async () => {
  vi.resetModules();
  let finishThinkingRead!: (items: Record<string, unknown>) => void;
  let signalThinkingRead!: () => void;
  const thinkingReadStarted = new Promise<void>((resolve) => {
    signalThinkingRead = resolve;
  });
  let finishModelWrite!: () => void;
  (chrome.storage.sync.set as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_items: unknown, callback: () => void) => {
      finishModelWrite = callback;
    },
  );
  const storedModel = { id: 'pro-id', name: '3.1 Pro' };
  (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (keys: string[], callback: (items: Record<string, unknown>) => void) => {
      if (keys.includes('gvDefaultThinkingLevel')) {
        finishThinkingRead = callback;
        signalThinkingRead();
      } else {
        callback({ gvDefaultModel: storedModel });
      }
    },
  );

  const { DefaultModelPreferences } = await import('../preferences');
  const preferences = new DefaultModelPreferences();
  const loading = preferences.reloadDefaults();
  await thinkingReadStarted;

  // A star click updates the shared cache before its storage write completes.
  const persisting = preferences.persistModel({ kind: 'name', name: 'Thinking' });
  finishThinkingRead({ gvDefaultThinkingLevel: { index: 1, label: 'Extended' } });
  const snapshot = await loading;

  expect(snapshot).toEqual({
    model: { kind: 'id', ...storedModel },
    thinking: { index: 1, label: 'Extended' },
  });
  expect(preferences.model).toEqual({ kind: 'name', name: 'Thinking' });
  finishModelWrite();
  await persisting;
});
