import type { StopNativeFeature } from '../featureLifecycle';
import { startRainEffect } from './rain';
import { startSakuraEffect } from './sakura';
import { startSnowEffect } from './snow';

const STARTED_KEY = '__gvVisualEffectsStarted';

/**
 * Holds the owner token of the run that started the effects. A second copy of
 * this bundle evaluated in the same world shares `globalThis` but not module
 * state, so the token is what keeps it from drawing a second effect. Older
 * builds stored `true` and never cleared it; that still reads as taken.
 */
type VisualEffectsGlobal = typeof globalThis & {
  [STARTED_KEY]?: unknown;
};

const NOOP_STOP: StopNativeFeature = () => {};

/**
 * Start the platform-neutral visual effects once in the current content-script
 * world. The content script is only injected on native Voyager sites or sites
 * already enabled through Prompt Manager / plugins, so no extra host access is
 * needed here.
 *
 * The returned stop removes every effect and listener at once and frees the
 * world for the next start (a content-script handoff). Turning the setting
 * off from the popup is not a stop: the effects keep listening and drain.
 */
export function startVisualEffects(): StopNativeFeature {
  const scope = globalThis as VisualEffectsGlobal;
  if (scope[STARTED_KEY]) return NOOP_STOP;
  const owner = {};
  scope[STARTED_KEY] = owner;

  const stops = [startSnowEffect(), startSakuraEffect(), startRainEffect()];

  return () => {
    for (const stop of stops) stop();
    // A late stop from an earlier run must not free the world a newer run holds.
    if (scope[STARTED_KEY] === owner) delete scope[STARTED_KEY];
  };
}

export { startRainEffect, startSakuraEffect, startSnowEffect };
