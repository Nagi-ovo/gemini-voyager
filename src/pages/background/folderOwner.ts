/**
 * Background owner of folder writes (DESIGN-v2 §6). Dormant: while every site
 * in `FOLDER_WRITE_AUTHORITY` is `legacy`, each request is refused with
 * `not_owner` before any storage access, and startup writes only the authority fence.
 */
import { logger } from '@/core/services/LoggerService';
import { FOLDER_WRITE_AUTHORITY, type FolderAuthority } from '@/features/folder/owner/authority';
import { writeAuthorityFence } from '@/features/folder/owner/authorityFence';
import {
  type BundleRecoveryOptions,
  createBundleRecovery,
} from '@/features/folder/owner/bundleRecovery';
import {
  type FolderOwnerCore,
  createFolderOwnerCore,
} from '@/features/folder/owner/folderOwnerCore';
import type { FolderOwnerResponse } from '@/features/folder/owner/folderOwnerMessages';
import { type FolderSite, siteOfFolderKey } from '@/features/folder/owner/folderOwnerPolicy';
import {
  dispatchFolderOwnerRequest,
  isFolderOwnerMessage,
  parseFolderOwnerRequest,
} from '@/features/folder/owner/folderOwnerRequests';
import {
  type FolderOwnerSender,
  checkFolderOwnerSender,
} from '@/features/folder/owner/folderOwnerSenderGate';
import type { FolderOwnerStorageArea } from '@/features/folder/owner/folderOwnerState';
import { createAllowanceLedger } from '@/features/folder/owner/ownerAllowances';
import { drainOwnedKeys, hasOwnerSite } from '@/features/folder/owner/ownerStartup';
import { storageBudget } from '@/features/storage/storageBudget';
import { backgroundWriteQueue } from '@/features/storage/writeQueue';

type Authority = Readonly<Record<FolderSite, FolderAuthority>>;
const BUNDLE_RETRY_ALARM = 'gv-folder-owner-bundle-retry';

export const localFolderArea: FolderOwnerStorageArea = {
  get: (keys) => chrome.storage.local.get(keys),
  getAll: () => chrome.storage.local.get(null),
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};

export interface FolderOwnerHandlerDeps {
  core: FolderOwnerCore;
  authority?: Authority;
}

/**
 * The reply to `message`, or `null` when the message is not the folder owner's.
 * The sender gate (§6.8) runs before the request reaches the core.
 */
export function handleFolderOwnerMessage(
  message: unknown,
  sender: FolderOwnerSender,
  deps: FolderOwnerHandlerDeps,
): Promise<FolderOwnerResponse> | null {
  if (!isFolderOwnerMessage(message)) return null;
  // The gate needs the key, so parsing comes first: a malformed message from any sender gets
  // `bad_request`, which reveals nothing and reaches no storage.
  const request = parseFolderOwnerRequest(message);
  if (!request) return Promise.resolve({ kind: 'bad_request' });
  const decision = checkFolderOwnerSender(sender, request.key, {
    extensionId: chrome.runtime.id,
    extensionBaseUrl: chrome.runtime.getURL(''),
    authority: deps.authority ?? FOLDER_WRITE_AUTHORITY,
  });
  if (!decision.ok) return Promise.resolve({ kind: 'refused', reason: decision.reason });
  // Answer a turn the fence or bundle resolution rejected, or the client never retries.
  return dispatchFolderOwnerRequest(request, deps.core).catch((error: unknown) => {
    logger.warn('Folder owner turn failed', { error: String(error) });
    return { kind: 'refused', reason: 'write_failed' };
  });
}

export function startFolderOwner(authority: Authority = FOLDER_WRITE_AUTHORITY): FolderOwnerCore {
  const allowances = createAllowanceLedger(localFolderArea, authority);
  const fence = startupFence(authority, () => drainOwnedKeys(localFolderArea, core, authority));
  const core = createFolderOwnerCore({
    area: localFolderArea,
    authority,
    // Any core turn may write an owner site's keys, so each publishes the fence first (§3.3).
    serialize: (turn, readKeys) =>
      backgroundWriteQueue(async () => {
        await fence();
        return turn();
      }, readKeys),
    budget: storageBudget,
    allowances,
  });
  // Every registered client's pending allowance is reserved (R3.2); none while every site is legacy.
  if (hasOwnerSite(authority)) storageBudget.setReservations(() => allowances.reservedBytes());
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const reply = handleFolderOwnerMessage(message, sender, { core, authority });
    if (!reply) return undefined;
    void reply.then(sendResponse);
    return true;
  });
  if (hasOwnerSite(authority)) watchOwnedKeys(core, authority, fence);
  void fence().catch((error: unknown) =>
    logger.warn('Folder authority fence write failed', { error: String(error) }),
  );
  return core;
}

/**
 * Publishes this build's authority before startup touches any owner site's
 * keys (§3.3), then starts the drain (§6.7). A failed write is attempted again
 * by the next owner turn or bundle resolution, so it never blocks them for the
 * worker's lifetime; a prompt-library turn waits for it only to resolve an open bundle.
 */
function startupFence(authority: Authority, drain: () => Promise<void>): () => Promise<void> {
  let written: Promise<void> | null = null;
  return () =>
    (written ??= writeAuthorityFence(
      localFolderArea,
      chrome.runtime.getManifest().version,
      authority,
    )
      .then(() => {
        // Draining joins the queue whose turns await this fence, so awaiting it here would deadlock.
        void drain().catch((error: unknown) =>
          logger.warn('Folder owner startup drain failed', { error: String(error) }),
        );
      })
      .catch((error: unknown) => {
        written = null;
        throw error;
      }));
}

/**
 * Only a build that owns a site: the foreign-write detector, and bundle
 * resolution before affected queue turns of both owners (§9). With every site
 * legacy neither exists, so prompt-owner turns read exactly what they read today.
 */
function watchOwnedKeys(
  core: FolderOwnerCore,
  authority: Authority,
  fence: () => Promise<void>,
): void {
  const recovery = createBundleRecovery({
    area: localFolderArea,
    authority,
    serialize: backgroundWriteQueue,
    fence,
    setTimer: alarmTimer(BUNDLE_RETRY_ALARM),
    subscribe: (listener) => {
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    },
  });
  backgroundWriteQueue.setPrelude(recovery.prelude);
  recovery.start();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      // `observe` refuses keys of legacy sites without touching storage.
      if (siteOfFolderKey(key)) void core.observe(key, change.newValue);
    }
  });
}

/** A one-shot alarm: MV3 may terminate an idle worker before a 60-second `setTimeout` fires. */
function alarmTimer(name: string): BundleRecoveryOptions['setTimer'] {
  let fire: (() => void) | null = null;
  // Recovery retries at start, so an alarm left by an earlier worker would only wake one again.
  void chrome.alarms.clear(name);
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== name || !fire) return;
    const run = fire;
    fire = null;
    run();
  });
  return (run, ms) => {
    fire = run;
    void chrome.alarms.create(name, { delayInMinutes: ms / 60_000 });
    return () => {
      fire = null;
      void chrome.alarms.clear(name);
    };
  };
}
