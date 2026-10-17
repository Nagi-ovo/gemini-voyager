/**
 * Timing shared by every visual effect: the page renderers (snow, rain, the
 * Sakura main-thread fallback) and the Firefox Sakura worker scene.
 *
 * - `EffectClock` turns rAF timestamps into a time step, caps drawing at
 *   60 fps and owns the drain ramp. It touches no DOM, so the worker imports it.
 * - `watchEffectActivity` decides when a page renderer may animate (tab
 *   visible, window focused or a settings preview). It reads `window` and
 *   `document` only when called.
 */

/** Motion constants are pixels per 60 fps frame; a time step counts those frames. */
export const EFFECT_FRAME_MS = 1000 / 60;
/** Effects draw at most ~60 fps; the 2 ms slack keeps a jittery 60 Hz display from skipping. */
const MIN_DRAW_INTERVAL_MS = EFFECT_FRAME_MS - 2;
/** A resume after a long gap moves at most three frames' worth instead of jumping. */
const MAX_FRAME_STEPS = 3;

/** Drain eases in to full speed over this long. */
const DRAIN_RAMP_MS = 500;
/** Vertical speed multiplier at full drain. */
const DRAIN_SPEED_MULTIPLIER = 8;
/**
 * Extra fall speed at full drain, as a share of the viewport height per frame.
 * The multiplier alone leaves the slowest layers (0.1–0.15 px per frame) on
 * screen for 15–22 s; this floor clears even those in about 1.8 s.
 */
const DRAIN_FLOOR_PER_VIEWPORT = 1 / 95;
/** A drain finishes after this much animated time, whatever is still on screen. */
export const DRAIN_CAP_MS = 2_500;
/** Particles still on screen fade out over the last part of the cap. */
const DRAIN_FADE_MS = 300;

export class EffectClock {
  private lastDrawTime: number | null = null;
  /**
   * Real time the drain has been running, null while not draining. Paused time
   * never counts: every pause ends with `resetTimeBase`.
   */
  private drainElapsedMs: number | null = null;
  /** Drain ramp progress, 0 → 1, eased in. */
  private boost = 0;

  /**
   * The time step for a frame at `now`, in 60 fps frames, or null when this
   * frame comes too soon after the last drawn one and should not be drawn.
   */
  advance(now: number): number | null {
    if (this.lastDrawTime === null) {
      this.lastDrawTime = now;
      this.advanceDrain(EFFECT_FRAME_MS);
      return 1;
    }
    const elapsed = now - this.lastDrawTime;
    if (elapsed < MIN_DRAW_INTERVAL_MS) return null;
    this.lastDrawTime = now;
    // The clamp is for motion only: drain time follows the real elapsed time, or at
    // 10 fps every 100 ms frame would count 50 ms and the 2.5 s cap would take 5 s.
    this.advanceDrain(elapsed);
    return Math.min(MAX_FRAME_STEPS, elapsed / EFFECT_FRAME_MS);
  }

  /** Forget the last draw, so the first frame after a pause takes one normal step. */
  resetTimeBase(): void {
    this.lastDrawTime = null;
  }

  /** Start accelerating particles out; a drain already under way keeps its progress. */
  startDrain(): void {
    if (this.drainElapsedMs === null) this.drainElapsedMs = 0;
  }

  /** Cancel a drain: particles return to their resting speed at once. */
  revive(): void {
    this.drainElapsedMs = null;
    this.boost = 0;
  }

  get draining(): boolean {
    return this.drainElapsedMs !== null;
  }

  /** Vertical speed for a particle whose resting speed is `baseSpeed` px per frame. */
  fallSpeed(baseSpeed: number, viewportHeight: number): number {
    if (this.boost === 0) return baseSpeed;
    return (
      baseSpeed * (1 + (DRAIN_SPEED_MULTIPLIER - 1) * this.boost) +
      viewportHeight * DRAIN_FLOOR_PER_VIEWPORT * this.boost
    );
  }

  /** Opacity factor for the whole effect: 1, except over the last moments of a drain. */
  fadeAlpha(): number {
    if (this.drainElapsedMs === null) return 1;
    return Math.min(1, Math.max(0, (DRAIN_CAP_MS - this.drainElapsedMs) / DRAIN_FADE_MS));
  }

  /** The drain has run for its full cap and should finish now. */
  drainExpired(): boolean {
    return this.drainElapsedMs !== null && this.drainElapsedMs >= DRAIN_CAP_MS;
  }

  private advanceDrain(stepMs: number): void {
    if (this.drainElapsedMs === null) return;
    this.drainElapsedMs += stepMs;
    const progress = Math.min(1, this.drainElapsedMs / DRAIN_RAMP_MS);
    this.boost = progress * progress;
  }
}

/** Scale positions from one viewport to another so a resized window stays evenly filled. */
export function remapToViewport(
  particles: readonly { x: number; y: number }[],
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
): void {
  if (fromWidth <= 0 || fromHeight <= 0) return;
  const scaleX = toWidth / fromWidth;
  const scaleY = toHeight / fromHeight;
  if (scaleX === 1 && scaleY === 1) return;
  for (const particle of particles) {
    particle.x *= scaleX;
    particle.y *= scaleY;
  }
}

/** How long a settings change keeps an effect animating in an unfocused window. */
export const EFFECT_PREVIEW_MS = 30_000;

export interface EffectActivity {
  /** Whether frames should be drawn now. */
  isRunning(): boolean;
  /**
   * The user just chose or changed the effect. That usually happens in the
   * toolbar popup, which takes focus from the page, so an unfocused page keeps
   * animating until it regains focus or `EFFECT_PREVIEW_MS` passes.
   */
  preview(): void;
  stop(): void;
}

/**
 * Track whether a page renderer may animate: the tab is visible and the window
 * is focused, or a preview is running. `onChange` fires only on a change.
 */
export function watchEffectActivity(onChange: (running: boolean) => void): EffectActivity {
  let focused = document.hasFocus();
  let previewTimer: number | null = null;
  let blurTimer: number | null = null;
  let stopped = false;

  const compute = (): boolean =>
    document.visibilityState === 'visible' && (focused || previewTimer !== null);
  let running = compute();

  const update = (): void => {
    if (stopped) return;
    const next = compute();
    if (next === running) return;
    running = next;
    onChange(next);
  };

  const clearPreview = (): void => {
    if (previewTimer === null) return;
    window.clearTimeout(previewTimer);
    previewTimer = null;
  };

  const clearBlurCheck = (): void => {
    if (blurTimer === null) return;
    window.clearTimeout(blurTimer);
    blurTimer = null;
  };

  const handleVisibility = (): void => update();

  const handleFocus = (): void => {
    focused = true;
    clearBlurCheck();
    clearPreview();
    update();
  };

  const handleBlur = (): void => {
    if (blurTimer !== null) return;
    // Focus moving into a host iframe (Gemini Canvas) blurs the window while this
    // document keeps focus; the check has to wait until focus has settled.
    blurTimer = window.setTimeout(() => {
      blurTimer = null;
      focused = document.hasFocus();
      update();
    }, 0);
  };

  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('blur', handleBlur);

  return {
    isRunning: () => running,
    preview(): void {
      if (stopped || document.hasFocus()) return;
      focused = false;
      clearPreview();
      previewTimer = window.setTimeout(() => {
        previewTimer = null;
        focused = document.hasFocus();
        update();
      }, EFFECT_PREVIEW_MS);
      update();
    },
    stop(): void {
      stopped = true;
      clearPreview();
      clearBlurCheck();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    },
  };
}
