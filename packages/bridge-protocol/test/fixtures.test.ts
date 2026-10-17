/**
 * Golden fixtures: the same JSON cases run in the extension and in voyager-cli,
 * so both sides accept and refuse exactly the same messages.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  isMessageKind,
  isOpName,
  validateMessage,
  validateOpParams,
  validateOpResult,
  type Validation,
} from '../src';

interface FixtureCase {
  readonly name: string;
  readonly kind: string;
  readonly op?: string;
  readonly input: unknown;
  readonly issuePath?: string;
}

const FIXTURES = join(__dirname, '../fixtures');

function loadCases(folder: 'valid' | 'invalid'): [string, FixtureCase][] {
  const dir = join(FIXTURES, folder);
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .flatMap((file) => {
      const cases = JSON.parse(readFileSync(join(dir, file), 'utf8')) as FixtureCase[];
      return cases.map((entry): [string, FixtureCase] => [`${file}: ${entry.name}`, entry]);
    });
}

function run(entry: FixtureCase): Validation<unknown> {
  if (entry.kind === 'opParams' || entry.kind === 'opResult') {
    if (!isOpName(entry.op)) throw new Error(`fixture names an unknown op: ${entry.op}`);
    return entry.kind === 'opParams'
      ? validateOpParams(entry.op, entry.input)
      : validateOpResult(entry.op, entry.input);
  }
  if (!isMessageKind(entry.kind)) throw new Error(`fixture names an unknown kind: ${entry.kind}`);
  return validateMessage(entry.kind, entry.input);
}

describe('bridge protocol fixtures', () => {
  it.each(loadCases('valid'))('accepts %s', (_label, entry) => {
    const result = run(entry);
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  it.each(loadCases('invalid'))('refuses %s', (_label, entry) => {
    const result = run(entry);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.path)).toContain(entry.issuePath);
  });
});
