import {
  NATIVE_HEALTH_ANCHORS,
  NATIVE_HEALTH_GRACE_MS,
  NATIVE_HEALTH_STATUS_MESSAGE,
  type NativeHealthEntry,
  type NativeHealthFeature,
  type NativeHealthRoute,
  type NativeHealthStatus,
  type NativeHealthStatusResponse,
  classifyGeminiRoute,
} from '@/core/gemini/nativeHealth';

import type { StopNativeFeature } from '../featureLifecycle';

export { NATIVE_HEALTH_GRACE_MS };

/**
 * Where the anchor is expected:
 * - `conversation`: an open conversation (`/app/<id>`, `/gem/<gem>/<id>`);
 * - `any`: any Gemini page; the probe's `expected` check decides.
 */
export type NativeHealthRouteRequirement = 'conversation' | 'any';

export interface MissingAnchorProbe {
  readonly route: NativeHealthRouteRequirement;
  /** The owner's own lookup, re-run at verdict time. `true` means the anchor is back. */
  readonly recheck: () => boolean;
  /**
   * Evidence, independent of the probed selectors, that this page should contain the anchor.
   * Runs only at verdict time, so a healthy page never pays for it.
   */
  readonly expected?: () => boolean;
  readonly status?: NativeHealthStatus;
}

function routeMatches(
  requirement: NativeHealthRouteRequirement,
  route: NativeHealthRoute,
): boolean {
  if (requirement === 'any') return true;
  return route === 'conversation';
}

function safely(check: () => boolean): boolean | null {
  try {
    return check();
  } catch {
    return null;
  }
}

function readExtensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return 'unknown';
  }
}

/**
 * Turns owners' found/missing results into page-scoped health entries.
 *
 * Owners report from results they already compute; the reporter installs no observer. A miss
 * arms one timer per feature. When it fires, the verdict re-runs the owner's lookup and the
 * page-evidence check, and only a miss that survives both becomes an entry. A found report, a
 * withdrawal or `stop` clears the feature at once. Reports are ignored until `start`, which runs
 * only in Gemini's top frame.
 *
 * Entries and pending probes belong to the pathname they were reported on, `/u/<index>/` included.
 * Gemini navigates in place, so instead of listening for route changes the reporter compares the
 * pathname whenever it is read or reported to, and drops everything from a previous page. A
 * warning for one conversation or account never shows on another, and grace time never carries
 * over.
 */
export class NativeHealthReporter {
  private running = false;
  /** The pathname every current entry and pending probe was reported on. */
  private scopePath: string | null = null;
  private readonly pending = new Map<
    NativeHealthFeature,
    { timer: ReturnType<typeof setTimeout>; probe: MissingAnchorProbe }
  >();
  private readonly entries = new Map<NativeHealthFeature, NativeHealthEntry>();
  private readonly onMessage = (
    message: unknown,
    _sender: unknown,
    sendResponse: (response: NativeHealthStatusResponse) => void,
  ): undefined => {
    if ((message as { type?: unknown } | null)?.type !== NATIVE_HEALTH_STATUS_MESSAGE) return;
    sendResponse({ ok: true, entries: this.getEntries() });
  };

  constructor(private readonly graceMs = NATIVE_HEALTH_GRACE_MS) {}

  start(): StopNativeFeature {
    if (!this.running && location.hostname === 'gemini.google.com' && window.top === window) {
      this.running = true;
      chrome.runtime.onMessage.addListener(this.onMessage);
    }
    return () => this.stop();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.clearAll();
    this.scopePath = null;
    try {
      chrome.runtime.onMessage.removeListener(this.onMessage);
    } catch {
      // An invalidated extension context has already dropped the listener.
    }
  }

  getEntries(): NativeHealthEntry[] {
    this.syncScope();
    return Array.from(this.entries.values());
  }

  reportFound(feature: NativeHealthFeature): void {
    this.syncScope();
    this.clear(feature);
  }

  /** The owner stopped (teardown, toggle off): it makes no claim about this page any more. */
  withdraw(feature: NativeHealthFeature): void {
    this.syncScope();
    this.clear(feature);
  }

  reportMissing(feature: NativeHealthFeature, probe: MissingAnchorProbe): void {
    if (!this.running) return;
    this.syncScope();
    if (!routeMatches(probe.route, classifyGeminiRoute(location.pathname))) {
      // New chats and other pages have no turns to find. Arming a timer there would only churn.
      this.clear(feature);
      return;
    }
    if (this.pending.has(feature)) return;
    this.arm(feature, probe);
  }

  private arm(feature: NativeHealthFeature, probe: MissingAnchorProbe): void {
    const timer = setTimeout(() => this.verdict(feature), this.graceMs);
    this.pending.set(feature, { timer, probe });
  }

  private verdict(feature: NativeHealthFeature): void {
    // A probe from a page the user has left is dropped here with everything else from that page.
    this.syncScope();
    const current = this.pending.get(feature);
    this.pending.delete(feature);
    if (!this.running || !current) return;
    const { probe } = current;
    // A background tab may not have rendered yet; judge it once it is visible.
    if (document.visibilityState === 'hidden') {
      this.arm(feature, probe);
      return;
    }
    const route = classifyGeminiRoute(location.pathname);
    const stillMissing =
      routeMatches(probe.route, route) &&
      safely(probe.recheck) === false &&
      (probe.expected ? safely(probe.expected) === true : true);
    if (!stillMissing) {
      this.entries.delete(feature);
      return;
    }
    const now = Date.now();
    const previous = this.entries.get(feature);
    this.entries.set(feature, {
      feature,
      anchor: NATIVE_HEALTH_ANCHORS[feature],
      status: probe.status ?? 'broken',
      route,
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
      extensionVersion: previous?.extensionVersion ?? readExtensionVersion(),
    });
  }

  private syncScope(): void {
    const path = location.pathname;
    if (path === this.scopePath) return;
    this.clearAll();
    this.scopePath = path;
  }

  private clearAll(): void {
    this.pending.forEach(({ timer }) => clearTimeout(timer));
    this.pending.clear();
    this.entries.clear();
  }

  private clear(feature: NativeHealthFeature): void {
    const current = this.pending.get(feature);
    if (current) {
      clearTimeout(current.timer);
      this.pending.delete(feature);
    }
    this.entries.delete(feature);
  }
}

/** The page's reporter. Owners report to it; `nativeFeatures.ts` starts and stops it. */
export const nativeHealthReporter = new NativeHealthReporter();

export function startNativeHealth(): StopNativeFeature {
  return nativeHealthReporter.start();
}
