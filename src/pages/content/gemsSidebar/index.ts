import { watchRouteChanges } from '../utils/routeWatcher';
import { isGemsViewPathname } from './catalog';
import { injectPinButtons, listenPinnedChanges, removePinButtons } from './pinToggle';
import { createGemsScraper } from './scraper';
import { createGemsSidebarView } from './sidebar';
import { createGemsState } from './state';

// Keep data and UI owners across stop/start, as the original per-tab singleton did.
const state = createGemsState(
  () => sidebar.refresh(),
  () => sidebar.refreshExpanded(),
);
const sidebar = createGemsSidebarView(
  () => state.count,
  () => state.expanded,
  state.visible,
  state.toggleExpanded,
);
const scraper = createGemsScraper(state.saveCache, injectPinButtons);
let started = false;
// Bumped by stop so an earlier run's stop, called again, cannot stop a newer run.
let run = 0;
let stopRouteWatcher: (() => void) | null = null;
const navigationTimers = new Set<number>();

export async function startGemsSidebar(): Promise<() => void> {
  if (started) return () => {};
  started = true;
  const thisRun = ++run;

  await state.load();
  state.watch();
  const unlistenPinnedChanges = listenPinnedChanges();
  if (isGemsViewPathname(location.pathname)) scraper.start();
  sidebar.refresh();
  state.recordUsage();
  stopRouteWatcher = watchRouteChanges(handleNavigation);

  return () => {
    if (thisRun !== run) return;
    run += 1;
    started = false;
    navigationTimers.forEach((timer) => window.clearTimeout(timer));
    navigationTimers.clear();
    scraper.stop();
    removePinButtons();
    sidebar.stop();
    state.stop();
    stopRouteWatcher?.();
    stopRouteWatcher = null;
    unlistenPinnedChanges();
  };
}

function handleNavigation(): void {
  // Let the host mount the destination before choosing observers and reading its hero.
  const timer = window.setTimeout(() => {
    navigationTimers.delete(timer);
    if (isGemsViewPathname(location.pathname)) scraper.start();
    else scraper.stop();
    sidebar.refresh();
    state.recordUsage();
  }, 250);
  navigationTimers.add(timer);
}
