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
  /** The selection in force, so a page restored from the back/forward cache shows it again. */
  let selected: PluginSettings = { effect: 'off' };

  const select = (settings: PluginSettings): void => {
    if (pageScope.isDisposed) return;
    selected = settings;
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
  // pagehide, not beforeunload: a cancelled "Leave site?" fires beforeunload and the page stays,
  // which left the effect gone while the setting said on. A page entering the back/forward cache
  // drops its renderers (no worker or frame kept frozen) and gets its selection back on pageshow.
  // A real unload needs no teardown: the document goes away with them.
  const suspend = (event: PageTransitionEvent): void => {
    if (event.persisted) destroyRenderers();
  };
  const restore = (event: PageTransitionEvent): void => {
    if (event.persisted && activation) select(selected);
  };
  pageScope.effect(() => {
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', restore);
    return () => {
      activation = null;
      destroyRenderers();
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', restore);
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
