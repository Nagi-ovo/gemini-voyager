/**
 * DeclarativeEngine — interprets a plugin's declarative contributions
 * (`styles` + `domOps`) against a Document. This is the "logic in the package"
 * half of the MV3-compliant design: plugins are data, this engine is the code.
 *
 * Guarantees:
 *  - **Reversible.** Every applied change is bookkept so `unmount()` restores the
 *    DOM exactly (removes injected styles/classes, restores overwritten
 *    attributes/inline styles).
 *  - **Idempotent.** Re-applying ops never duplicates work (classes/attrs are set
 *    once; originals captured only on first touch).
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

interface ActivePlugin {
  readonly manifest: PluginManifest;
  styleEl: HTMLStyleElement | null;
  /** Current resolved setting values, substituted into the CSS via `{{key}}`. */
  settings: PluginSettings;
  /** Classes we added, per element, so we remove exactly what we added. */
  readonly addedClasses: Map<Element, Set<string>>;
  /** Original attribute values we overwrote (null = attribute was absent). */
  readonly attrOriginals: Map<Element, Map<string, string | null>>;
  /** Original inline style values we overwrote ('' = property was unset). */
  readonly styleOriginals: Map<HTMLElement, Map<string, string>>;
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
    const entry: ActivePlugin = {
      manifest,
      styleEl: null,
      settings,
      addedClasses: new Map(),
      attrOriginals: new Map(),
      styleOriginals: new Map(),
    };
    this.active.set(manifest.id, entry);
    this.injectStyles(entry);
    this.applyDomOps(entry);
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

    entry.styleEl?.remove();

    for (const [el, classes] of entry.addedClasses) {
      for (const className of classes) el.classList.remove(className);
    }
    for (const [el, attrs] of entry.attrOriginals) {
      for (const [name, prev] of attrs) {
        if (prev === null) el.removeAttribute(name);
        else el.setAttribute(name, prev);
      }
    }
    for (const [el, props] of entry.styleOriginals) {
      for (const [prop, prev] of props) {
        if (prev === '') el.style.removeProperty(prop);
        else el.style.setProperty(prop, prev);
      }
    }

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
    for (const op of ops) this.applyOp(entry, op);
  }

  private applyOp(entry: ActivePlugin, op: DomOperation): void {
    for (const el of this.queryAll(op.target)) {
      switch (op.op) {
        case 'addClass':
          this.addClass(entry, el, op.className);
          break;
        case 'hide':
          this.addClass(entry, el, PLUGIN_HIDDEN_CLASS);
          break;
        case 'setAttribute': {
          const originals = mapGet(entry.attrOriginals, el, () => new Map<string, string | null>());
          if (!originals.has(op.name)) originals.set(op.name, el.getAttribute(op.name));
          el.setAttribute(op.name, op.value);
          break;
        }
        case 'setStyle': {
          if (!(el instanceof HTMLElement)) break;
          const originals = mapGet(entry.styleOriginals, el, () => new Map<string, string>());
          for (const [prop, value] of Object.entries(op.styles)) {
            if (!originals.has(prop)) originals.set(prop, el.style.getPropertyValue(prop));
            el.style.setProperty(prop, value);
          }
          break;
        }
      }
    }
  }

  private addClass(entry: ActivePlugin, el: Element, className: string): void {
    if (el.classList.contains(className)) return;
    el.classList.add(className);
    mapGet(entry.addedClasses, el, () => new Set<string>()).add(className);
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
