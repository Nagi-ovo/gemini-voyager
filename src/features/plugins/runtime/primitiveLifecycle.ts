/**
 * The `native` op half of a mounted plugin: every primitive it invokes runs
 * under one shared `PluginScope`, settings updates apply in place when every
 * handle can absorb them, and otherwise the scope restarts (serialized) under
 * the new values. The engine entry owns the state (`PrimitiveSlot`).
 */
import { logger } from '@/core/services/LoggerService';

import { hasNativeParamTemplates, renderNativeParams } from '../manifest/nativeParamSettings';
import type { NativeOperation, PluginManifest, PluginSettings, SiteAdapter } from '../types';
import { getPrimitive } from '../verbs/registry';
import type { PluginInspection, PrimitiveHandle } from '../verbs/types';
import { PluginScope } from './pluginScope';

/** The primitive state of one mounted plugin, held on its engine entry. */
export interface PrimitiveSlot {
  readonly manifest: PluginManifest;
  /** Current resolved settings; a queued restart for older ones activates nothing. */
  settings: PluginSettings;
  /** Side-effect ledger shared by the plugin's `native` op primitives. */
  primitiveScope?: PluginScope;
  /** Serializes settings-driven primitive restarts. */
  primitiveRestart?: Promise<void>;
  /** Target counters registered by primitives (health signal, plan D12). */
  targetCounters: Array<() => number>;
  /** Handles of successfully activated primitives (settings updates in place). */
  primitiveHandles: PrimitiveHandle[];
  /** Number of native ops that activated (handles may still be arriving). */
  primitiveActivations: number;
}

export interface PrimitiveEnv {
  readonly doc: Document;
  readonly adapter: SiteAdapter | null;
  /** False once the slot's plugin was unmounted or remounted. */
  readonly isCurrent: (slot: PrimitiveSlot) => boolean;
  readonly inspectPlugins?: () => PluginInspection;
}

function nativeOps(manifest: PluginManifest): NativeOperation[] {
  return (manifest.contributes.domOps ?? []).filter(
    (op): op is NativeOperation => op.op === 'native',
  );
}

/**
 * Run every `native` op of the plugin under one shared scope. An unknown
 * handler or invalid params are skipped with a warning; the status machine
 * has normally already reported them as needs-handler, so this is defence
 * in depth, never a crash.
 */
export function activatePrimitives(
  entry: PrimitiveSlot,
  settings: PluginSettings,
  env: PrimitiveEnv,
): void {
  const ops = nativeOps(entry.manifest);
  if (ops.length === 0) return;
  const scope = new PluginScope();
  entry.primitiveScope = scope;
  entry.targetCounters = [];
  entry.primitiveHandles = [];
  entry.primitiveActivations = 0;
  const context = {
    doc: env.doc,
    adapter: env.adapter,
    pluginId: entry.manifest.id,
    settings,
    setTargetCounter: (count: () => number) => {
      entry.targetCounters.push(count);
    },
    inspectPlugins: env.inspectPlugins,
  };
  for (const op of ops) {
    const primitive = getPrimitive(op.handler);
    if (!primitive) {
      logger.warn('Unknown primitive', { id: entry.manifest.id, handler: op.handler });
      continue;
    }
    const rendered = renderNativeParams(op.params, entry.manifest.contributes.settings, settings);
    const params = rendered.success ? primitive.validateParams(rendered.data) : rendered;
    if (!params.success) {
      logger.warn('Invalid primitive params', {
        id: entry.manifest.id,
        handler: op.handler,
        issues: params.error,
      });
      continue;
    }
    try {
      const result = primitive.activate(scope, params.data, context);
      entry.primitiveActivations += 1;
      const adopt = (handle: void | PrimitiveHandle): void => {
        if (handle && entry.primitiveScope === scope) entry.primitiveHandles.push(handle);
      };
      if (result instanceof Promise) {
        result.then(adopt).catch((error) => {
          logger.error('Primitive activation failed', {
            id: entry.manifest.id,
            handler: op.handler,
            error: String(error),
          });
        });
      } else {
        adopt(result);
      }
    } catch (error) {
      logger.error('Primitive activation failed', {
        id: entry.manifest.id,
        handler: op.handler,
        error: String(error),
      });
    }
  }
}

/**
 * Dispose the primitives' scope, then re-activate under the new settings
 * (serialized). Always chain: while a restart is still disposing there is no
 * scope to take, but the newer settings must still get their activation once
 * the queue drains — otherwise the stale restart bails on them and the plugin
 * ends up with no primitives at all.
 */
export function restartPrimitives(
  entry: PrimitiveSlot,
  settings: PluginSettings,
  env: PrimitiveEnv,
): void {
  const previous = entry.primitiveScope;
  entry.primitiveScope = undefined;
  entry.primitiveRestart = (entry.primitiveRestart ?? Promise.resolve()).then(async () => {
    if (previous) await previous.dispose();
    if (!env.isCurrent(entry)) return;
    if (entry.settings !== settings) return;
    activatePrimitives(entry, settings, env);
  });
  // Begin teardown now: an immediate unmount cannot reach the scope held by this queue.
  void previous?.dispose();
}

export function updatePrimitiveSettings(
  entry: PrimitiveSlot,
  settings: PluginSettings,
  env: PrimitiveEnv,
): void {
  if (!entry.primitiveScope) {
    // No live scope: either the plugin has no primitives, or a restart is
    // still disposing and these settings must queue behind it.
    if (entry.primitiveRestart) restartPrimitives(entry, settings, env);
    return;
  }
  const handles = entry.primitiveHandles;
  const allInPlace =
    // An updater receives settings, not new params; templates need fresh activation.
    !nativeOps(entry.manifest).some((op) => hasNativeParamTemplates(op.params)) &&
    handles.length === entry.primitiveActivations &&
    handles.every((handle) => typeof handle.updateSettings === 'function');
  if (allInPlace && handles.length > 0) {
    for (const handle of handles) handle.updateSettings?.(settings);
    return;
  }
  restartPrimitives(entry, settings, env);
}
