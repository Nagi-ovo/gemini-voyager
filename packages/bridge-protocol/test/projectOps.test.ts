/**
 * The `project.*` golden fixtures, read through the project readers and, once
 * the op tables list the project ops, through `validateOpParams` /
 * `validateOpResult` too, so both paths accept and refuse the same messages.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  isOpName,
  isProjectOpName,
  OP_VERSIONS,
  PROJECT_OP_NAMES,
  PROJECT_PARAM_READERS,
  PROJECT_RESULT_READERS,
  validateOpParams,
  validateOpResult,
  validateWith,
  type ProjectOpName,
  type Validation,
} from '../src';

interface FixtureCase {
  readonly name: string;
  readonly kind: 'opParams' | 'opResult';
  readonly op: string;
  readonly input: unknown;
  readonly issuePath?: string;
}

const FIXTURES = join(__dirname, '../fixtures/project-ops');

function load(file: 'valid' | 'invalid'): [string, FixtureCase][] {
  const cases = JSON.parse(readFileSync(join(FIXTURES, `${file}.json`), 'utf8')) as FixtureCase[];
  return cases.map((entry) => [entry.name, entry]);
}

function opOf(entry: FixtureCase): ProjectOpName {
  if (!isProjectOpName(entry.op)) throw new Error(`fixture names an unknown op: ${entry.op}`);
  return entry.op;
}

function viaProjectReaders(entry: FixtureCase): Validation<unknown> {
  const op = opOf(entry);
  const reader = entry.kind === 'opParams' ? PROJECT_PARAM_READERS[op] : PROJECT_RESULT_READERS[op];
  return validateWith<unknown>(reader, entry.input);
}

function viaOpTables(entry: FixtureCase): Validation<unknown> {
  const op = opOf(entry);
  if (!isOpName(op)) throw new Error(`${op} is not in OP_NAMES`);
  return entry.kind === 'opParams'
    ? validateOpParams(op, entry.input)
    : validateOpResult(op, entry.input);
}

const registered = PROJECT_OP_NAMES.every((op) => isOpName(op));

describe('project op fixtures', () => {
  it.each(load('valid'))('accepts %s', (_label, entry) => {
    const result = viaProjectReaders(entry);
    expect(result.ok ? [] : result.issues).toEqual([]);
  });

  it.each(load('invalid'))('refuses %s', (_label, entry) => {
    const result = viaProjectReaders(entry);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.path)).toContain(entry.issuePath);
  });

  it('copies only the fields it knows', () => {
    const result = validateWith(PROJECT_PARAM_READERS['project.remove'], {
      projectId: 'g-p-0123456789abcdef0123456789abcdef',
      name: 'notes.md',
      confirm: false,
    });
    expect(result).toEqual({
      ok: true,
      value: { projectId: 'g-p-0123456789abcdef0123456789abcdef', name: 'notes.md' },
    });
  });

  it('gives every project op a version', () => {
    for (const op of PROJECT_OP_NAMES) {
      expect((OP_VERSIONS as Readonly<Record<string, number>>)[op]).toBe(1);
    }
  });

  // Runs once the registration in `ops.ts` / `validate/ops.ts` lists the project ops.
  describe.runIf(registered)('through the op tables', () => {
    it.each(load('valid'))('accepts %s', (_label, entry) => {
      const result = viaOpTables(entry);
      expect(result.ok ? [] : result.issues).toEqual([]);
    });

    it.each(load('invalid'))('refuses %s', (_label, entry) => {
      const result = viaOpTables(entry);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.map((issue) => issue.path)).toContain(entry.issuePath);
    });
  });
});
