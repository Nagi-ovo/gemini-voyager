/**
 * How the page lease arbiter (`pageLease.ts`) asks an old holder's document
 * whether its op stopped: `gv.bridge.lease.probe` to the tab, and the answer read
 * as {@link LeaseProbeOutcome}.
 */
import type { BridgeTabs, TabsApi } from './bridgeTabs';
import type { LeaseProbeOutcome } from './pageLease';

export function createLeaseProbe(tabs: BridgeTabs, api: TabsApi) {
  return async (lease: {
    tabId: number;
    leaseId: string;
    documentId?: string;
  }): Promise<LeaseProbeOutcome> => {
    if (!(await tabs.exists(lease.tabId))) return 'gone';
    try {
      const reply = await api.sendMessage(
        lease.tabId,
        { type: 'gv.bridge.lease.probe', leaseId: lease.leaseId },
        lease.documentId ? { documentId: lease.documentId } : undefined,
      );
      const stopped = (reply as { stopped?: unknown } | undefined)?.stopped;
      if (typeof stopped !== 'boolean') return 'no-answer';
      return stopped ? 'stopped' : 'running';
    } catch {
      // No receiver: the document is gone, or its bridge runtime (and every leased op) ended.
      return 'gone';
    }
  };
}
