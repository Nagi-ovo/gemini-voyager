/** The official sidebar width plugin owns the native CSS and hit guards for one activation. */
import { StorageKeys } from '@/core/types/common';
import { isCustomizedSidebarWidth, normalizeSidebarWidth } from '@/core/utils/sidebarWidthValues';
import {
  type LegacyWriteBackCheck,
  startLegacyWriteBack,
} from '@/features/plugins/runtime/legacyWriteBack';
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings } from '@/features/plugins/types';

import { installSidebarWidthHitGuards } from './hitGuards';
import { buildSidebarWidthCss } from './sidebarWidthCss';

export const SIDEBAR_WIDTH_STYLE_ID = 'gv-sidebar-width-style';
interface SidebarWidthRun {
  update(settings: PluginSettings): void;
}
const runs = new Set<SidebarWidthRun>();

export function planSidebarWidthWrites(
  stored: Readonly<Record<string, unknown>>,
  { firstRead }: LegacyWriteBackCheck,
): Record<string, unknown> | null {
  const width = stored[StorageKeys.SIDEBAR_WIDTH];
  const writes: Record<string, unknown> = {};
  // A live removal is a user's choice, not an upgrade with a never-stored switch.
  if (
    firstRead &&
    stored[StorageKeys.SIDEBAR_WIDTH_ENABLED] === undefined &&
    isCustomizedSidebarWidth(width)
  ) {
    writes[StorageKeys.SIDEBAR_WIDTH_ENABLED] = true;
  }
  const numeric = Number(width);
  const normalized = normalizeSidebarWidth(width);
  if (Number.isFinite(numeric) && numeric !== normalized) {
    writes[StorageKeys.SIDEBAR_WIDTH] = normalized;
  }
  return Object.keys(writes).length ? writes : null;
}

export function activateGeminiSidebarWidth(scope: PluginScope, settings: PluginSettings): void {
  const style = document.createElement('style');
  style.id = SIDEBAR_WIDTH_STYLE_ID;
  const apply = (next: PluginSettings): void => {
    style.textContent = buildSidebarWidthCss(normalizeSidebarWidth(next.widthPx));
    if (!style.isConnected) document.documentElement.appendChild(style);
  };
  scope.effect(() => {
    apply(settings);
    return () => style.remove();
  }, 'sidebar-width:style');
  installSidebarWidthHitGuards(scope);
  const writeBack = startLegacyWriteBack(scope, {
    keys: [StorageKeys.SIDEBAR_WIDTH, StorageKeys.SIDEBAR_WIDTH_ENABLED],
    plan: planSidebarWidthWrites,
    label: 'Sidebar width',
  });
  const run: SidebarWidthRun = {
    update(next) {
      if (scope.isDisposed) return;
      apply(next);
      writeBack.recheck();
    },
  };
  scope.effect(() => {
    runs.add(run);
    return () => {
      runs.delete(run);
    };
  }, 'sidebar-width:settings');
}

export function updateGeminiSidebarWidthSettings(settings: PluginSettings): void {
  for (const run of runs) run.update(settings);
}
