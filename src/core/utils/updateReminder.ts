import { compareVersions } from './version';

const DEFAULT_MINIMUM_UPDATE_REMINDER_VERSION = '1.2.3';

interface UpdateReminderPolicyInput {
  currentVersion: string | null;
  isSafariBrowser: boolean;
  safariReminderEnabled: boolean;
  minimumReminderVersion?: string;
}

export function shouldShowUpdateReminderForCurrentVersion({
  currentVersion,
  isSafariBrowser,
  safariReminderEnabled,
  minimumReminderVersion = DEFAULT_MINIMUM_UPDATE_REMINDER_VERSION,
}: UpdateReminderPolicyInput): boolean {
  if (!currentVersion) return false;

  if (isSafariBrowser) {
    return safariReminderEnabled;
  }

  try {
    return compareVersions(currentVersion, minimumReminderVersion) < 0;
  } catch {
    return false;
  }
}
