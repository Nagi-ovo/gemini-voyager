import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

import { parseUsageRpcResponse, scrapeUsageFromDocument, snapshotFromParsed } from './usageParsing';
import {
  isUsagePathname,
  mergeAutomaticUsageSnapshots,
  mergeUsageSnapshots,
  usageAccountKeyFromPathname,
  usagePathForPathname,
} from './usageSnapshot';
import type {
  MergeUsageSnapshotOptions,
  RawMetric,
  UsageMetric,
  UsageSnapshot,
} from './usageSnapshot';

interface RefreshState {
  generation: number;
  enabled: boolean;
  snapshot: UsageSnapshot | null;
  locale: string | undefined;
}

// Bridge to the MAIN-world usage-observer (document_start). Must match the
// `source` strings in public/usage-observer.js.
const OBS_SRC = 'gv-usage-observer';
const OBS_CMD = 'gv-usage-observer-cmd';
// Silent refresh. Usage only changes when the user sends a message, so the
// primary trigger is event-driven (a generation completing); these are the
// conservative idle fallbacks. Larger intervals = fewer requests = lower
// detection surface; the replay is the same call the page makes, with the
// user's own tokens, at human cadence.
const STALE_MS = 5 * 60_000; // consider a snapshot stale after 5 min
const HEARTBEAT_MS = 2 * 60_000; // idle re-check cadence (staleness-gated)
const GEN_DEBOUNCE_MS = 4_000; // wait after a generation completes, then refresh
const REGRESSION_CONFIRM_MS = 2_000;
interface UsageRecipe {
  rpcid: string;
  args: string;
}

// Verified usage RPC; DOM captures recalibrate it if Google rotates the id.
const DEFAULT_RECIPE: UsageRecipe = { rpcid: 'jSf9Qc', args: '[]' };

/** Owns silent replay, recipe calibration and automatic-decrease confirmation. */
export function createUsageRefresh(
  readState: () => RefreshState,
  onSnapshot: (snapshot: UsageSnapshot) => void,
  setSpinning: (on: boolean) => void,
) {
  let observerMessageHandler: ((ev: MessageEvent) => void) | null = null;
  let observerReady = false;
  let recipe: UsageRecipe | null = null;
  let replayTimer: number | null = null;
  let replaySeq = 0;
  const replayRequests = new Map<
    number,
    {
      allowRegression: boolean;
      startedAt: number;
      accountKey: string;
      generation: number;
    }
  >();
  let pendingRegression: UsageSnapshot | null = null;
  let regressionConfirmTimer: number | null = null;
  let genTimer: number | null = null;
  let spinTimer: number | null = null;
  let visibilityHandler: (() => void) | null = null;
  function isOnUsagePage(): boolean {
    return isUsagePathname(location.pathname);
  }
  function currentUsageAccountKey(): string {
    return usageAccountKeyFromPathname(location.pathname);
  }
  async function loadRecipe(): Promise<void> {
    recipe = (await readRecipe()) ?? DEFAULT_RECIPE;
  }
  function adoptRecipe(raw: unknown): void {
    const next = raw as UsageRecipe | undefined;
    if (next && typeof next.rpcid === 'string') recipe = next;
  }
  function setEnabled(isEnabled: boolean): void {
    if (isEnabled) startReplayLoop();
    else stopReplayLoop();
  }
  async function readRecipe(): Promise<UsageRecipe | null> {
    try {
      const result = await browser.storage.local.get(StorageKeys.GV_USAGE_RECIPE);
      const raw = (result as Record<string, unknown>)[StorageKeys.GV_USAGE_RECIPE];
      if (raw && typeof raw === 'object' && typeof (raw as UsageRecipe).rpcid === 'string') {
        return raw as UsageRecipe;
      }
    } catch {
      // ignore
    }
    return null;
  }

  async function saveRecipe(next: UsageRecipe): Promise<void> {
    recipe = next;
    try {
      await browser.storage.local.set({ [StorageKeys.GV_USAGE_RECIPE]: next });
    } catch {
      // ignore
    }
  }

  /** Adopt a freshly parsed snapshot if it has data; carry the tier forward. */
  function applyParsed(
    parsed: { daily: RawMetric | null; weekly: RawMetric | null },
    tier: string | undefined,
    options: MergeUsageSnapshotOptions = {},
    sourceStartedAt: number = Date.now(),
    accountKey = currentUsageAccountKey(),
  ): void {
    if (!parsed.daily && !parsed.weekly) return;
    const { snapshot, locale } = readState();
    const now = Date.now();
    const next = mergeUsageSnapshots(
      snapshot,
      snapshotFromParsed(
        parsed,
        now,
        tier ?? snapshot?.tier,
        accountKey,
        locale,
        sourceStartedAt,
        options.allowRegression === true,
      ),
      options,
    );
    onSnapshot(next);
  }

  function clearRegressionConfirmation(): void {
    pendingRegression = null;
    if (regressionConfirmTimer !== null) {
      clearTimeout(regressionConfirmTimer);
      regressionConfirmTimer = null;
    }
  }

  function scheduleRegressionConfirmation(): void {
    if (!readState().enabled || regressionConfirmTimer !== null) return;
    regressionConfirmTimer = window.setTimeout(() => {
      regressionConfirmTimer = null;
      requestReplay();
    }, REGRESSION_CONFIRM_MS);
  }

  function applyAutomaticParsed(
    parsed: { daily: RawMetric | null; weekly: RawMetric | null },
    sourceStartedAt: number,
    accountKey: string,
  ): void {
    if (!parsed.daily && !parsed.weekly) return;
    const { snapshot, locale } = readState();
    const now = Date.now();
    const next = snapshotFromParsed(
      parsed,
      now,
      snapshot?.tier,
      accountKey,
      locale,
      sourceStartedAt,
    );
    const result = mergeAutomaticUsageSnapshots(snapshot, pendingRegression, next, now);
    pendingRegression = result.candidate;
    if (result.needsConfirmation) scheduleRegressionConfirmation();
    else clearRegressionConfirmation();
    onSnapshot(result.snapshot);
  }

  /**
   * A capture arrived from the observer (only fires on /usage). Parse it; if it's
   * the usage RPC and its numbers agree with the rendered DOM, remember the
   * {rpcid, args} recipe for silent replay and adopt the precise values.
   */
  function handleCapture(payload: { rpcid?: string; args?: string | null; body?: string }): void {
    if (!readState().enabled || !isOnUsagePage()) return;
    if (!payload || typeof payload.body !== 'string') return;
    const parsed = parseUsageRpcResponse(payload.body);
    if (!parsed) return;

    // Cross-verify against the rendered DOM (ground truth) before trusting it as
    // the recipe — a wrong recipe would silently feed bad numbers off /usage.
    const dom = scrapeUsageFromDocument();
    const close = (a: UsageMetric | null, b: RawMetric | null): boolean =>
      !a || !b || Math.abs(a.percent - b.percent) <= 2;
    if (dom && (!close(dom.daily, parsed.daily) || !close(dom.weekly, parsed.weekly))) return;

    void saveRecipe({
      rpcid: typeof payload.rpcid === 'string' ? payload.rpcid : parsed.rpcid,
      args: typeof payload.args === 'string' ? payload.args : '[]',
    });
    clearRegressionConfirmation();
    applyParsed(parsed, dom?.tier, { allowRegression: true });
  }

  function handleReplayResult(
    payload: { id?: number; body?: string; error?: string } | null | undefined,
  ): void {
    if (!payload) return;
    const request = typeof payload.id === 'number' ? replayRequests.get(payload.id) : undefined;
    if (typeof payload.id === 'number') replayRequests.delete(payload.id);
    // A late reply must not borrow the account or lifetime of the receiving page.
    if (
      !request ||
      request.accountKey !== currentUsageAccountKey() ||
      request.generation !== readState().generation
    )
      return;
    setSpinning(false);
    if (spinTimer !== null) {
      clearTimeout(spinTimer);
      spinTimer = null;
    }
    if (typeof payload.error === 'string' && payload.error) {
      console.warn('[UsageStatus] Usage refresh failed:', payload.error);
    }
    if (!readState().enabled || typeof payload.body !== 'string') return;
    const parsed = parseUsageRpcResponse(payload.body);
    if (!parsed) return;
    if (request.allowRegression) {
      clearRegressionConfirmation();
      applyParsed(
        parsed,
        undefined,
        { allowRegression: true },
        request.startedAt,
        request.accountKey,
      );
    } else {
      applyAutomaticParsed(parsed, request.startedAt, request.accountKey);
    }
  }

  /** A Gemini generation just finished → usage changed → refresh shortly after. */
  function onGenerationComplete(): void {
    if (!readState().enabled || !recipe) return;
    if (genTimer !== null) clearTimeout(genTimer);
    genTimer = window.setTimeout(() => {
      genTimer = null;
      requestReplay();
    }, GEN_DEBOUNCE_MS);
  }

  function start(): void {
    if (observerMessageHandler) return;
    observerMessageHandler = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const data = ev.data as { source?: string; type?: string; payload?: unknown } | null;
      if (!data || data.source !== OBS_SRC) return;
      if (data.type === 'ready') {
        observerReady = true;
      } else if (data.type === 'capture') {
        handleCapture(data.payload as { rpcid?: string; args?: string | null; body?: string });
      } else if (data.type === 'replay-result') {
        handleReplayResult(data.payload as { id?: number; body?: string; error?: string });
      } else if (data.type === 'generation-complete') {
        onGenerationComplete();
      }
    };
    window.addEventListener('message', observerMessageHandler);
    window.postMessage({ source: OBS_CMD, type: 'ping' }, window.location.origin);
  }

  function stop(): void {
    if (observerMessageHandler) {
      window.removeEventListener('message', observerMessageHandler);
      observerMessageHandler = null;
    }
    observerReady = false;
    stopReplayLoop();
    if (spinTimer !== null) {
      clearTimeout(spinTimer);
      spinTimer = null;
    }
  }

  /** Ask the MAIN-world observer to re-issue the usage RPC with the page's tokens. */
  function requestReplay(allowRegression = false): void {
    if (!recipe) return;
    setSpinning(true);
    if (spinTimer !== null) clearTimeout(spinTimer);
    spinTimer = window.setTimeout(() => {
      spinTimer = null;
      setSpinning(false);
      console.warn(
        observerReady
          ? '[UsageStatus] Usage refresh timed out.'
          : '[UsageStatus] Usage observer unavailable; refresh could not run.',
      );
    }, 6_000);
    const id = ++replaySeq;
    const startedAt = Date.now();
    for (const [requestId, request] of replayRequests) {
      if (startedAt - request.startedAt > 30_000) replayRequests.delete(requestId);
    }
    replayRequests.set(id, {
      allowRegression,
      startedAt,
      accountKey: currentUsageAccountKey(),
      generation: readState().generation,
    });
    try {
      window.postMessage(
        {
          source: OBS_CMD,
          type: 'replay',
          payload: {
            id,
            rpcid: recipe.rpcid,
            args: recipe.args,
            // This RPC belongs to Gemini's usage surface. Passing the current
            // conversation route worked only while the backend ignored
            // `source-path`; account-scoped `/usage` keeps replay faithful to the
            // request we originally captured.
            sourcePath: usagePathForPathname(location.pathname),
          },
        },
        location.origin,
      );
    } catch {
      // ignore — page gone / context invalidated
    }
  }

  /** Idle fallback: replay only when off /usage, holding a recipe, and stale. */
  function maybeReplay(): void {
    if (!readState().enabled || !recipe || isOnUsagePage()) return;
    const { snapshot } = readState();
    if (snapshot && Date.now() - snapshot.updatedAt < STALE_MS) return;
    requestReplay();
  }

  function startReplayLoop(): void {
    if (replayTimer !== null) return;
    maybeReplay();
    replayTimer = window.setInterval(maybeReplay, HEARTBEAT_MS);
    if (!visibilityHandler) {
      visibilityHandler = () => {
        if (document.visibilityState === 'visible') maybeReplay();
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    }
  }

  function stopReplayLoop(): void {
    if (replayTimer !== null) {
      clearInterval(replayTimer);
      replayTimer = null;
    }
    if (genTimer !== null) {
      clearTimeout(genTimer);
      genTimer = null;
    }
    clearRegressionConfirmation();
    replayRequests.clear();
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
  }

  return {
    loadRecipe,
    adoptRecipe,
    start,
    stop,
    setEnabled,
    requestReplay,
    maybeReplay,
    clearRegressionConfirmation,
  };
}
