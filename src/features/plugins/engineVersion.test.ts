import { afterEach, describe, expect, it, vi } from 'vitest';

import { PLUGIN_ENGINE_VERSION } from './constants';
import { resolveEngineVersion, resolveManifestEngine } from './engineVersion';

const nextEngine = resolveEngineVersion('next');

afterEach(() => {
  vi.doUnmock('./verbs/contractModules');
  vi.resetModules();
});

describe('unreleased plugin engines', () => {
  it('resolves versions and minimum ranges to the next minor with patch zero', () => {
    expect(resolveEngineVersion('next', '1.7.4')).toBe('1.8.0');
    expect(resolveEngineVersion('>=next', '2.9.0')).toBe('>=2.10.0');
    expect(resolveEngineVersion('>=1.3.0', '1.7.0')).toBe('>=1.3.0');
    expect(() => resolveEngineVersion('next', 'invalid')).toThrow('Cannot resolve');
  });

  it('resolves only the engine field without mutating manifest data', () => {
    const raw = { engine: '>=next', name: 'next', contributes: { styles: [{ css: 'next' }] } };
    const resolved = resolveManifestEngine(raw);
    expect(resolved).toEqual({ ...raw, engine: `>=${nextEngine}` });
    expect(raw.engine).toBe('>=next');
    expect(resolveManifestEngine(null)).toBeNull();
  });

  it.each([
    { sinceEngine: '1.4.0', paramEngine: undefined, effective: PLUGIN_ENGINE_VERSION },
    { sinceEngine: 'next', paramEngine: undefined, effective: nextEngine },
    { sinceEngine: '1.4.0', paramEngine: 'next', effective: nextEngine },
  ])(
    'loads concrete contracts for $sinceEngine / $paramEngine',
    async ({ sinceEngine, paramEngine, effective }) => {
      vi.resetModules();
      vi.doMock('./verbs/contractModules', () => ({
        PRIMITIVE_CONTRACT_MODULES: {
          './demo/contract.ts': {
            name: 'demo',
            sinceEngine,
            semantic: [],
            description: 'Demo',
            params: {
              option: {
                type: 'boolean',
                required: false,
                description: 'Option',
                ...(paramEngine ? { sinceEngine: paramEngine } : {}),
              },
            },
          },
        },
      }));
      const contracts = await import('./verbs/contracts');
      expect(contracts.EFFECTIVE_PLUGIN_ENGINE_VERSION).toBe(effective);
      expect(contracts.getPrimitiveContract('demo')?.sinceEngine).toBe(
        sinceEngine === 'next' ? nextEngine : sinceEngine,
      );
      expect(contracts.getPrimitiveContract('demo')?.params.option.sinceEngine).toBe(
        paramEngine ? nextEngine : undefined,
      );
    },
  );
});
