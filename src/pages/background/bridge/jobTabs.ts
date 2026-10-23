/**
 * Which tab a job's op runs in (spec §3.1). A job works in the tab its latest
 * `conversation.open` created, recorded as its current tab in its
 * {@link BridgeTabOwner}; the order of the tab list (a hello rewrites a record)
 * never decides it.
 *
 * A job that never opened a tab (`voyager call`) borrows one only while the
 * bridge runs one job at a time and no job that ran beside others still holds a
 * tab: the extension cannot tell a job between two ops from one that ended, so
 * beside other jobs it is refused `busy` rather than handed a tab someone may
 * still be using.
 */
import type { TaskResultRequest } from '@/features/bridge/protocol';

import type { BridgeTabRecord, BridgeTaskStore } from './bridgeTaskStore';
import { fail } from './dispatchOutcome';

export type JobTab = { readonly tab: BridgeTabRecord } | { readonly refused: TaskResultRequest };

/** The tab `jobId`'s latest open created, while it is still recorded. */
export async function ownTab(
  store: BridgeTaskStore,
  jobId: string,
): Promise<BridgeTabRecord | null> {
  const owner = await store.tabOwner(jobId);
  if (!owner) return null;
  return (await store.listTabs()).find((tab) => tab.tabId === owner.tabId) ?? null;
}

/** `oneAtATime`: the bridge admits one job at a time now (the parallel switch is off). */
export async function jobTab(
  store: BridgeTaskStore,
  jobId: string,
  oneAtATime: boolean,
): Promise<JobTab> {
  const closed = { refused: fail('tab-closed', 'No bridge tab is open.') };
  if (await store.tabOwner(jobId)) {
    const own = await ownTab(store, jobId);
    return own ? { tab: own } : closed;
  }
  const tabs = await store.listTabs();
  if (tabs.length === 0) return closed;
  const owners = await store.listTabOwners();
  const besideOthers = owners.some(
    (owner) => owner.parallel && tabs.some((tab) => tab.jobId === owner.jobId),
  );
  const working = new Set((await store.listTasks()).map((task) => task.jobId));
  const free = tabs.filter((tab) => !working.has(tab.jobId));
  // Newest open first, as the one tab of the bridge before jobs ran side by side.
  const newest = free.reduce<BridgeTabRecord | null>(
    (best, tab) => (best && best.openedAt > tab.openedAt ? best : tab),
    null,
  );
  if (!oneAtATime || besideOthers || !newest) {
    return {
      refused: fail(
        'busy',
        'Every bridge tab belongs to a job that may still be running; close the tabs jobs left open.',
      ),
    };
  }
  return { tab: newest };
}
