/**
 * PluginHost — orchestrates the plugin lifecycle for the current page.
 *
 * Flow on start():
 *   1. resolve the SiteAdapter for the current URL (may be null on unknown sites)
 *   2. load manifests from all configured sources (builtin now; marketplace later)
 *   3. load per-plugin enable state from storage
 *   4. reconcile: mount every plugin that (matches URL) AND (is enabled) AND
 *      (satisfies the engine version) AND (is not entitlement-locked); unmount the rest
 *   5. subscribe to state changes and re-reconcile (live enable/disable)
 *
 * All providers (registry, sources, entitlement) are injected so the host is
 * fully unit-testable and the monetization/marketplace seams can be swapped
 * without touching this class.
 */
import { logger } from '@/core/services/LoggerService';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { isScriptedTierSupported } from '../capabilities';
import { PLUGIN_ENGINE_VERSION } from '../constants';
import { LocalEntitlementProvider } from '../entitlement/LocalEntitlementProvider';
import { engineSatisfied } from '../semver';
import { matchesAnyPattern } from '../sites/matchPattern';
import { SiteRegistry } from '../sites/registry';
import { BuiltinPluginSource } from '../sources/BuiltinPluginSource';
import { MarketplacePluginSource } from '../sources/MarketplacePluginSource';
import { subscribeCatalog } from '../storage/catalogCache';
import { type PluginStateMap, loadPluginState, subscribePluginState } from '../storage/pluginState';
import type {
  EntitlementProvider,
  PluginManifest,
  PluginSettingValue,
  PluginSettings,
  PluginSource,
  SiteAdapter,
} from '../types';
import { DeclarativeEngine } from './declarativeEngine';

export interface PluginHostOptions {
  readonly url?: string;
  readonly registry?: SiteRegistry;
  readonly sources?: readonly PluginSource[];
  readonly entitlement?: EntitlementProvider;
  readonly doc?: Document;
}

export class PluginHost {
  private readonly url: string;
  private readonly registry: SiteRegistry;
  private readonly sources: readonly PluginSource[];
  private readonly entitlement: EntitlementProvider;
  private readonly doc: Document;

  private adapter: SiteAdapter | null = null;
  private engine: DeclarativeEngine | null = null;
  private manifests: readonly PluginManifest[] = [];
  private state: PluginStateMap = {};
  private unsubscribeState: (() => void) | null = null;
  private unsubscribeCatalog: (() => void) | null = null;
  private started = false;

  constructor(options: PluginHostOptions = {}) {
    this.url = options.url ?? location.href;
    this.registry = options.registry ?? SiteRegistry.createDefault();
    this.sources = options.sources ?? [new BuiltinPluginSource(), new MarketplacePluginSource()];
    this.entitlement = options.entitlement ?? new LocalEntitlementProvider();
    this.doc = options.doc ?? document;
  }

  get activeAdapter(): SiteAdapter | null {
    return this.adapter;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      this.adapter = this.registry.resolveByUrl(this.url);
      this.engine = new DeclarativeEngine({ doc: this.doc, adapter: this.adapter });
      this.manifests = await this.loadManifests();
      this.state = await loadPluginState();
      await this.reconcile();
      this.unsubscribeState = subscribePluginState((next) => {
        this.state = next;
        void this.reconcile();
      });
      // A marketplace refresh updates the cached catalog: reload + re-mount so
      // new/changed plugin CSS applies live without a page reload.
      this.unsubscribeCatalog = subscribeCatalog(() => void this.reloadCatalog());
      logger.info('PluginHost started', {
        site: this.adapter?.id ?? 'unknown',
        manifests: this.manifests.length,
      });
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) return;
      logger.error('PluginHost start failed', { error: String(error) });
    }
  }

  stop(): void {
    this.unsubscribeState?.();
    this.unsubscribeState = null;
    this.unsubscribeCatalog?.();
    this.unsubscribeCatalog = null;
    this.engine?.unmountAll();
    this.started = false;
  }

  /** Reload manifests from the (refreshed) catalog and re-mount so new CSS applies. */
  private async reloadCatalog(): Promise<void> {
    if (!this.engine) return;
    this.manifests = await this.loadManifests();
    this.engine.unmountAll();
    await this.reconcile();
  }

  private async reconcile(): Promise<void> {
    if (!this.engine) return;
    for (const manifest of this.manifests) {
      const shouldRun = await this.shouldActivate(manifest);
      const isActive = this.engine.isActive(manifest.id);
      if (shouldRun && !isActive) this.engine.mount(manifest, this.resolveSettings(manifest));
      else if (!shouldRun && isActive) this.engine.unmount(manifest.id);
      // Already active + still should run: push any live setting changes.
      else if (shouldRun && isActive)
        this.engine.updateSettings(manifest.id, this.resolveSettings(manifest));
    }
  }

  /** Merge the plugin's declared setting defaults with the user's stored values. */
  private resolveSettings(manifest: PluginManifest): PluginSettings {
    const schema = manifest.contributes.settings;
    const stored = this.state[manifest.id]?.settings ?? {};
    if (!schema) return stored;
    const resolved: Record<string, PluginSettingValue> = {};
    for (const [key, field] of Object.entries(schema)) {
      resolved[key] = stored[key] ?? field.default;
    }
    return resolved;
  }

  private async shouldActivate(manifest: PluginManifest): Promise<boolean> {
    if (!matchesAnyPattern(this.url, manifest.matches)) return false;
    if (!this.state[manifest.id]?.enabled) return false;
    if (!engineSatisfied(manifest.engine, PLUGIN_ENGINE_VERSION)) {
      logger.warn('Plugin skipped: engine range not satisfied', {
        id: manifest.id,
        requires: manifest.engine,
        host: PLUGIN_ENGINE_VERSION,
      });
      return false;
    }
    if (manifest.tier === 'scripted' && !isScriptedTierSupported()) {
      logger.warn('Scripted plugin skipped: tier unsupported on this platform', {
        id: manifest.id,
      });
      return false;
    }
    const entitlement = await this.entitlement.getState(manifest.id);
    return entitlement !== 'locked';
  }

  private async loadManifests(): Promise<readonly PluginManifest[]> {
    const merged: PluginManifest[] = [];
    const seen = new Set<string>();
    for (const source of this.sources) {
      try {
        for (const manifest of await source.list()) {
          if (seen.has(manifest.id)) continue;
          seen.add(manifest.id);
          merged.push(manifest);
        }
      } catch (error) {
        logger.warn('Plugin source failed to list', { source: source.id, error: String(error) });
      }
    }
    return merged;
  }
}
