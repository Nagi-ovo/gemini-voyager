import browser from 'webextension-polyfill';

import {
  NOTIFICATION_ENABLEMENT_MESSAGE,
  type NotificationEnablementPayload,
  type NotificationEnablementResult,
} from '../types/notificationEnablement';

export {
  NOTIFICATION_ENABLEMENT_MESSAGE,
  type NotificationEnablementPayload,
  type NotificationEnablementResult,
} from '../types/notificationEnablement';

/** The background retains permission intent even when its requesting popup closes. */
export async function requestNotificationEnablement(
  payload: NotificationEnablementPayload,
): Promise<NotificationEnablementResult> {
  try {
    const result: unknown = await browser.runtime.sendMessage({
      type: NOTIFICATION_ENABLEMENT_MESSAGE,
      payload,
    });
    if (!result || typeof result !== 'object') return { ok: false };
    const response = result as Record<string, unknown>;
    return {
      ok: response.ok === true,
      ...(typeof response.enabled === 'boolean' ? { enabled: response.enabled } : {}),
    };
  } catch {
    return { ok: false };
  }
}
