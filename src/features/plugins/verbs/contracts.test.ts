/**
 * Plan D9 against each primitive's committed `verbs/<name>/paramsBaseline.json`:
 * the test fails when a published param changes type or becomes required, or a
 * new param is required. Write the baseline when a primitive ships and append
 * a param when one is added; never edit an existing entry.
 */
import { describe, expect, it } from 'vitest';

import { resolveEngineVersion } from '../engineVersion';
import { engineSatisfied, parseSemver } from '../semver';
import {
  EFFECTIVE_PLUGIN_ENGINE_VERSION,
  PRIMITIVE_CONTRACTS,
  PRIMITIVE_NAME_PATTERN,
  SOURCE_PRIMITIVE_CONTRACTS,
  getPrimitiveContract,
} from './contracts';
import { loadPrimitiveContracts } from './loadContracts';
import { discoverPrimitives, listPrimitiveNames, verifyPrimitiveRegistry } from './registry';

interface BaselineParam {
  readonly type: string;
  readonly required: boolean;
  /** Present when the param was added after its primitive first shipped. */
  readonly sinceEngine?: string;
}
interface BaselinePrimitive {
  readonly sinceEngine: string;
  readonly params: Readonly<Record<string, BaselineParam>>;
}

const BASELINE_PATH = /^\.\/([^/]+)\/paramsBaseline\.json$/;
const baselines: Record<string, BaselinePrimitive> = Object.fromEntries(
  Object.entries(
    import.meta.glob<BaselinePrimitive>('./*/paramsBaseline.json', {
      eager: true,
      import: 'default',
    }),
  ).map(([path, entry]) => [BASELINE_PATH.exec(path)![1], entry]),
);
// A `next` baseline is a draft; stamping it makes these immutable D9 checks apply.
const published = Object.fromEntries(
  Object.entries(baselines).filter(([, entry]) => entry.sinceEngine !== 'next'),
);

describe('primitive contracts (plan D9: only ever add, only optional)', () => {
  it('every published primitive still exists with the same sinceEngine', () => {
    for (const [name, entry] of Object.entries(published)) {
      const contract = getPrimitiveContract(name);
      expect(contract, `primitive ${name} was published and must not disappear`).toBeDefined();
      expect(contract?.sinceEngine).toBe(entry.sinceEngine);
    }
  });

  it('no published param changed type or became required, and new params are optional', () => {
    for (const [name, entry] of Object.entries(published)) {
      const contract = getPrimitiveContract(name)!;
      for (const [param, spec] of Object.entries(entry.params)) {
        if (spec.sinceEngine === 'next') continue;
        const current = contract.params[param];
        expect(current, `${name}.${param} was published and must not disappear`).toBeDefined();
        expect(current.type).toBe(spec.type);
        if (!spec.required) expect(current.required).toBe(false);
        expect(current.sinceEngine, `${name}.${param} keeps its published engine`).toBe(
          spec.sinceEngine,
        );
      }
      for (const [param, spec] of Object.entries(contract.params)) {
        if (!(param in entry.params) || entry.params[param].sinceEngine === 'next') {
          expect(spec.required, `${name}.${param} is new and must be optional`).toBe(false);
        }
      }
    }
  });

  it('every contract has a baseline (write verbs/<name>/paramsBaseline.json when it ships)', () => {
    for (const contract of PRIMITIVE_CONTRACTS) {
      expect(
        baselines[contract.name],
        `add verbs/${contract.name}/paramsBaseline.json`,
      ).toBeDefined();
    }
  });

  it('draft baselines name the same unreleased batch as their source contracts', () => {
    for (const [name, baseline] of Object.entries(baselines)) {
      const source = SOURCE_PRIMITIVE_CONTRACTS.find((contract) => contract.name === name);
      expect(source, `baseline ${name} must have a contract`).toBeDefined();
      expect(source?.sinceEngine).toBe(baseline.sinceEngine);
      for (const [param, spec] of Object.entries(baseline.params)) {
        if (spec.sinceEngine !== 'next') continue;
        expect(source?.params[param]?.sinceEngine, `${name}.${param}`).toBe('next');
      }
      expect(getPrimitiveContract(name)?.sinceEngine).toBe(
        resolveEngineVersion(baseline.sinceEngine),
      );
    }
  });

  it('names are camelCase identifiers and sinceEngine never exceeds the current engine', () => {
    for (const contract of PRIMITIVE_CONTRACTS) {
      expect(contract.name).toMatch(PRIMITIVE_NAME_PATTERN);
      expect(parseSemver(contract.sinceEngine)).not.toBeNull();
      expect(engineSatisfied(`>=${contract.sinceEngine}`, EFFECTIVE_PLUGIN_ENGINE_VERSION)).toBe(
        true,
      );
      for (const [param, spec] of Object.entries(contract.params)) {
        if (!spec.sinceEngine) continue;
        expect(parseSemver(spec.sinceEngine), `${contract.name}.${param}`).not.toBeNull();
        expect(engineSatisfied(`>=${spec.sinceEngine}`, EFFECTIVE_PLUGIN_ENGINE_VERSION)).toBe(
          true,
        );
        expect(engineSatisfied(`>=${contract.sinceEngine}`, spec.sinceEngine)).toBe(true);
      }
    }
  });

  it('a param added after its primitive shipped names the engine that added it', () => {
    for (const [name, entry] of Object.entries(published)) {
      const contract = getPrimitiveContract(name)!;
      for (const [param, spec] of Object.entries(contract.params)) {
        const addedLater = !(param in entry.params) || entry.params[param].sinceEngine;
        if (!addedLater) continue;
        expect(spec.sinceEngine, `${name}.${param} needs a sinceEngine`).toBeDefined();
        expect(spec.sinceEngine).not.toBe(contract.sinceEngine);
      }
    }
  });

  it('the registry implements exactly the declared contracts, in name order', () => {
    const names = PRIMITIVE_CONTRACTS.map((contract) => contract.name);
    expect(verifyPrimitiveRegistry()).toEqual([]);
    expect(names).toEqual([...names].sort());
    expect(listPrimitiveNames()).toEqual(names);
  });
});

describe('primitive discovery', () => {
  const contract = (name: string) => ({
    name,
    sinceEngine: '1.0.0',
    semantic: [],
    params: {},
    description: name,
  });
  const primitive = (name: string | undefined) => ({
    contract: name === undefined ? undefined : contract(name),
    validateParams: () => ({ success: true, data: {} }),
    activate: () => undefined,
  });

  it('collects contracts by folder in name order and rejects a folder naming another primitive', () => {
    const loaded = loadPrimitiveContracts({
      './zeta/contract.ts': contract('zeta'),
      './alpha/contract.ts': contract('alpha'),
    });
    expect(loaded.map((entry) => entry.name)).toEqual(['alpha', 'zeta']);
    expect(() => loadPrimitiveContracts({ './alpha/contract.ts': contract('beta') })).toThrow(
      'verbs/alpha/contract.ts names "beta"',
    );
    expect(() => loadPrimitiveContracts({ './alpha/contract.ts': undefined })).toThrow(
      'verbs/alpha/contract.ts must export a `contract`',
    );
  });

  it('registers one primitive per folder and names each folder it cannot register', () => {
    const { primitives, problems } = discoverPrimitives({
      './zeta/index.ts': { zetaPrimitive: primitive('zeta'), helper: 1 },
      './alpha/index.ts': { alphaPrimitive: primitive('alpha') },
      './empty/index.ts': { helper: () => undefined },
      './loose/index.ts': { loosePrimitive: primitive(undefined) },
      './misnamed/index.ts': { misnamedPrimitive: primitive('other') },
    });
    expect([...primitives.keys()]).toEqual(['alpha', 'zeta']);
    expect(problems).toEqual([
      'verbs/empty/index.ts exports 0 primitives, expected 1',
      'primitive "loose" has no contract',
      'verbs/misnamed/index.ts exports primitive "other"; rename one to match',
    ]);
  });
});
