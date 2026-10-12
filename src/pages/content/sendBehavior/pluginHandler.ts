import { getSendKeyCoordinator } from '@/core/services/composer/sendKeys/sendKeyCoordinator';
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';

export function activateGeminiSafariEnterFix(scope: PluginScope): void {
  const coordinator = getSendKeyCoordinator('gemini');
  if (!coordinator) throw new Error('The page send key coordinator is not ready');
  scope.effect(
    () => coordinator.registerSafariFallback({ source: 'voyager.gemini-safari-enter-fix' }),
    'safari-enter-fix',
  );
}
