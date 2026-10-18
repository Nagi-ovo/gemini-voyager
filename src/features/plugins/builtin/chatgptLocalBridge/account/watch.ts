/**
 * Keeps `StorageKeys.BRIDGE_ACCOUNT_PLANS` up to date from what the page
 * observer reports, while the Local Bridge is mounted in this tab. Each write
 * starts from a fresh read so tabs of other accounts keep their entries.
 */
import { StorageKeys } from '@/core/types/common';
import {
  type AccountPlanStore,
  EMPTY_ACCOUNT_PLANS,
  readAccountPlanStore,
  recordAccountPlans,
  switchAccount,
} from '@/features/bridge/accountPlanStore';

import {
  type AccountObserverEvent,
  postToAccountObserver,
  readAccountObserverMessage,
} from './protocol';

const STORAGE_KEY = StorageKeys.BRIDGE_ACCOUNT_PLANS;

async function readStore(): Promise<AccountPlanStore> {
  try {
    const result = await chrome.storage.local.get({ [STORAGE_KEY]: null });
    return readAccountPlanStore(result?.[STORAGE_KEY]);
  } catch {
    return EMPTY_ACCOUNT_PLANS;
  }
}

/** Arm the observer and store its reports; the returned stop disarms it and drops late ones. */
export function watchAccountPlans(now: () => number = Date.now): () => void {
  let stopped = false;
  let writes: Promise<void> = Promise.resolve();

  const apply = (event: AccountObserverEvent): void => {
    if (event.type === 'ready') return;
    writes = writes
      .then(async () => {
        if (stopped) return;
        const store = await readStore();
        const next =
          event.type === 'plans'
            ? recordAccountPlans(store, event.plans, event.current, now())
            : switchAccount(store, event.account);
        if (next === store || stopped) return;
        await chrome.storage.local.set({ [STORAGE_KEY]: next });
      })
      .catch(() => undefined);
  };

  const onMessage = (event: MessageEvent): void => {
    const report = readAccountObserverMessage(event);
    if (!report) return;
    // The observer may load after this script: its `ready` asks to be armed again.
    if (report.type === 'ready') postToAccountObserver('arm');
    apply(report);
  };

  window.addEventListener('message', onMessage);
  postToAccountObserver('arm');
  return () => {
    stopped = true;
    window.removeEventListener('message', onMessage);
    postToAccountObserver('disarm');
  };
}
