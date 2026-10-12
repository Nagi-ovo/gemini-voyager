/**
 * The async boundaries of one content-script initialization.
 *
 * `mountNativeFeature` stops a native feature that settles after this copy
 * retired, but `initializeFeatures` also calls starters directly (Quote Reply,
 * folder manager, export buttons, …). Once `lifetime` aborts, every boundary
 * throws `PageRetiredError`, so no code after it runs: a direct starter would
 * otherwise build DOM and listeners after the cleanups that remove them ran.
 */
export class PageRetiredError extends Error {
  public constructor() {
    super('This content script retired during initialization');
    this.name = 'PageRetiredError';
  }
}

export interface PageSteps {
  /** Await `work`, then throw `PageRetiredError` if the page retired meanwhile. */
  settle<T>(work: Promise<T>): Promise<T>;
  /**
   * Like `settle`, for a start that hands back what it built: when it settles
   * after retirement, `stop` tears that down before the error is thrown.
   */
  adopt<T>(work: Promise<T>, stop: (built: T) => void): Promise<T>;
}

export function createPageSteps(lifetime: AbortSignal): PageSteps {
  return {
    async settle(work) {
      const value = await work;
      if (lifetime.aborted) throw new PageRetiredError();
      return value;
    },
    async adopt(work, stop) {
      const built = await work;
      if (lifetime.aborted) {
        stop(built);
        throw new PageRetiredError();
      }
      return built;
    },
  };
}
