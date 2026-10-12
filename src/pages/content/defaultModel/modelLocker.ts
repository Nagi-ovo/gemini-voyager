import { startStaleStarSweeper } from './defaultStars';
import { DefaultModelPreferences } from './preferences';
import { DefaultModelSession } from './runtime';

export interface NativeDefaultModel {
  /** Ends the module for this page: the running session, the sweeper and the switch listener. */
  readonly stop: () => void;
  /** Settles once the startup read is done and the session, if any, has started. */
  readonly ready: Promise<void>;
}

/**
 * The native default-model module. It follows `gvDefaultModelAutoApply` in
 * both storage areas, a missing key counting as on, and runs one
 * `DefaultModelSession` while the switch is on. While it is off, only a sweeper
 * watches for stars that Gemini brings back in a reattached menu pane.
 */
export function mountDefaultModelNative(): NativeDefaultModel {
  const preferences = new DefaultModelPreferences();
  let stopped = false;
  let session: DefaultModelSession | null = null;
  let sessionStart: Promise<void> = Promise.resolve();
  let stopSweeper: (() => void) | null = null;
  let stopSwitchWatch: (() => void) | null = null;

  const apply = (enabled: boolean): void => {
    if (enabled) {
      stopSweeper?.();
      stopSweeper = null;
      if (session) return;
      session = new DefaultModelSession(preferences);
      sessionStart = session.start();
      return;
    }
    session?.stop();
    session = null;
    stopSweeper ??= startStaleStarSweeper();
  };

  const ready = preferences.loadAutoApplySwitch().then(() => {
    if (stopped) return;
    stopSwitchWatch = preferences.watchAutoApply(apply);
    apply(preferences.enabled);
    return sessionStart;
  });

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    stopSwitchWatch?.();
    stopSwitchWatch = null;
    session?.stop();
    session = null;
    stopSweeper?.();
    stopSweeper = null;
  };

  return { stop, ready };
}

/** Starts the native module; the returned stop is valid at once, the startup read continues behind it. */
export function startDefaultModelNative(): () => void {
  const { stop, ready } = mountDefaultModelNative();
  ready.catch((error: unknown) => {
    console.error('[Gemini Voyager] Default model failed to start', error);
  });
  return stop;
}
