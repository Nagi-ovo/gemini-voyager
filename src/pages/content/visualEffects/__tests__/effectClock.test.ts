import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DRAIN_CAP_MS,
  EFFECT_FRAME_MS,
  EFFECT_PREVIEW_MS,
  EffectClock,
  watchEffectActivity,
} from '../effectClock';

/** Run `clock` at `hz` for `durationMs` and return how far a 1 px/frame particle fell. */
function fallDistance(clock: EffectClock, hz: number, durationMs: number, height = 1000): number {
  let distance = 0;
  let draws = 0;
  for (let time = 0; time <= durationMs + 1e-6; time += 1000 / hz) {
    const dt = clock.advance(time);
    if (dt === null) continue;
    draws += 1;
    distance += clock.fallSpeed(1, height) * dt;
  }
  return draws === 0 ? 0 : distance;
}

describe('EffectClock', () => {
  it('moves particles the same real-time distance at 60, 120 and 144 Hz', () => {
    const at60 = fallDistance(new EffectClock(), 60, 1000);
    expect(at60).toBeCloseTo(61, 5);
    expect(fallDistance(new EffectClock(), 120, 1000)).toBeCloseTo(at60, 5);
    // 144 Hz draws every third tick (~48 fps); the last draw lands a few ms before 1 s.
    expect(Math.abs(fallDistance(new EffectClock(), 144, 1000) - at60)).toBeLessThan(1.5);
  });

  it('draws at most 60 fps on a 120 Hz display', () => {
    const clock = new EffectClock();
    let draws = 0;
    for (let tick = 0; tick < 120; tick += 1) {
      if (clock.advance(tick * (1000 / 120)) !== null) draws += 1;
    }
    expect(draws).toBe(60);
  });

  it('takes at most three frames of motion after a long pause', () => {
    const clock = new EffectClock();
    clock.advance(0);
    expect(clock.advance(500)).toBe(3);
    clock.resetTimeBase();
    expect(clock.advance(10_000)).toBe(1);
  });

  it('eases the drain in and finishes it by the cap, fading out first', () => {
    const clock = new EffectClock();
    clock.advance(0);
    clock.startDrain();
    let time = 0;
    const speeds: number[] = [];
    let fadeStarted = Number.POSITIVE_INFINITY;
    while (!clock.drainExpired()) {
      time += EFFECT_FRAME_MS;
      clock.advance(time);
      speeds.push(clock.fallSpeed(1, 1080));
      if (clock.fadeAlpha() < 1 && fadeStarted === Number.POSITIVE_INFINITY) fadeStarted = time;
      expect(time).toBeLessThanOrEqual(DRAIN_CAP_MS + EFFECT_FRAME_MS);
    }
    // Speed only grows, from near resting to well over 8x.
    expect(speeds[0]).toBeLessThan(1.5);
    expect(speeds.every((speed, index) => index === 0 || speed >= speeds[index - 1])).toBe(true);
    expect(speeds.at(-1)).toBeGreaterThan(8);
    expect(fadeStarted).toBeGreaterThan(DRAIN_CAP_MS - 400);
    expect(clock.fadeAlpha()).toBe(0);
  });

  it('clears a 1080 px viewport within two seconds even for the slowest layer', () => {
    const clock = new EffectClock();
    clock.advance(0);
    clock.startDrain();
    let time = 0;
    let y = 0;
    while (y < 1080) {
      time += EFFECT_FRAME_MS;
      y += clock.fallSpeed(0.1, 1080) * (clock.advance(time) ?? 0);
    }
    expect(time).toBeGreaterThan(1200);
    expect(time).toBeLessThan(2000);
  });

  /** Drain at `frameMs` per frame after an optional first gap; returns finish time and fade alphas seen. */
  function drainAt(frameMs: number, firstGapMs = frameMs) {
    const clock = new EffectClock();
    clock.advance(0);
    clock.startDrain();
    let time = 0;
    const fades: number[] = [];
    for (let frame = 0; !clock.drainExpired() && time < 20_000; frame += 1) {
      time += frame === 0 ? firstGapMs : frameMs;
      clock.advance(time);
      fades.push(clock.fadeAlpha());
    }
    return { time, fades };
  }

  it('finishes the drain within the cap at 10 fps, fading out first', () => {
    const { time, fades } = drainAt(100);
    expect(time).toBeLessThanOrEqual(DRAIN_CAP_MS);
    expect(fades.some((alpha) => alpha > 0 && alpha < 1)).toBe(true);
  });

  it('a long frame during a drain does not stretch the cap', () => {
    const withinCap = drainAt(EFFECT_FRAME_MS, 1_500);
    expect(withinCap.time).toBeLessThanOrEqual(DRAIN_CAP_MS + EFFECT_FRAME_MS);
    expect(withinCap.fades.some((alpha) => alpha > 0 && alpha < 1)).toBe(true);

    // A frame that crosses the cap ends the drain on that frame.
    expect(drainAt(500).time).toBeLessThanOrEqual(DRAIN_CAP_MS);
    expect(drainAt(EFFECT_FRAME_MS, 4_000).time).toBeLessThanOrEqual(4_000 + EFFECT_FRAME_MS);
  });

  it('counts only running time toward the drain cap', () => {
    const clock = new EffectClock();
    clock.advance(0);
    clock.startDrain();
    clock.advance(EFFECT_FRAME_MS);
    // A long pause (hidden tab) followed by a resume is one clamped step, not 60 s.
    clock.resetTimeBase();
    clock.advance(60_000);
    clock.advance(60_000 + EFFECT_FRAME_MS);
    expect(clock.drainExpired()).toBe(false);
    expect(clock.fadeAlpha()).toBe(1);
  });

  it('revive returns particles to resting speed at once', () => {
    const clock = new EffectClock();
    clock.advance(0);
    clock.startDrain();
    for (let frame = 1; frame <= 60; frame += 1) clock.advance(frame * EFFECT_FRAME_MS);
    expect(clock.fallSpeed(1, 1000)).toBeGreaterThan(8);
    clock.revive();
    expect(clock.fallSpeed(1, 1000)).toBe(1);
    expect(clock.fadeAlpha()).toBe(1);
    expect(clock.drainExpired()).toBe(false);
  });
});

describe('watchEffectActivity', () => {
  let focused: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    focused = true;
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function blurWindow(stillFocused: boolean): void {
    focused = stillFocused;
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(0);
  }

  it('pauses when the window loses focus and resumes on focus', () => {
    const onChange = vi.fn();
    const activity = watchEffectActivity(onChange);
    expect(activity.isRunning()).toBe(true);

    blurWindow(false);
    expect(activity.isRunning()).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);

    focused = true;
    window.dispatchEvent(new Event('focus'));
    expect(activity.isRunning()).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(true);
    activity.stop();
  });

  it('keeps running when focus moves into a host iframe', () => {
    const onChange = vi.fn();
    const activity = watchEffectActivity(onChange);
    blurWindow(true);
    expect(activity.isRunning()).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    activity.stop();
  });

  it('pauses in a hidden tab even while previewing', () => {
    focused = false;
    const activity = watchEffectActivity(vi.fn());
    activity.preview();
    expect(activity.isRunning()).toBe(true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(activity.isRunning()).toBe(false);
    activity.stop();
  });

  it('previews a settings change in an unfocused window until focus returns', () => {
    focused = false;
    const onChange = vi.fn();
    const activity = watchEffectActivity(onChange);
    expect(activity.isRunning()).toBe(false);

    activity.preview();
    expect(activity.isRunning()).toBe(true);
    vi.advanceTimersByTime(EFFECT_PREVIEW_MS - 1);
    expect(activity.isRunning()).toBe(true);

    focused = true;
    window.dispatchEvent(new Event('focus'));
    // Focus ends the preview: a later blur pauses at once rather than after 30 s.
    blurWindow(false);
    expect(activity.isRunning()).toBe(false);
    activity.stop();
  });

  it('pauses a preview after 30 s if the window is still unfocused', () => {
    focused = false;
    const onChange = vi.fn();
    const activity = watchEffectActivity(onChange);
    activity.preview();
    vi.advanceTimersByTime(EFFECT_PREVIEW_MS);
    expect(activity.isRunning()).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
    activity.stop();
  });

  it('a preview while the page has focus changes nothing', () => {
    const activity = watchEffectActivity(vi.fn());
    activity.preview();
    expect(vi.getTimerCount()).toBe(0);
    activity.stop();
  });

  it('stop releases its listeners and timers', () => {
    focused = false;
    const onChange = vi.fn();
    const activity = watchEffectActivity(onChange);
    activity.preview();
    window.dispatchEvent(new Event('blur'));
    onChange.mockClear();
    activity.stop();
    expect(vi.getTimerCount()).toBe(0);
    focused = true;
    window.dispatchEvent(new Event('focus'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
