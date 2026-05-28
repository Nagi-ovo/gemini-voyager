/**
 * SiteRegistry — resolves the current URL to a `SiteAdapter`.
 *
 * The default registry ships Voyager's first-party adapters. The registry is
 * mutable so future work (or tests) can register additional sites without
 * touching the runtime.
 */
import type { SiteAdapter } from '../types';
import { aistudioAdapter } from './adapters/aistudio';
import { chatgptAdapter } from './adapters/chatgpt';
import { claudeAdapter } from './adapters/claude';
import { geminiAdapter } from './adapters/gemini';
import { grokAdapter } from './adapters/grok';
import { matchesAnyPattern } from './matchPattern';

export const DEFAULT_ADAPTERS: readonly SiteAdapter[] = [
  geminiAdapter,
  aistudioAdapter,
  chatgptAdapter,
  claudeAdapter,
  grokAdapter,
];

export class SiteRegistry {
  private readonly adapters: SiteAdapter[] = [];

  register(adapter: SiteAdapter): void {
    // Last registration wins for a given id (lets callers override a builtin).
    const existing = this.adapters.findIndex((a) => a.id === adapter.id);
    if (existing >= 0) this.adapters.splice(existing, 1);
    this.adapters.push(adapter);
  }

  /** First adapter whose match patterns match the URL, or null. */
  resolveByUrl(url: string): SiteAdapter | null {
    return this.adapters.find((adapter) => matchesAnyPattern(url, adapter.matches)) ?? null;
  }

  all(): readonly SiteAdapter[] {
    return this.adapters.slice();
  }

  static createDefault(): SiteRegistry {
    const registry = new SiteRegistry();
    for (const adapter of DEFAULT_ADAPTERS) registry.register(adapter);
    return registry;
  }
}
