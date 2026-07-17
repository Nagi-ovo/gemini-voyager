// Sent by the containing macOS app (SFSafariApplication.dispatchMessage) when
// the user clicks a native notification. Must match the Swift constant
// VoyagerNotificationDestination.openConversationMessageName.
export const NATIVE_OPEN_CONVERSATION_MESSAGE = 'gvOpenConversation';

const NATIVE_OPEN_CONVERSATION_ALLOWED_HOSTS = [
  'gemini.google.com',
  'aistudio.google.com',
  'chatgpt.com',
  'claude.ai',
];

/**
 * Parses an app-dispatched open-conversation message into a validated URL.
 * Safari may deliver the dispatched message either as the raw userInfo
 * dictionary or wrapped as {name, userInfo}; both shapes are accepted.
 * Returns null for anything that is not an allow-listed https conversation
 * URL, so the background never navigates to an attacker-controlled location.
 */
export function getNativeOpenConversationUrl(message: unknown): URL | null {
  const record = message as {
    type?: unknown;
    name?: unknown;
    url?: unknown;
    userInfo?: unknown;
  } | null;
  if (!record || typeof record !== 'object') return null;

  const payload = (
    record.userInfo && typeof record.userInfo === 'object' ? record.userInfo : record
  ) as { type?: unknown; url?: unknown };
  const type = payload.type ?? record.name;
  if (type !== NATIVE_OPEN_CONVERSATION_MESSAGE) return null;
  if (typeof payload.url !== 'string') return null;

  try {
    const url = new URL(payload.url);
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase();
    const allowed = NATIVE_OPEN_CONVERSATION_ALLOWED_HOSTS.some(
      (allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`),
    );
    return allowed ? url : null;
  } catch {
    return null;
  }
}
