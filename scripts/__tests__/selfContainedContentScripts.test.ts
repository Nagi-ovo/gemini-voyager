import type { OutputBundle } from 'rollup';
import { describe, expect, it } from 'vitest';

import { selfContainedContentScripts, selfContainedViolations } from '../../custom-vite-plugins';

const ENTRY = 'src/pages/content/shadowKeyGuardEntry.ts';
// The shape CRXJS emits when it inlines a content chunk.
const INLINE =
  '(function(){const n=["keydown"];for(const t of n)window.addEventListener(t,()=>{},!0);\n})()\n';

function chunk(
  overrides: Partial<{
    code: string;
    imports: string[];
    dynamicImports: string[];
    exports: string[];
  }> = {},
) {
  return { code: INLINE, imports: [], dynamicImports: [], exports: [], ...overrides };
}

describe('selfContainedViolations', () => {
  it('accepts one inline script that registers its listener', () => {
    expect(selfContainedViolations(chunk())).toEqual([]);
  });

  it.each([
    ['a shared chunk', chunk({ imports: ['assets/index-x.js'] }), 'imports'],
    [
      'a static import in the code',
      chunk({ code: `import{i as a}from"./index-x.js";a();` }),
      'import statement',
    ],
    [
      'a dynamic import',
      chunk({ code: `(async()=>{await import(chrome.runtime.getURL("a.js"))})()` }),
      'dynamic import',
    ],
    ['a dynamic import recorded by rollup', chunk({ dynamicImports: ['a.js'] }), 'dynamic import'],
    ['exports', chunk({ exports: ['onExecute'] }), 'exports'],
    ['no listener', chunk({ code: '(function(){})()' }), 'no listener'],
  ])('rejects %s', (_name, facts, problem) => {
    expect(selfContainedViolations(facts).join('; ')).toContain(problem);
  });
});

describe('selfContainedContentScripts', () => {
  function run(bundle: Record<string, unknown>): string | null {
    const plugin = selfContainedContentScripts([ENTRY]) as {
      generateBundle: (
        this: { error: (message: string) => never },
        options: unknown,
        bundle: OutputBundle,
      ) => void;
    };
    try {
      plugin.generateBundle.call(
        {
          error: (message: string) => {
            throw new Error(message);
          },
        },
        {},
        bundle as OutputBundle,
      );
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  }
  const entryChunk = (overrides = {}) => ({
    type: 'chunk',
    isEntry: true,
    facadeModuleId: `/repo/${ENTRY}`,
    ...chunk(overrides),
  });

  it('passes an inlined guard entry', () => {
    expect(run({ 'assets/shadowKeyGuardEntry.ts-a.js': entryChunk() })).toBeNull();
  });

  it('fails the build when the entry gets a loader or a shared chunk', () => {
    expect(
      run({
        'assets/shadowKeyGuardEntry.ts-a.js': entryChunk({ imports: ['assets/index-x.js'] }),
        'assets/shadowKeyGuardEntry.ts-loader-b.js': { type: 'asset' },
      }),
    ).toMatch(/imports assets\/index-x\.js.*dynamic-import loader/);
  });

  it('fails the build when the entry is missing', () => {
    expect(run({})).toContain('was not emitted');
  });
});
