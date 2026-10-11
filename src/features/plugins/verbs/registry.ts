/**
 * Primitive registry — the whitelist behind the `native` op (plan §5).
 *
 * Keyed by primitive NAME (not plugin id: that is the separate, first-party
 * `nativeHandlers` binding for builtin plugins, left untouched until P4).
 * Every entry is first-party code bundled in the extension; a manifest can
 * only pick one by name and pass validated parameters.
 *
 * Each `verbs/<name>/index.ts` exports its primitive and is found here with
 * `import.meta.glob`, so adding a primitive is adding its folder. Vite-only:
 * Bun scripts and the CLI read the data-only `contracts.ts` instead.
 */
import { PRIMITIVE_CONTRACTS } from './contracts';
import type { Primitive } from './types';

const INDEX_PATH = /^\.\/([^/]+)\/index\.ts$/;

function isPrimitiveLike(value: unknown): value is Primitive<never> {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Primitive<never>>;
  return typeof candidate.validateParams === 'function' && typeof candidate.activate === 'function';
}

export interface DiscoveredPrimitives {
  readonly primitives: ReadonlyMap<string, Primitive<never>>;
  /** Folders whose `index.ts` could not be registered, by name. */
  readonly problems: readonly string[];
}

/**
 * The primitive each `./<name>/index.ts` module exports, keyed by name. A
 * folder must export exactly one primitive, and its contract must carry the
 * folder's name; anything else is reported, not registered.
 */
export function discoverPrimitives(
  modules: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): DiscoveredPrimitives {
  const primitives = new Map<string, Primitive<never>>();
  const problems: string[] = [];
  for (const path of Object.keys(modules).sort()) {
    const folder = INDEX_PATH.exec(path)?.[1];
    if (!folder) continue;
    const found = Object.values(modules[path]).filter(isPrimitiveLike);
    if (found.length !== 1) {
      problems.push(`verbs/${folder}/index.ts exports ${found.length} primitives, expected 1`);
      continue;
    }
    const name = found[0].contract?.name;
    if (name === undefined) {
      problems.push(`primitive "${folder}" has no contract`);
    } else if (name !== folder) {
      problems.push(`verbs/${folder}/index.ts exports primitive "${name}"; rename one to match`);
    } else {
      primitives.set(name, found[0]);
    }
  }
  return { primitives, problems };
}

const DISCOVERED = discoverPrimitives(
  import.meta.glob<Readonly<Record<string, unknown>>>('./*/index.ts', { eager: true }),
);
const PRIMITIVES = DISCOVERED.primitives;

export function getPrimitive(name: string): Primitive<never> | undefined {
  return PRIMITIVES.get(name);
}

export function hasPrimitive(name: string): boolean {
  return PRIMITIVES.has(name);
}

/** Every registered primitive name, sorted. */
export function listPrimitiveNames(): readonly string[] {
  return [...PRIMITIVES.keys()];
}

/** Every declared contract must have an implementation and vice versa. */
export function verifyPrimitiveRegistry(): string[] {
  const problems: string[] = [...DISCOVERED.problems];
  for (const contract of PRIMITIVE_CONTRACTS) {
    if (!PRIMITIVES.has(contract.name))
      problems.push(`contract "${contract.name}" has no primitive`);
  }
  for (const name of PRIMITIVES.keys()) {
    if (!PRIMITIVE_CONTRACTS.some((contract) => contract.name === name)) {
      problems.push(`primitive "${name}" has no contract`);
    }
  }
  return problems;
}
