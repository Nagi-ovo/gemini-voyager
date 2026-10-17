/**
 * This document's identity for the Local Bridge (spec §3.2). The background
 * learns it from `gv.bridge.hello` and repeats it in every `op.start` and grant,
 * so a message meant for an earlier document of the same tab (a reload, or a
 * navigation Firefox cannot tell apart without `documentId`) is refused.
 */

function randomNonce(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// One value per content-script instance: an extension reload injects a new script with its own.
const DOC_NONCE = randomNonce();

export function getDocNonce(): string {
  return DOC_NONCE;
}

export function isOwnDocNonce(value: unknown): boolean {
  return typeof value === 'string' && value === DOC_NONCE;
}
