// Shared message routing reads this protocol without initializing a browser client.
export const NOTIFICATION_ENABLEMENT_MESSAGE = 'gv.responseComplete.enablement';

export type NotificationEnablementPayload =
  | { action: 'begin'; requestId: string }
  | { action: 'finish'; requestId: string; granted: boolean }
  | { action: 'disable' }
  | { action: 'reconcile'; source: 'startup' | 'popup' };

export interface NotificationEnablementResult {
  ok: boolean;
  enabled?: boolean;
  recovered?: boolean;
}
