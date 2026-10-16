import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

import { acquireWatermarkControl } from './index';

function activateControl(scope: PluginScope, mode: 'download' | 'preview'): void {
  const release = acquireWatermarkControl(mode);
  // Abort synchronously: a slow cleanup ledger must not admit another download.
  scope.signal.addEventListener('abort', release, { once: true });
  scope.effect(() => release, `watermark-${mode}`);
}

export function activateGeminiWatermarkDownload(scope: PluginScope): void {
  activateControl(scope, 'download');
}

export function activateGeminiWatermarkPreview(scope: PluginScope): void {
  activateControl(scope, 'preview');
}
