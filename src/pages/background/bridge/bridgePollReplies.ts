/**
 * How the bridge owner names its policy verdict, reads the account plan a poll
 * carries, and reads what a serve refused in a poll.
 */
import { StorageKeys } from '@/core/types/common';
import { currentAccountPlan, readAccountPlanStore } from '@/features/bridge/accountPlanStore';
import type {
  AccountPlan,
  BridgeError,
  OpCapability,
  OpName,
  PolicyState,
  UpgradeSide,
} from '@/features/bridge/protocol';

import type { PolicyVerdict } from './bridgePolicy';
import type { StorageAreaLike } from './bridgeTaskStore';

export const policyLabel = (verdict: PolicyVerdict): PolicyState =>
  verdict.state === 'allowed' ? 'allowed' : verdict.code === 'policy-stale' ? 'stale' : 'denied';

export function isUpgradeSide(value: unknown): value is UpgradeSide {
  return value === 'extension' || value === 'cli';
}

/** The plan the bridge's ChatGPT pages last showed; it rides on every poll. */
export async function readPolledAccount(local: StorageAreaLike): Promise<AccountPlan | null> {
  try {
    const stored = await local.get(StorageKeys.BRIDGE_ACCOUNT_PLANS);
    return currentAccountPlan(readAccountPlanStore(stored[StorageKeys.BRIDGE_ACCOUNT_PLANS]));
  } catch {
    return null;
  }
}

/** The offered ops a serve's `bad-request` names as invalid, by their place in the poll. */
export function refusedOps(error: BridgeError, offered: readonly OpCapability[]): OpName[] {
  if (error.code !== 'bad-request') return [];
  const issues = error.details?.issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue: unknown) => {
    const path =
      typeof issue === 'object' && issue !== null ? (issue as { path?: unknown }).path : null;
    const index =
      typeof path === 'string' ? /^capabilities\.ops\[(\d+)\]/.exec(path)?.[1] : undefined;
    const op = index === undefined ? undefined : offered[Number(index)];
    return op ? [op.name] : [];
  });
}
