import type { Dispose, PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings } from '@/features/plugins/types';
import type { PrimitiveHandle } from '@/features/plugins/verbs/types';
import {
  GeminiTimelineAdapter,
  type GeminiTimelineOptions,
} from '@/pages/content/timeline/GeminiTimelineAdapter';
import {
  type GeminiTimelineRail,
  startGeminiTimelineRail,
} from '@/pages/content/timeline/startGeminiTimelineRail';
import { whenHistoryTimestampsReady } from '@/pages/content/timestamp/historyTimestampPageService';
import { whenMessageTimestampsReady } from '@/pages/content/timestamp/messageTimestampPageService';

import { TimelineEngine } from '../../TimelineEngine';

/** Local rails share native data, while their plugin scope owns the rail independently of the master. */
export function activateSharedGeminiTimeline(
  scope: PluginScope,
  options: Pick<GeminiTimelineOptions, 'position' | 'scrollContainer'>,
  settings: PluginSettings,
): PrimitiveHandle {
  let currentSettings = settings;
  let rail: GeminiTimelineRail | null = null;
  let stopStart: Dispose | null = null;
  scope.effect(async () => {
    // A public consumer can arrive before cache hydration; no state read/write starts before both cores.
    const ready = await Promise.all([
      whenHistoryTimestampsReady(scope.signal, { requirePageService: true }),
      whenMessageTimestampsReady(scope.signal),
    ]);
    if (scope.signal.aborted || ready.some((value) => !value)) return () => {};
    rail = startGeminiTimelineRail({
      signal: scope.signal,
      createEngine: (previousUrl) => {
        const engine = new TimelineEngine(
          new GeminiTimelineAdapter({ ...options, previousUrl }),
          scope.signal,
        );
        engine.updateSettings(currentSettings);
        return engine;
      },
      start: (engine) => {
        void stopStart?.();
        stopStart = scope.effect(
          () =>
            engine.init().then(() => {
              if (!scope.isDisposed && rail?.engine === engine)
                engine.updateSettings(currentSettings);
              return () => engine.destroy();
            }),
          'shared-gemini-timeline-start',
        );
      },
    });
    return () => {
      rail?.stop();
      rail = null;
    };
  }, 'shared-gemini-timeline');
  return {
    updateSettings(next) {
      currentSettings = next;
      rail?.engine?.updateSettings(next);
    },
  };
}
