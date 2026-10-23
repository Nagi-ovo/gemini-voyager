/**
 * Google Drive on a phone: Firefox for Android has no `identity.launchWebAuthFlow`, so a
 * sign-in there can only fail, after opening whatever the browser offers. Every cloud sync
 * message that may reach Drive is answered here with a plain error instead; reading the
 * state, choosing a mode or provider and signing out pass through, since none of them signs in.
 */
import { googleDriveSyncService } from '@/core/services/GoogleDriveSyncService';
import type { FormFactor } from '@/core/types/formFactor';
import { readPlatformFormFactor } from '@/core/utils/formFactor';

/** The error a cloud sync message gets on a device where Drive cannot sign in. */
export const GOOGLE_DRIVE_UNAVAILABLE_ON_DEVICE = 'google_drive_unavailable_on_device';

const PASSES_ON_EVERY_DEVICE: ReadonlySet<string> = new Set([
  'gv.sync.getState',
  'gv.sync.setMode',
  'gv.sync.setProvider',
  'gv.sync.signOut',
]);

type SyncMessage = { type: string; payload?: unknown };
type SyncHandler = (
  message: SyncMessage,
  sender: chrome.runtime.MessageSender,
) => Promise<unknown> | null;

export interface DriveDeviceGuardDeps {
  readFormFactor?: () => Promise<FormFactor>;
  getState?: () => Promise<unknown>;
}

/**
 * Wraps the cloud sync handler: on a phone a message outside the pass list never reaches it.
 * The list names what may pass, so a Drive message added later is refused there by default.
 */
export function guardDriveOnPhones(
  handle: SyncHandler,
  {
    readFormFactor = readPlatformFormFactor,
    getState = () => googleDriveSyncService.getState(),
  }: DriveDeviceGuardDeps = {},
): SyncHandler {
  return (message, sender) => {
    if (!message.type.startsWith('gv.sync.') || PASSES_ON_EVERY_DEVICE.has(message.type)) {
      return handle(message, sender);
    }
    return (async () => {
      if ((await readFormFactor()) !== 'mobile') return handle(message, sender);
      return { ok: false, error: GOOGLE_DRIVE_UNAVAILABLE_ON_DEVICE, state: await getState() };
    })();
  };
}
