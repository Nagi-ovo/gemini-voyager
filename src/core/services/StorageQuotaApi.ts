import type { ChromeLike, StorageQuotaBrowserOptions } from './StorageQuotaTypes';

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}

// Normalize callback and promise APIs without losing synchronous permission gestures.
export class StorageQuotaApi {
  constructor(private readonly dependencies: Pick<StorageQuotaBrowserOptions, 'chromeApi'>) {}

  get chromeApi(): ChromeLike {
    return (
      this.dependencies.chromeApi ??
      (globalThis as typeof globalThis & { chrome?: ChromeLike }).chrome ??
      {}
    );
  }

  async call<T>(
    owner: object,
    method: ((...args: unknown[]) => unknown) | undefined,
    args: unknown[],
  ): Promise<T> {
    if (typeof method !== 'function') throw new Error('Storage API unavailable');

    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (value: T): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const callback = (value: T): void => {
        const lastError = this.chromeApi.runtime?.lastError;
        if (lastError) {
          fail(new Error(lastError.message || 'Extension API request failed'));
          return;
        }
        finish(value);
      };

      try {
        const returned = method.apply(owner, [...args, callback]);
        if (isPromiseLike(returned)) {
          void Promise.resolve(returned).then((value) => finish(value as T), fail);
        } else if (returned !== undefined) {
          finish(returned as T);
        }
      } catch (error) {
        fail(error);
      }
    });
  }
}
