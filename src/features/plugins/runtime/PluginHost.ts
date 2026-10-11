/**
 * PluginHost — orchestrates the plugin lifecycle for the current page.
 *
 * Flow on start():
 *   1. resolve the SiteAdapter for the current URL (may be null on unknown sites)
 *   2. load manifests from all configured sources (builtin, bundled catalog,
 *      cached per-host remote catalog)
 *   3. load per-plugin enable state from storage. On Gemini / AI Studio the
 *      legacy switches packaged official plugins follow are read beside this,
 *      off the op chain: those plugins join in the reconcile after that read
 *      lands, once the content script admits them (`officialAdmission.ts`)
 *   4. reconcile: mount every plugin that (matches URL) AND (is enabled) AND
 *      (satisfies the engine version) AND (is not entitlement-locked) AND
 *      (wins the page-wide runtimes it needs, `resourceArbiter.ts`); unmount
 *      the rest. A winner whose runtime is still shutting down elsewhere waits
 *      for that release (`releaseLedger.ts`) off the op chain
 *   5. subscribe to state changes and re-reconcile (live enable/disable)
 *   6. subscribe to this host's remote catalog cache and to the user's local
 *      plugins, and reload on content change
 *   7. in the top frame, when an ENABLED plugin targets this page, ask the
 *      background to check the remote catalog (it applies the user's interval,
 *      switch and backoff). Pages without an enabled plugin, and every Gemini /
 *      AI Studio page (no catalog host), never send the request.
 *
 * All providers (registry, sources, entitlement) are injected so the host is
 * fully unit-testable and the monetization/marketplace seams can be swapped
 * without touching this class.
 */
import { logger } from '@/core/services/LoggerService';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { isScriptedTierSupported } from '../capabilities';
import { LocalEntitlementProvider } from '../entitlement/LocalEntitlementProvider';
import { subscribeLocalPlugins } from '../local/localPluginStore';
import { subscribeHostCatalog } from '../remote/hostCatalogCache';
import { catalogHostFromUrl, hasEnabledPluginForUrl } from '../remote/hostCatalogPolicy';
import {
  isSameSiteAdapter,
  resolveSiteAdapterForUrl,
  resolveSiteOverride,
} from '../remote/siteOverride';
import { ownedFeatureByPluginId, tracksPluginHealth } from '../sites/featureOwners';
import { hostPolicyRefusal, packagedSiteForUrl } from '../sites/hostPolicy';
import { matchesAnyPattern } from '../sites/matchPattern';
import { SiteRegistry } from '../sites/registry';
import { createDefaultPluginSources, listPluginManifests } from '../sources/defaultSources';
import { resolveEffectiveSettings } from '../storage/legacySettingBindings';
import { type PluginStateMap, loadPluginState, subscribePluginState } from '../storage/pluginState';
import {
  type EntitlementProvider,
  type PluginManifest,
  type PluginSettings,
  type PluginSource,
  type PluginSourceContext,
  type SiteAdapter,
  hasNativeOps,
} from '../types';
import { hasPrimitive } from '../verbs/registry';
import { DeclarativeEngine } from './declarativeEngine';
import {
  DEFAULT_LEGACY_SETTINGS,
  type LegacySettingsSource,
  type LegacySnapshotFeed,
  openLegacySnapshotFeed,
} from './legacySnapshotFeed';
import { PLUGIN_CATALOG_REFRESH_MESSAGE } from './messages';
import { CLOSED_ADMISSION, type OfficialAdmission } from './officialAdmission';
import { type PluginStatus, findIncompatibility } from './pluginStatus';
import {
  type PluginBlock,
  type WishInput,
  type WishVerdict,
  blockedStatus,
  wishVerdict,
} from './reconcileArbitration';
import { ReleaseLedger } from './releaseLedger';
import { arbitrate } from './resourceArbiter';
import { claimedResources, duplicateResourceClaims } from './resourceClaims';
import { type SurfaceSwitch, surfaceSwitchForUrl } from './surfaceSwitch';

export interface PluginHostOptions {
  readonly url?: string;
  readonly registry?: SiteRegistry;
  readonly sources?: readonly PluginSource[];
  readonly entitlement?: EntitlementProvider;
  readonly doc?: Document;
  /** Injectable for tests; defaults to a runtime message to the background. */
  readonly requestCatalogRefresh?: (host: string) => void;
  /** Injectable for tests; defaults to `window.top === window`. */
  readonly isTopFrame?: boolean;
  /**
   * The site's master switch (AI Studio's "Voyager on AI Studio"); while it is
   * off nothing mounts. Defaults to `surfaceSwitchForUrl(url)`.
   */
  readonly surfaceSwitch?: SurfaceSwitch | null;
  /**
   * When the content script lets each packaged official plugin start
   * (`officialAdmission.ts`). Defaults to `CLOSED_ADMISSION`: none ever does.
   */
  readonly admission?: OfficialAdmission;
  /** Injectable for tests; the legacy keys official plugins follow, read on Gemini / AI Studio only. */
  readonly legacySettings?: LegacySettingsSource;
}

/** Fire-and-forget: the background decides whether a network request is due. */
function sendCatalogRefreshRequest(host: string): void {
  const runtime = (globalThis as { chrome?: typeof chrome }).chrome?.runtime;
  if (!runtime?.sendMessage) return;
  try {
    runtime.sendMessage({ type: PLUGIN_CATALOG_REFRESH_MESSAGE, payload: { host } }, () => {
      // Read lastError so a missing receiver never logs "Unchecked runtime.lastError".
      void runtime.lastError;
    });
  } catch {
    // Extension context gone; nothing to refresh.
  }
}

function detectTopFrame(): boolean {
  try {
    return typeof window === 'undefined' || window.top === window;
  } catch {
    return false;
  }
}

export class PluginHost {
  private readonly url: string;
  private readonly registry: SiteRegistry;
  private readonly sources: readonly PluginSource[];
  private readonly entitlement: EntitlementProvider;
  private readonly doc: Document;
  private readonly context: PluginSourceContext;
  private readonly requestCatalogRefresh: (host: string) => void;
  private readonly isTopFrame: boolean;

  private adapter: SiteAdapter | null = null;
  private engine: DeclarativeEngine | null = null;
  private manifests: readonly PluginManifest[] = [];
  /**
   * Plugins whose newer manifest arrived while this page keeps the mounted
   * version (plan D7): primitive-backed contributions switch only on the next
   * full page load, so the mounted manifest is pinned here until then.
   */
  private readonly frozen = new Map<string, { mounted: PluginManifest; pendingVersion: string }>();
  private state: PluginStateMap = {};
  private unsubscribeState: (() => void) | null = null;
  private unsubscribeCatalog: (() => void) | null = null;
  private unsubscribeLocal: (() => void) | null = null;
  private unsubscribeSurface: (() => void) | null = null;
  private readonly surfaceSwitch: SurfaceSwitch | null;
  private readonly admission: OfficialAdmission;
  private readonly legacySettings: LegacySettingsSource;
  private unsubscribeAdmission: (() => void) | null = null;
  /** Legacy switches of bound official plugins; null off Gemini / AI Studio. */
  private legacy: LegacySnapshotFeed | null = null;
  /** Whether the site's master switch lets plugins run (always true without one). */
  private surfaceOn = true;
  private started = false;
  /**
   * Monotonic lifecycle generation. start() and stop() each bump it; every
   * async pass captures the value at entry and aborts after any await if it
   * no longer matches, so a pass that straddles a stop→start restart can
   * never touch the new generation's engine (a bare `started` boolean would
   * read true again — the ABA case).
   */
  private generation = 0;
  /** Serializes reconcile/reload work so async passes never interleave. */
  private opChain: Promise<void> = Promise.resolve();
  /** Last settings pushed per plugin id, for change detection. */
  private readonly pushedSettings = new Map<string, string>();
  /**
   * Unfinished releases of page-wide runtimes. Owned here rather than by an
   * engine, and kept across stop()→start(), so a successor in a rebuilt
   * engine never starts beside a runtime that is still shutting down.
   */
  private readonly releases = new ReleaseLedger();
  /** Plugins holding their runtimes after the last pass; a holder is never displaced. */
  private holders: ReadonlySet<string> = new Set();
  /** Plugins the last pass kept off by a conflict or a pending release. */
  private blocked: ReadonlyMap<string, PluginBlock> = new Map();

  constructor(options: PluginHostOptions = {}) {
    this.url = options.url ?? location.href;
    this.registry = options.registry ?? SiteRegistry.createDefault();
    this.sources = options.sources ?? createDefaultPluginSources();
    this.entitlement = options.entitlement ?? new LocalEntitlementProvider();
    this.doc = options.doc ?? document;
    this.context = { url: this.url, host: catalogHostFromUrl(this.url) };
    this.requestCatalogRefresh = options.requestCatalogRefresh ?? sendCatalogRefreshRequest;
    this.isTopFrame = options.isTopFrame ?? detectTopFrame();
    this.surfaceSwitch =
      options.surfaceSwitch === undefined ? surfaceSwitchForUrl(this.url) : options.surfaceSwitch;
    this.admission = options.admission ?? CLOSED_ADMISSION;
    this.legacySettings = options.legacySettings ?? DEFAULT_LEGACY_SETTINGS;
  }

  get activeAdapter(): SiteAdapter | null {
    return this.adapter;
  }

  /** Live side-effect ledgers of scope-based plugins, keyed by plugin id. */
  getScopeLedgers(): Record<string, readonly string[]> {
    return this.engine?.getScopeLedgers() ?? {};
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const gen = ++this.generation;
    try {
      // Subscribe to this host's catalog BEFORE the adapter read: a background
      // refresh that CHANGES the catalog while that read is in flight must
      // still reach this instance. Until the engine exists the change is only
      // remembered and the initial pass replays it; afterwards every change
      // reloads + re-mounts on the serialized chain so new/changed plugin CSS
      // applies live without a page reload.
      let engineReady = false;
      let catalogChangedBeforeEngine = false;
      const onSourceChange = (): void => {
        if (this.generation !== gen) return;
        if (!engineReady) {
          catalogChangedBeforeEngine = true;
          return;
        }
        void this.enqueue(() => this.reloadCatalog(gen));
      };
      const host = this.context.host;
      if (host) this.unsubscribeCatalog = subscribeHostCatalog(host, onSourceChange);
      // An import, update or removal of a local plugin is a catalog change too.
      this.unsubscribeLocal = subscribeLocalPlugins(onSourceChange);
      // A published site override (plan §3) beats the bundled adapter for
      // pages it covers; resolved before the engine exists so semantic
      // selectors use the newest site knowledge from the first mount.
      const adapter = await this.resolveAdapter();
      if (this.generation !== gen) return;
      this.adapter = adapter;
      this.engine = this.createEngine(adapter);
      engineReady = true;
      // Subscribe BEFORE the initial reads: a state write that lands while
      // they are in flight must still reach this instance. The callback only
      // enqueues on the serialized chain, so nothing runs ahead of the
      // initial reconcile below.
      let stateFromListener: PluginStateMap | null = null;
      const requeue = (): void => {
        if (this.generation === gen) void this.enqueue(() => this.reconcile(gen));
      };
      // Only the packaged sites run official plugins bound to legacy switches;
      // unbound plugins never wait on that read, whose landing requeues.
      this.legacy = packagedSiteForUrl(this.url)
        ? openLegacySnapshotFeed(this.legacySettings, requeue)
        : null;
      this.unsubscribeAdmission = this.admission.subscribe(requeue);
      this.unsubscribeState = subscribePluginState((next) => {
        if (this.generation !== gen) return;
        stateFromListener = next;
        this.state = next;
        void this.enqueue(() => this.reconcile(gen));
      });
      // The site's master switch follows the same pattern: off unmounts every
      // plugin on the page, on mounts the enabled ones again.
      let surfaceFromListener: boolean | null = null;
      const surfaceSwitch = this.surfaceSwitch;
      if (surfaceSwitch) {
        this.unsubscribeSurface = surfaceSwitch.subscribe((on) => {
          if (this.generation !== gen) return;
          surfaceFromListener = on;
          this.surfaceOn = on;
          void this.enqueue(() => this.reconcile(gen));
        });
      }
      // The initial read runs ON the chain, so a catalog reload the listener
      // queued meanwhile runs after it and its fresher listing wins.
      await this.enqueue(async () => {
        const manifests = await this.loadManifests();
        const state = await loadPluginState();
        const surfaceOn = surfaceSwitch ? await surfaceSwitch.read() : true;
        if (this.generation !== gen) return;
        this.surfaceOn = surfaceFromListener ?? surfaceOn;
        this.manifests = manifests;
        // A listener revision that arrived mid-read is newer than what we read.
        this.state = stateFromListener ?? state;
        await this.reconcile(gen);
        // A catalog write that landed before the engine existed may have
        // swapped the site adapter this engine was built with: replay it.
        if (catalogChangedBeforeEngine) await this.reloadCatalog(gen);
      });
      if (this.generation !== gen) return;
      logger.info('PluginHost started', {
        site: this.adapter?.id ?? 'unknown',
        manifests: this.manifests.length,
      });
      this.maybeRequestCatalogRefresh();
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) return;
      logger.error('PluginHost start failed', { error: String(error) });
    }
  }

  stop(): void {
    this.started = false;
    this.generation += 1;
    this.unsubscribeState?.();
    this.unsubscribeState = null;
    this.unsubscribeCatalog?.();
    this.unsubscribeCatalog = null;
    this.unsubscribeLocal?.();
    this.unsubscribeLocal = null;
    this.unsubscribeSurface?.();
    this.unsubscribeSurface = null;
    this.unsubscribeAdmission?.();
    this.unsubscribeAdmission = null;
    this.legacy?.stop();
    this.legacy = null;
    this.engine?.unmountAll();
    this.pushedSettings.clear();
    this.frozen.clear();
    // A restart arbitrates from scratch; unfinished releases stay in the ledger.
    this.holders = new Set();
    this.blocked = new Map();
  }

  /**
   * Status of every plugin whose `matches` cover this page (plan §4.2).
   * Incompatible and blocked plugins are reported with their reason instead
   * of being hidden; the popup renders these and adds its own permission
   * check. A packaged official plugin whose feature a native module still
   * owns is left out, pure-CSS ones included: that module is what runs, and
   * the plugin has nothing to report.
   */
  getStatuses(): readonly PluginStatus[] {
    const engine = this.engine;
    const statuses: PluginStatus[] = [];
    for (const listed of this.manifests) {
      if (!matchesAnyPattern(this.url, listed.matches)) continue;
      const pinned = this.frozen.get(listed.id);
      const manifest = pinned?.mounted ?? listed;
      const pending = pinned ? { pendingVersion: pinned.pendingVersion } : {};
      // A native module runs this feature; its plugin never starts, whatever it contributes.
      if (ownedFeatureByPluginId(listed.id)?.owner === 'legacy') continue;
      if (hostPolicyRefusal(this.url, listed) !== null) {
        statuses.push(blockedStatus(manifest, { reason: 'host-policy' }, pending));
        continue;
      }
      const incompatibility = findIncompatibility({
        manifest,
        adapter: this.adapter,
        hasPrimitive,
      });
      if (incompatibility) {
        statuses.push({ ...incompatibility, ...pending });
        continue;
      }
      if (duplicateResourceClaims(manifest).length > 0) {
        statuses.push(blockedStatus(manifest, { reason: 'duplicate-claim' }, pending));
        continue;
      }
      const base = { id: manifest.id, version: manifest.version, ...pending };
      const block = this.blocked.get(manifest.id);
      if (engine?.isActive(manifest.id)) {
        statuses.push({
          ...base,
          kind: engine.getHealth(manifest.id) === true ? 'no-effect' : 'mounted',
        });
      } else if (block) {
        statuses.push(blockedStatus(manifest, block, pending));
      } else {
        statuses.push({ ...base, kind: 'ready' });
      }
    }
    return statuses;
  }

  private createEngine(adapter: SiteAdapter | null): DeclarativeEngine {
    return new DeclarativeEngine({
      doc: this.doc,
      adapter,
      onHealthChange: (id, noEffect) => {
        logger.info('Plugin health changed', { id, noEffect });
      },
      shouldTrackHealth: (manifest) => tracksPluginHealth(manifest.id),
      // The mounted manifest decides what is released, so a plugin frozen
      // on its old version (D7) releases what that version claimed.
      onRelease: (manifest, released) => {
        this.releases.record(manifest.id, claimedResources(manifest), released);
      },
    });
  }

  /**
   * Append work to the host's single operation chain. Reconcile and catalog
   * reloads are async (entitlement/storage awaits); running two passes
   * concurrently lets a stale pass mount what a newer pass just unmounted.
   *
   * Returns the RAW operation promise so awaiting callers (start) observe the
   * pass's own failure; the chain itself continues through a caught tail, so
   * one failed pass never poisons ordering and fire-and-forget callers never
   * leak an unhandled rejection (the tail's catch is attached to the same
   * promise they discard).
   */
  private enqueue(work: () => Promise<void>): Promise<void> {
    const op = this.opChain.then(work);
    this.opChain = op.catch((error) => {
      if (isExtensionContextInvalidatedError(error)) return;
      logger.error('PluginHost operation failed', { error: String(error) });
    });
    return op;
  }

  /**
   * Reload manifests from the (refreshed) catalog and re-mount so new CSS
   * applies. A changed site adapter (remote override arrived or was
   * withdrawn) rebuilds the engine so semantic selectors resolve against it.
   *
   * Plan D7: a mounted plugin whose contributions run first-party code (a
   * `native` op) keeps the version it started with; its update is recorded
   * as pending and applies on the next full page load. Declarative plugins
   * remount immediately when their version or contributions changed; a
   * re-listed plugin that did not change keeps running untouched, so an
   * unrelated import or catalog write never restarts it. A user-imported
   * (`local.*`) plugin follows the same rules.
   */
  private async reloadCatalog(gen: number): Promise<void> {
    const engine = this.engine;
    if (!engine || this.generation !== gen) return;
    const [manifests, adapter] = await Promise.all([this.loadManifests(), this.resolveAdapter()]);
    if (this.generation !== gen) return;
    const previous = new Map(this.manifests.map((manifest) => [manifest.id, manifest]));
    const adapterChanged = !isSameSiteAdapter(adapter, this.adapter);
    for (const next of manifests) {
      const mounted = this.frozen.get(next.id)?.mounted ?? previous.get(next.id);
      if (!mounted || !engine.isActive(next.id)) continue;
      // An update that drops this page from its `matches` is a removal for
      // this page, never a pending version: unfreeze so the unmount below
      // sees it and reconcile() cannot revive it from the frozen manifest.
      if (!this.targetsThisPage(next)) {
        this.frozen.delete(next.id);
        continue;
      }
      if (!hasNativeOps(mounted) && !hasNativeOps(next)) continue;
      if (mounted.version === next.version && sameContributions(mounted, next)) {
        this.frozen.delete(next.id);
        continue;
      }
      this.frozen.set(next.id, { mounted, pendingVersion: next.version });
    }
    // oxlint-disable-next-line unicorn/no-useless-spread -- snapshot: the loop body mutates the collection
    for (const id of [...this.frozen.keys()]) {
      if (!manifests.some((manifest) => manifest.id === id)) this.frozen.delete(id);
    }
    this.manifests = manifests;
    if (adapterChanged) {
      engine.unmountAll();
      this.pushedSettings.clear();
      this.adapter = adapter;
      this.engine = this.createEngine(adapter);
    } else {
      // A plugin the refreshed catalog no longer lists (an authoritative
      // delisting is the kill switch) leaves the page now: reconcile() only
      // walks the new list, so it would otherwise run until teardown.
      const listed = new Set(manifests.map((manifest) => manifest.id));
      for (const id of previous.keys()) {
        if (!listed.has(id) && engine.isActive(id)) {
          void engine.unmount(id);
          this.pushedSettings.delete(id);
        }
      }
      // Remount only what changed: an unrelated import or a catalog write that
      // re-lists the same plugin must not restart a running one (a primitive
      // would lose its state, e.g. the turn navigator or Vim mode).
      for (const manifest of manifests) {
        if (this.frozen.has(manifest.id) || !engine.isActive(manifest.id)) continue;
        const mounted = previous.get(manifest.id);
        if (mounted && isSameMountedPlugin(mounted, manifest)) continue;
        void engine.unmount(manifest.id);
        this.pushedSettings.delete(manifest.id);
      }
    }
    await this.reconcile(gen);
  }

  private async resolveAdapter(): Promise<SiteAdapter | null> {
    const override = await resolveSiteOverride(this.sources, this.context);
    return resolveSiteAdapterForUrl(this.url, this.registry, override);
  }

  private async reconcile(gen: number): Promise<void> {
    // Snapshot everything the pass reads, so one pass never mixes two state
    // revisions (the storage listener replaces `this.state` outside the op
    // chain). A revision that lands mid-pass gets its own queued pass.
    const engine = this.engine;
    const state = this.state;
    const legacy = this.legacy?.current() ?? null;
    const legacyPhase = this.legacy?.phase() ?? 'none';
    const manifests = this.manifests.map((listed) => this.frozen.get(listed.id)?.mounted ?? listed);
    if (!engine) return;
    const verdicts: Record<Exclude<WishVerdict, 'skip'>, PluginManifest[]> = {
      run: [],
      reserve: [],
      await: [],
    };
    for (const manifest of manifests) {
      if (this.generation !== gen) return;
      const verdict = await this.evaluate(manifest, { state, legacy, legacyPhase });
      if (verdict !== 'skip') verdicts[verdict].push(manifest);
    }
    if (this.generation !== gen) return;
    // From here on nothing awaits: the pass acts on one consistent verdict.
    const wanted = verdicts.run;
    // Release what is no longer wanted first, so arbitration below already
    // sees a runtime handed over in this very pass as shutting down.
    const wantedIds = new Set(wanted.map((manifest) => manifest.id));
    this.unmountWhere(manifests, (id) => !wantedIds.has(id));
    const { granted, blocked } = arbitrate(wanted, verdicts.reserve, this.holders, {
      awaiting: verdicts.await,
      releasingBy: (resource) => this.releases.releasing(resource)?.pluginId ?? null,
    });
    // A running plugin arbitration kept off anyway (a holder never is, so normally none).
    this.unmountWhere(manifests, (id) => !granted.has(id));
    for (const block of blocked.values()) {
      if (block.reason === 'releasing') this.wakeWhenReleased(block.resources, gen);
    }
    for (const manifest of wanted) {
      if (!granted.has(manifest.id)) continue;
      const settings = this.resolveSettings(manifest, state);
      if (engine.isActive(manifest.id)) {
        // Already active + still should run: push setting changes, but only to
        // the plugin whose settings actually changed — a state write for
        // plugin A must not re-render every other active plugin.
        const serialized = JSON.stringify(settings);
        if (this.pushedSettings.get(manifest.id) !== serialized) {
          engine.updateSettings(manifest.id, settings);
          this.pushedSettings.set(manifest.id, serialized);
        }
        continue;
      }
      engine.mount(manifest, settings);
      this.pushedSettings.set(manifest.id, JSON.stringify(settings));
    }
    // A holder is a plugin that runs, or held before and waits on its own
    // release (an engine rebuild); a plugin that has never run displaces nobody.
    const previousHolders = this.holders;
    const waiting = [...blocked].filter(([, block]) => block.reason === 'releasing');
    this.holders = new Set(
      [...granted, ...waiting.map(([id]) => id)].filter(
        (id) => engine.isActive(id) || previousHolders.has(id),
      ),
    );
    this.blocked = blocked;
  }

  private unmountWhere(manifests: readonly PluginManifest[], drop: (id: string) => boolean): void {
    const engine = this.engine;
    for (const manifest of manifests) {
      if (!engine?.isActive(manifest.id) || !drop(manifest.id)) continue;
      void engine.unmount(manifest.id);
      this.pushedSettings.delete(manifest.id);
    }
  }

  /**
   * Queue a pass for when each busy resource is free again. The op chain
   * itself never waits on a release, so a disposer that never settles blocks
   * only the plugins that need its runtime.
   */
  private wakeWhenReleased(resources: readonly string[], gen: number): void {
    for (const resource of resources) {
      // Keyed by generation: one queued pass per generation and resource.
      this.releases.whenFree(resource, String(gen), () => {
        if (this.generation === gen) void this.enqueue(() => this.reconcile(gen));
      });
    }
  }

  /** Declared defaults merged with stored values; `{}` for an official plugin bound to a legacy switch. */
  private resolveSettings(manifest: PluginManifest, state: PluginStateMap): PluginSettings {
    return resolveEffectiveSettings(manifest, state);
  }

  /**
   * The plugin's `matches` cover this page, and the page's host policy
   * refuses nothing it brings (theme, native ops), judged by the page's real
   * host rather than by its patterns.
   */
  private targetsThisPage(manifest: PluginManifest): boolean {
    if (!matchesAnyPattern(this.url, manifest.matches)) return false;
    return hostPolicyRefusal(this.url, manifest) === null;
  }

  /**
   * Whether the plugin runs (`run`), would run but awaits its admission
   * (`reserve`) or its legacy switch (`await`, see `resourceArbiter.ts`), or
   * stays off. Arbitration over page-wide runtimes comes after this.
   */
  private async evaluate(
    manifest: PluginManifest,
    wishInput: Omit<WishInput, 'admission'>,
  ): Promise<WishVerdict> {
    if (!this.surfaceOn) return 'skip';
    if (!this.targetsThisPage(manifest)) return 'skip';
    const wish = wishVerdict({ ...wishInput, admission: this.admission }, manifest.id);
    if (wish === 'skip') return 'skip';
    if (duplicateResourceClaims(manifest).length > 0) return 'skip';
    const incompatibility = findIncompatibility({
      manifest,
      adapter: this.adapter,
      hasPrimitive,
    });
    if (incompatibility) {
      logger.warn('Plugin skipped: incompatible with this build or site', {
        id: manifest.id,
        status: incompatibility.kind,
        requiredEngine: incompatibility.requiredEngine,
        missingHandlers: incompatibility.missingHandlers,
        missingSemantic: incompatibility.missingSemantic,
      });
      return 'skip';
    }
    if (manifest.tier === 'scripted' && !isScriptedTierSupported()) {
      logger.warn('Scripted plugin skipped: tier unsupported on this platform', {
        id: manifest.id,
      });
      return 'skip';
    }
    const entitlement = await this.entitlement.getState(manifest.id);
    return entitlement === 'locked' ? 'skip' : wish;
  }

  private async loadManifests(): Promise<readonly PluginManifest[]> {
    return listPluginManifests(this.sources, this.context);
  }

  /**
   * D4 trigger. Only the top frame of a page that an ENABLED plugin targets
   * may ask for a check; embedded companion frames and pages without an
   * enabled plugin (all of Gemini / AI Studio) stay silent.
   */
  private maybeRequestCatalogRefresh(): void {
    const host = this.context.host;
    if (!host || !this.isTopFrame) return;
    if (!hasEnabledPluginForUrl(this.manifests, this.state, this.url)) return;
    this.requestCatalogRefresh(host);
  }
}

function sameContributions(a: PluginManifest, b: PluginManifest): boolean {
  return JSON.stringify(a.contributes) === JSON.stringify(b.contributes);
}

/** A re-listed plugin the engine can keep running as mounted. */
function isSameMountedPlugin(mounted: PluginManifest, next: PluginManifest): boolean {
  return mounted.version === next.version && sameContributions(mounted, next);
}
