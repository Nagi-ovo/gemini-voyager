import { type Dispose, PluginScope } from '@/features/plugins/runtime/pluginScope';

export function abortError(): DOMException {
  return new DOMException('Temporary chat handoff cancelled', 'AbortError');
}

export function wait(scope: PluginScope, ms: number): Promise<void> {
  if (scope.signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    let stopTimer: Dispose | null = null;
    let stopAbort: Dispose | null = null;
    const settle = (action: () => void): void => {
      void stopTimer?.();
      void stopAbort?.();
      action();
    };
    stopTimer = scope.timer(() => settle(resolve), ms);
    stopAbort = scope.on(scope.signal, 'abort', () => settle(() => reject(abortError())));
  });
}
