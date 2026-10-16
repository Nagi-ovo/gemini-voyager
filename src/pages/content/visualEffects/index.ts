import type { NativeHandler } from '@/features/plugins/runtime/nativeHandlers';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings } from '@/features/plugins/types';

import { createRainRenderer } from './rain';
import { createSakuraRenderer } from './sakura';
import { createSnowRenderer } from './snow';
import type { VisualEffectKind, VisualEffectRenderer } from './types';

const STARTED_KEY = '__gvVisualEffectsStarted';
type VisualEffectsGlobal = typeof globalThis & { [STARTED_KEY]?: unknown };

export interface VisualEffectsRuntime {
  handler: NativeHandler;
  destroy(): void;
}

/**
 * The page owns renderers; a plugin activation only owns their selected effect.
 * Keeping these lifetimes separate lets off drain and a new on resume the same
 * particles. The existing renderer drain state already owns that transition;
 * a second state machine would duplicate it.
 * No settings are read here: the trusted builtin bindings own that decision.
 */
export function createVisualEffectsRuntime(): VisualEffectsRuntime {
  const world = globalThis as VisualEffectsGlobal;
  if (world[STARTED_KEY]) return { handler: {}, destroy: () => {} };
  const owner = {};
  world[STARTED_KEY] = owner;
  const pageScope = new PluginScope();
  const renderers: Record<VisualEffectKind, VisualEffectRenderer> = {
    snow: createSnowRenderer(),
    sakura: createSakuraRenderer(),
    rain: createRainRenderer(),
  };
  let activation: object | null = null;

  const select = (settings: PluginSettings): void => {
    if (pageScope.isDisposed) return;
    for (const [kind, renderer] of Object.entries(renderers)) {
      if (settings.effect === kind) renderer.enable();
      else renderer.drain();
    }
  };
  const destroy = (): void => {
    void pageScope.dispose();
  };
  const destroyRenderers = (): void => {
    for (const renderer of Object.values(renderers)) renderer.destroy();
  };
  pageScope.effect(() => {
    // Cancelled unloads and bfcache restores must leave the page scope available for reactivation.
    window.addEventListener('beforeunload', destroyRenderers);
    return () => {
      activation = null;
      destroyRenderers();
      window.removeEventListener('beforeunload', destroyRenderers);
      // An older page's late cleanup must never release a newer page's owner.
      if (world[STARTED_KEY] === owner) delete world[STARTED_KEY];
    };
  }, 'visual effects page lifetime');

  return {
    handler: {
      activate(scope, settings) {
        if (pageScope.isDisposed) return;
        const token = {};
        activation = token;
        scope.effect(() => {
          select(settings);
          return () => {
            if (activation !== token) return;
            activation = null;
            select({ effect: 'off' });
          };
        }, 'visual effects selection');
      },
      updateSettings(settings) {
        if (activation) select(settings);
      },
    },
    destroy,
  };
}
