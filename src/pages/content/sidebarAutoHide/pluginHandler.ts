import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { acquireSidebarHide } from './index';

export function activateGeminiSidebarAutoHide(scope: PluginScope): void {
  scope.effect(() => acquireSidebarHide('autoHide'), 'sidebar-auto-hide:owner');
}

export function activateGeminiSidebarFullHide(scope: PluginScope): void {
  scope.effect(() => acquireSidebarHide('fullHide'), 'sidebar-full-hide:owner');
}
