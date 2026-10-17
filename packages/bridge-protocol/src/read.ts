/**
 * Hand-written readers for untrusted JSON (no schema library, like the
 * extension's `manifest/validate.ts`). Each reader records an issue and returns
 * a placeholder when the input is wrong, so callers can keep reading and report
 * every issue at once; `validateWith` discards the value whenever any issue was
 * recorded. Readers copy only the fields they know: an unknown key never
 * reaches the validated value.
 */

export interface Issue {
  readonly path: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export type Reader<T> = (raw: unknown, path: string, issues: Issue[]) => T;

/** Ids that the server and the extension put into URL paths. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_STRING_LENGTH = 1_000_000;

const NOT_AN_OBJECT = 'must be an object';

export function validateWith<T>(reader: Reader<T>, raw: unknown): Validation<T> {
  const issues: Issue[] = [];
  const value = reader(raw, '', issues);
  return issues.length === 0 ? { ok: true, value } : { ok: false, issues: withoutCascade(issues) };
}

/** Drop the missing-field issues below a value that was not an object at all. */
function withoutCascade(issues: readonly Issue[]): Issue[] {
  const roots = issues
    .filter((issue) => issue.message === NOT_AN_OBJECT)
    .map((issue) => issue.path);
  const below = (path: string, root: string): boolean =>
    root === '$' ? path !== '$' : path.startsWith(`${root}.`) || path.startsWith(`${root}[`);
  return issues.filter((issue) => !roots.some((root) => below(issue.path, root)));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function at(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return path === '' ? key : `${path}.${key}`;
}

/** Report `message` at `path` (the root when empty). */
export function fail(issues: Issue[], path: string, message: string): void {
  issues.push({ path: path === '' ? '$' : path, message });
}

export function readObject(raw: unknown, path: string, issues: Issue[]): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  fail(issues, path, NOT_AN_OBJECT);
  return {};
}

export interface StringRule {
  readonly pattern?: RegExp;
  readonly maxLength?: number;
  /** Empty strings are rejected unless this is true. */
  readonly allowEmpty?: boolean;
}

function checkString(value: unknown, path: string, issues: Issue[], rule: StringRule): string {
  if (typeof value !== 'string') {
    fail(issues, path, 'must be a string');
    return '';
  }
  if (!rule.allowEmpty && value.length === 0) fail(issues, path, 'must not be empty');
  else if (value.length > (rule.maxLength ?? MAX_STRING_LENGTH)) {
    fail(issues, path, `must be at most ${rule.maxLength ?? MAX_STRING_LENGTH} characters`);
  } else if (rule.pattern && !rule.pattern.test(value)) {
    fail(issues, path, `must match ${rule.pattern.source}`);
  }
  return value;
}

export function requireString(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
  rule: StringRule = {},
): string {
  return checkString(rec[key], at(path, key), issues, rule);
}

export function optionalString(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
  rule: StringRule = {},
): string | undefined {
  return rec[key] === undefined ? undefined : checkString(rec[key], at(path, key), issues, rule);
}

/** A key that must be present and holds a string or `null`. */
export function nullableString(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
  rule: StringRule = {},
): string | null {
  return rec[key] === null ? null : checkString(rec[key], at(path, key), issues, rule);
}

export interface IntRule {
  readonly min?: number;
  readonly max?: number;
}

function checkInt(value: unknown, path: string, issues: Issue[], rule: IntRule): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail(issues, path, 'must be an integer');
    return 0;
  }
  const min = rule.min ?? 0;
  if (value < min) fail(issues, path, `must be at least ${min}`);
  else if (rule.max !== undefined && value > rule.max) {
    fail(issues, path, `must be at most ${rule.max}`);
  }
  return value;
}

export function requireInt(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
  rule: IntRule = {},
): number {
  return checkInt(rec[key], at(path, key), issues, rule);
}

export function optionalInt(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
  rule: IntRule = {},
): number | undefined {
  return rec[key] === undefined ? undefined : checkInt(rec[key], at(path, key), issues, rule);
}

export function nullableInt(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
  rule: IntRule = {},
): number | null {
  return rec[key] === null ? null : checkInt(rec[key], at(path, key), issues, rule);
}

export function requireBoolean(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
): boolean {
  const value = rec[key];
  if (typeof value === 'boolean') return value;
  fail(issues, at(path, key), 'must be a boolean');
  return false;
}

export function optionalBoolean(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
): boolean | undefined {
  return rec[key] === undefined ? undefined : requireBoolean(rec, key, path, issues);
}

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export function checkLiteral<T extends string>(
  value: unknown,
  path: string,
  issues: Issue[],
  values: readonly T[],
): T {
  if (isOneOf(values, value)) return value;
  fail(issues, path, `must be one of ${values.join(', ')}`);
  return values[0];
}

export function requireLiteral<T extends string>(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
  values: readonly T[],
): T {
  return checkLiteral(rec[key], at(path, key), issues, values);
}

export function optionalLiteral<T extends string>(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
  values: readonly T[],
): T | undefined {
  return rec[key] === undefined ? undefined : checkLiteral(rec[key], at(path, key), issues, values);
}

export interface ArrayRule {
  readonly min?: number;
  readonly max?: number;
}

export function checkArray<T>(
  value: unknown,
  path: string,
  issues: Issue[],
  item: Reader<T>,
  rule: ArrayRule = {},
): T[] {
  if (!Array.isArray(value)) {
    fail(issues, path, 'must be an array');
    return [];
  }
  if (value.length < (rule.min ?? 0)) fail(issues, path, `must have at least ${rule.min} items`);
  if (rule.max !== undefined && value.length > rule.max) {
    fail(issues, path, `must have at most ${rule.max} items`);
    return [];
  }
  return value.map((entry, index) => item(entry, at(path, index), issues));
}

export function requireArray<T>(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
  item: Reader<T>,
  rule: ArrayRule = {},
): T[] {
  return checkArray(rec[key], at(path, key), issues, item, rule);
}

export function optionalArray<T>(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
  item: Reader<T>,
  rule: ArrayRule = {},
): T[] | undefined {
  return rec[key] === undefined ? undefined : requireArray(rec, key, path, issues, item, rule);
}

/** Free-form JSON object (evidence, details, progress events): shape-checked, not inspected. */
export function requireRecord(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
): Readonly<Record<string, unknown>> {
  return readObject(rec[key], at(path, key), issues);
}

export function optionalRecord(
  rec: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issue[],
): Readonly<Record<string, unknown>> | undefined {
  return rec[key] === undefined ? undefined : requireRecord(rec, key, path, issues);
}

/** Reader for a bare string, such as an array item. */
export function stringItem(rule: StringRule = {}): Reader<string> {
  return (raw, path, issues) => checkString(raw, path, issues, rule);
}
