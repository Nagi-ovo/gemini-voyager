/** Narrowing guards for UNTRUSTED JSON, shared by the manifest validators. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}
export function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
