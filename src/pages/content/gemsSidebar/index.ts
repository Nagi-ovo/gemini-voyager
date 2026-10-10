import { watchRouteChanges } from '../utils/routeWatcher';
import { isGemsViewPathname } from './catalog';
import { injectPinButtons, listenPinnedChanges } from './pinToggle';
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
let stopRouteWatcher: (() => void) | null = null;

export async function startGemsSidebar(): Promise<() => void> {
  if (started) return () => {};
  started = true;

  await state.load();
  state.watch();
  const unlistenPinnedChanges = listenPinnedChanges();
  if (isGemsViewPathname(location.pathname)) scraper.start();
  sidebar.refresh();
  state.recordUsage();
  stopRouteWatcher = watchRouteChanges(handleNavigation);

  return () => {
    started = false;
    scraper.stop();
    sidebar.stop();
    state.stop();
    stopRouteWatcher?.();
    stopRouteWatcher = null;
    unlistenPinnedChanges();
  };
}

function handleNavigation(): void {
  // Let the host mount the destination before choosing observers and reading its hero.
  window.setTimeout(() => {
    if (isGemsViewPathname(location.pathname)) scraper.start();
    else scraper.stop();
    sidebar.refresh();
    state.recordUsage();
  }, 250);
}
