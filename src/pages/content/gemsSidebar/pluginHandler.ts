import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings } from '@/features/plugins/types';

import { watchRouteChanges } from '../utils/routeWatcher';
import { isGemsViewPathname } from './catalog';
import { createGemsPinControls } from './pinToggle';
import { createGemsScraper } from './scraper';
import { createGemsSidebarView } from './sidebar';
import { createGemsState } from './state';

interface GemsSidebarRun {
  update(settings: PluginSettings): void;
}
const runs = new Set<GemsSidebarRun>();

/** One DOM activation; all asynchronous reads become obsolete when its scope aborts. */
export function activateGeminiGemsSidebar(scope: PluginScope, settings: PluginSettings): void {
  let ready = false;
  const state = createGemsState(
    () => {
      if (ready && !scope.isDisposed) sidebar.refresh();
    },
    () => {
      if (ready && !scope.isDisposed) sidebar.refreshExpanded();
    },
    settings.count,
    scope.signal,
  );
  const sidebar = createGemsSidebarView(
    () => state.count,
    () => state.expanded,
    state.visible,
    state.toggleExpanded,
  );
  const pins = createGemsPinControls(scope.signal);
  const scraper = createGemsScraper(state.saveCache, pins.inject);
  let unwatchPins: (() => void) | undefined;
  let unwatchRoute: (() => void) | undefined;
  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    state.stop();
    scraper.stop();
    pins.stop();
    sidebar.stop();
    unwatchPins?.();
    unwatchPins = undefined;
    unwatchRoute?.();
    unwatchRoute = undefined;
  };
  const run: GemsSidebarRun = {
    update(next) {
      if (!scope.isDisposed) state.setCount(next.count);
    },
  };
  scope.effect(() => {
    runs.add(run);
    return () => {
      runs.delete(run);
      stop();
    };
  }, 'gems-sidebar:controllers');
  // Remove UI synchronously so a successor never sees the previous activation's pins/list.
  scope.on(scope.signal, 'abort', stop, { once: true });

  const refresh = (): void => {
    if (scope.isDisposed) return;
    if (isGemsViewPathname(location.pathname)) scraper.start();
    else scraper.stop();
    sidebar.refresh();
    state.recordUsage();
  };
  void state.load().then(() => {
    if (scope.isDisposed) return;
    ready = true;
    state.watch();
    unwatchPins = pins.watch();
    refresh();
    unwatchRoute = watchRouteChanges(() => {
      if (!scope.isDisposed) scope.timer(refresh, 250);
    });
  });
}

export function updateGeminiGemsSidebarSettings(settings: PluginSettings): void {
  for (const run of runs) run.update(settings);
}
