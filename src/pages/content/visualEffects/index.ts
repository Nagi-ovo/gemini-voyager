import { startRainEffect } from './rain';
import { startSakuraEffect } from './sakura';
import { startSnowEffect } from './snow';

const STARTED_KEY = '__gvVisualEffectsStarted';

type VisualEffectsGlobal = typeof globalThis & {
  [STARTED_KEY]?: boolean;
};

/**
 * Start the platform-neutral visual effects once in the current content-script
 * world. The content script is only injected on native Voyager sites or sites
 * already enabled through Prompt Manager / plugins, so no extra host access is
 * needed here.
 */
export function startVisualEffects(): void {
  const scope = globalThis as VisualEffectsGlobal;
  if (scope[STARTED_KEY]) return;
  scope[STARTED_KEY] = true;

  startSnowEffect();
  startSakuraEffect();
  startRainEffect();
}

export { startRainEffect, startSakuraEffect, startSnowEffect };
