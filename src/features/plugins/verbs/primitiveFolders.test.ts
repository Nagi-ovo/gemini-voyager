/**
 * Static contract of `verbs/`: one folder per primitive, found by discovery,
 * so a folder is only safe to add when it is complete and its contract stays
 * data. Bun scripts and the published CLI load every `contract.ts` without the
 * DOM or the implementations; one that imports anything else would drag
 * content-script code into them.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PRIMITIVE_CONTRACTS, PRIMITIVE_NAME_PATTERN } from './contracts';

const verbsDir = dirname(fileURLToPath(import.meta.url));

/** The data modules a contract may import values from; anything else must be `import type`. */
const DATA_MODULES = ['../codeBlockDiagramParams'];

const primitiveFolders = readdirSync(verbsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

/**
 * Specifiers of every module the source loads at run time: static imports and
 * re-exports that are not `type`-only, plus any dynamic `import()` or `require()`.
 */
function valueImports(source: string): string[] {
  const statics = [
    ...source.matchAll(/^(?:import|export)\s+(type\s+)?(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm),
  ]
    .filter((match) => !match[1])
    .map((match) => match[2]);
  const dynamics = [...source.matchAll(/\b(?:import|require)\s*\(\s*['"]?([^'")]*)/g)].map(
    (match) => match[1],
  );
  return [...statics, ...dynamics];
}

describe('verbs/<name>/ primitive folders', () => {
  it.each(primitiveFolders)(
    '%s has a contract, an implementation and a params baseline',
    (name) => {
      for (const file of ['contract.ts', 'index.ts', 'paramsBaseline.json']) {
        expect(existsSync(join(verbsDir, name, file)), `verbs/${name}/${file}`).toBe(true);
      }
      expect(name).toMatch(PRIMITIVE_NAME_PATTERN);
    },
  );

  it('every folder is a contract named after it', () => {
    expect(PRIMITIVE_CONTRACTS.map((contract) => contract.name)).toEqual(primitiveFolders);
  });

  it.each(primitiveFolders)('%s/contract.ts imports nothing but types and data', (name) => {
    const source = readFileSync(join(verbsDir, name, 'contract.ts'), 'utf8');
    expect(valueImports(source).filter((spec) => !DATA_MODULES.includes(spec))).toEqual([]);
  });

  it('the shared data modules import nothing but types', () => {
    for (const module of [...DATA_MODULES.map((spec) => spec.slice(3)), 'contractTypes']) {
      const source = readFileSync(join(verbsDir, `${module}.ts`), 'utf8');
      expect(valueImports(source), module).toEqual([]);
    }
  });
});
