import type { StopNativeFeature } from '../featureLifecycle';
import { historyTimestampStore } from './historyTimestamps';

type HistoryTimestampSubscriber = Parameters<typeof historyTimestampStore.subscribe>[0];

interface PageSession {
  readonly ready: Promise<void>;
}

let current: PageSession | null = null;
let retired = false;

/**
 * The page's only owner of `historyTimestampStore.start()` and `stop()`.
 *
 * Folders, highlights, fork and export resolve aliases through the store whether or not a
 * timeline runs, so its lifetime is the page's, not any feature's. Consumers wait with
 * `whenHistoryTimestampsReady` and subscribe; none of them starts or stops the store.
 */
export function startHistoryTimestampPageService(): StopNativeFeature {
  const session: PageSession = { ready: historyTimestampStore.start() };
  current = session;
  retired = false;
  return () => {
    if (current !== session) return;
    current = null;
    retired = true;
    historyTimestampStore.stop();
  };
}

/**
 * Resolves `true` once the durable identity cache is hydrated, so the first lookup already
 * knows saved aliases. Without a page service there is nothing to wait for. Resolves `false`
 * when the page retired or `signal` aborted first: the caller must not attach anything then.
 */
export function whenHistoryTimestampsReady(signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted || retired) return Promise.resolve(false);
  const session = current;
  if (!session) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (ready: boolean) => {
      signal?.removeEventListener('abort', onAbort);
      resolve(ready);
    };
    const onAbort = () => finish(false);
    signal?.addEventListener('abort', onAbort, { once: true });
    const settle = () => finish(current === session && !signal?.aborted);
    void session.ready.then(settle, settle);
  });
}

/** Subscribe to parsed history updates; a retired page hands back a no-op. */
export function subscribeHistoryTimestamps(subscriber: HistoryTimestampSubscriber): () => void {
  if (retired) return () => {};
  return historyTimestampStore.subscribe(subscriber);
}
