/**
 * DeclarativeEngine — interprets a plugin's declarative contributions
 * (`styles` + `domOps`) against a Document. This is the "logic in the package"
 * half of the MV3-compliant design: plugins are data, this engine is the code.
 *
 * Guarantees:
 *  - **Reversible.** Every applied change is bookkept so `unmount()` restores the
 *    DOM exactly (removes injected styles/classes, restores overwritten
 *    attributes/inline styles).
 *  - **Composable across plugins.** Class/attribute/style changes are tracked in
 *    engine-level, ref-counted ledgers — NOT per-plugin "original value" copies.
 *    When two plugins touch the same class/attribute/style, the *true* pre-plugin
 *    original is captured once; unmounting one plugin restores the value of the
 *    other still-active plugin (last writer wins), and only the last release
 *    restores the original. This is what makes a multi-plugin marketplace safe.
 *  - **Idempotent.** Re-applying ops never duplicates work (a plugin owns a given
 *    class/attr/style once; re-application just re-asserts the DOM value, which
 *    also re-heals SPA re-renders that stripped it).
 *  - **No observer loop.** The MutationObserver watches `childList`+`subtree`
 *    only, so the engine's own class/attribute/style mutations never retrigger
 *    it. Re-application happens only when new nodes appear (SPA re-renders),
 *    coalesced to one pass per animation frame.
 *  - **Platform-agnostic.** Pure DOM APIs — works identically on Chrome, Firefox
 *    and Safari.
 */
import { logger } from '@/core/services/LoggerService';

import {
  PLUGIN_BASE_STYLE_ID,
  PLUGIN_HIDDEN_CLASS,
  PLUGIN_MARKER_ATTR,
  PLUGIN_STYLE_ID_PREFIX,
} from '../constants';
import type {
  DomOperation,
  PluginManifest,
  PluginSettings,
  SelectorRef,
  SiteAdapter,
} from '../types';
import { type NativeHandler, getNativeHandler } from './nativeHandlers';

interface ActivePlugin {
  readonly manifest: PluginManifest;
  styleEl: HTMLStyleElement | null;
  /** Current resolved setting values, substituted into the CSS via `{{key}}`. */
  settings: PluginSettings;
  /** First-party start/stop bound to a builtin plugin id (see nativeHandlers). */
  nativeHandler?: NativeHandler;
}

/**
 * One overwritten attribute/style value. `original` is the value *before any
 * plugin touched it* (captured once): `null` = attribute was absent, `''` = inline
 * style property was unset. `stack` holds each active plugin's desired value; the
 * top entry is the one currently written to the DOM (last writer wins).
 */
interface OverrideLayer {
  readonly original: string | null;
  readonly stack: Array<{ id: string; value: string }>;
}

export interface DeclarativeEngineOptions {
  /** Document to operate on. Defaults to ambient `document` (override in tests). */
  readonly doc?: Document;
  /** Adapter used to resolve `semantic` selector refs. May be null (unknown site). */
  readonly adapter?: SiteAdapter | null;
}

export class DeclarativeEngine {
  private readonly doc: Document;
  private readonly adapter: SiteAdapter | null;
  private readonly active = new Map<string, ActivePlugin>();

  // Engine-level, ref-counted ledgers shared across plugins (see class doc).
  /** element → className → set of plugin ids that requested the class. */
  private readonly classOwners = new Map<Element, Map<string, Set<string>>>();
  /** element → attribute name → layer. */
  private readonly attrLayers = new Map<Element, Map<string, OverrideLayer>>();
  /** element → inline-style property → layer. */
  private readonly styleLayers = new Map<HTMLElement, Map<string, OverrideLayer>>();

  private observer: MutationObserver | null = null;
  private reapplyScheduled = false;

  constructor(options: DeclarativeEngineOptions = {}) {
    this.doc = options.doc ?? document;
    this.adapter = options.adapter ?? null;
  }

  get activeCount(): number {
    return this.active.size;
  }

  isActive(id: string): boolean {
    return this.active.has(id);
  }

  mount(manifest: PluginManifest, settings: PluginSettings = {}): void {
    if (this.active.has(manifest.id)) return;
    this.ensureBaseStyle();
    const entry: ActivePlugin = { manifest, styleEl: null, settings };
    entry.nativeHandler = getNativeHandler(manifest.id);
    this.active.set(manifest.id, entry);
    this.injectStyles(entry);
    this.applyDomOps(entry);
    // First-party builtin plugins (e.g. formula copy) run JS via a registered
    // native handler, in lockstep with the declarative lifecycle.
    entry.nativeHandler?.start?.();
    this.ensureObserver();
    logger.info('Plugin mounted', { id: manifest.id });
  }

  /** Live-update a mounted plugin's setting values (re-renders its CSS only). */
  updateSettings(id: string, settings: PluginSettings): void {
    const entry = this.active.get(id);
    if (!entry) return;
    entry.settings = settings;
    if (entry.styleEl) entry.styleEl.textContent = this.renderCss(entry);
  }

  unmount(id: string): void {
    const entry = this.active.get(id);
    if (!entry) return;

    entry.nativeHandler?.stop?.();
    entry.styleEl?.remove();
    this.releasePlugin(id);

    this.active.delete(id);
    if (this.active.size === 0) this.disconnectObserver();
    logger.info('Plugin unmounted', { id });
  }

  unmountAll(): void {
    for (const id of [...this.active.keys()]) this.unmount(id);
    this.doc.getElementById(PLUGIN_BASE_STYLE_ID)?.remove();
  }

  /** Re-apply all active plugins' dom ops immediately (exposed for tests + the
   *  rAF scheduler). Idempotent. */
  reapplyNow(): void {
    for (const entry of this.active.values()) this.applyDomOps(entry);
  }

  // --- internals -----------------------------------------------------------

  private ensureBaseStyle(): void {
    if (this.doc.getElementById(PLUGIN_BASE_STYLE_ID)) return;
    const style = this.doc.createElement('style');
    style.id = PLUGIN_BASE_STYLE_ID;
    style.textContent = `.${PLUGIN_HIDDEN_CLASS}{display:none !important;}`;
    this.styleRoot().appendChild(style);
  }

  private styleRoot(): Element {
    return this.doc.head ?? this.doc.documentElement;
  }

  private injectStyles(entry: ActivePlugin): void {
    const css = this.renderCss(entry);
    if (!css) return;
    const style = this.doc.createElement('style');
    style.id = `${PLUGIN_STYLE_ID_PREFIX}${entry.manifest.id}`;
    style.setAttribute(PLUGIN_MARKER_ATTR, entry.manifest.id);
    style.textContent = css;
    this.styleRoot().appendChild(style);
    entry.styleEl = style;
  }

  /** Join the plugin's CSS and substitute `{{key}}` tokens with the current
   *  setting values (falling back to each setting's declared default). This is
   *  bounded parameter substitution over declared keys — NOT a remote
   *  mini-language — so it stays within Chrome's "data, not code" allowance. */
  private renderCss(entry: ActivePlugin): string {
    const styles = entry.manifest.contributes.styles;
    if (!styles || styles.length === 0) return '';
    let css = styles.map((contribution) => contribution.css).join('\n');
    const schema = entry.manifest.contributes.settings;
    if (schema) {
      for (const key of Object.keys(schema)) {
        const value = entry.settings[key] ?? schema[key].default;
        css = css.split(`{{${key}}}`).join(String(value));
      }
    }
    return css;
  }

  private resolveSelector(ref: SelectorRef): string | null {
    if (ref.kind === 'css') return ref.selector;
    const selector = this.adapter?.selectors[ref.key];
    if (!selector) {
      logger.warn('Unknown semantic selector key', {
        key: ref.key,
        site: this.adapter?.id ?? 'none',
      });
      return null;
    }
    return selector;
  }

  private queryAll(ref: SelectorRef): Element[] {
    const selector = this.resolveSelector(ref);
    if (!selector) return [];
    try {
      return Array.from(this.doc.querySelectorAll(selector));
    } catch {
      logger.warn('Invalid selector', { selector });
      return [];
    }
  }

  private applyDomOps(entry: ActivePlugin): void {
    const ops = entry.manifest.contributes.domOps;
    if (!ops) return;
    const id = entry.manifest.id;
    for (const op of ops) this.applyOp(id, op);
  }

  private applyOp(id: string, op: DomOperation): void {
    for (const el of this.queryAll(op.target)) {
      switch (op.op) {
        case 'addClass':
          this.applyAddClass(id, el, op.className);
          break;
        case 'hide':
          this.applyAddClass(id, el, PLUGIN_HIDDEN_CLASS);
          break;
        case 'setAttribute':
          this.applySetAttribute(id, el, op.name, op.value);
          break;
        case 'setStyle':
          if (el instanceof HTMLElement) {
            for (const [prop, value] of Object.entries(op.styles)) {
              this.applySetStyle(id, el, prop, value);
            }
          }
          break;
      }
    }
  }

  private applyAddClass(id: string, el: Element, className: string): void {
    const perEl = mapGet(this.classOwners, el, () => new Map<string, Set<string>>());
    const owners = mapGet(perEl, className, () => new Set<string>());
    owners.add(id);
    // (Re)assert the class — also re-heals an SPA re-render that stripped it.
    if (!el.classList.contains(className)) el.classList.add(className);
  }

  private applySetAttribute(id: string, el: Element, name: string, value: string): void {
    const perEl = mapGet(this.attrLayers, el, () => new Map<string, OverrideLayer>());
    const layer = mapGet(perEl, name, () => ({ original: el.getAttribute(name), stack: [] }));
    pushLayerValue(layer, id, value);
    el.setAttribute(name, topValue(layer));
  }

  private applySetStyle(id: string, el: HTMLElement, prop: string, value: string): void {
    const perEl = mapGet(this.styleLayers, el, () => new Map<string, OverrideLayer>());
    const layer = mapGet(perEl, prop, () => ({
      original: el.style.getPropertyValue(prop),
      stack: [],
    }));
    pushLayerValue(layer, id, value);
    el.style.setProperty(prop, topValue(layer));
  }

  /** Remove every contribution of `id` from the shared ledgers, restoring the
   *  next-highest plugin's value (or the captured original when it was last). */
  private releasePlugin(id: string): void {
    for (const [el, perEl] of this.classOwners) {
      for (const [className, owners] of perEl) {
        if (owners.delete(id) && owners.size === 0) {
          el.classList.remove(className);
          perEl.delete(className);
        }
      }
      if (perEl.size === 0) this.classOwners.delete(el);
    }

    for (const [el, perEl] of this.attrLayers) {
      for (const [name, layer] of perEl) {
        if (!removeLayerValue(layer, id)) continue;
        if (layer.stack.length === 0) {
          if (layer.original === null) el.removeAttribute(name);
          else el.setAttribute(name, layer.original);
          perEl.delete(name);
        } else {
          el.setAttribute(name, topValue(layer));
        }
      }
      if (perEl.size === 0) this.attrLayers.delete(el);
    }

    for (const [el, perEl] of this.styleLayers) {
      for (const [prop, layer] of perEl) {
        if (!removeLayerValue(layer, id)) continue;
        if (layer.stack.length === 0) {
          // '' (or null) means the property was unset before any plugin.
          if (!layer.original) el.style.removeProperty(prop);
          else el.style.setProperty(prop, layer.original);
          perEl.delete(prop);
        } else {
          el.style.setProperty(prop, topValue(layer));
        }
      }
      if (perEl.size === 0) this.styleLayers.delete(el);
    }
  }

  private ensureObserver(): void {
    if (this.observer) return;
    const target = this.doc.body ?? this.doc.documentElement;
    if (!target) return;
    this.observer = new MutationObserver(() => this.scheduleReapply());
    this.observer.observe(target, { childList: true, subtree: true });
  }

  private disconnectObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private scheduleReapply(): void {
    if (this.reapplyScheduled) return;
    this.reapplyScheduled = true;
    const run = (): void => {
      this.reapplyScheduled = false;
      this.reapplyNow();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 16);
  }
}

function mapGet<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = create();
    map.set(key, value);
  }
  return value;
}

/** Update-or-insert a plugin's desired value, moving it to the top of the stack. */
function pushLayerValue(layer: OverrideLayer, id: string, value: string): void {
  removeLayerValue(layer, id);
  layer.stack.push({ id, value });
}

/** Remove a plugin's entry from the stack. Returns true if one was present. */
function removeLayerValue(layer: OverrideLayer, id: string): boolean {
  const index = layer.stack.findIndex((entry) => entry.id === id);
  if (index < 0) return false;
  layer.stack.splice(index, 1);
  return true;
}

function topValue(layer: OverrideLayer): string {
  return layer.stack[layer.stack.length - 1].value;
}
