/**
 * `initializeFeatures` in `index.tsx` runs at module load behind ~60 module
 * imports, the content-script handoff and the plugin host, so its flow is not
 * loaded here; these tests drive the layer every await in it goes through,
 * in the shape it is used there: a settings read, then a direct starter.
 */
import { describe, expect, it, vi } from 'vitest';

import { PageRetiredError, createPageSteps } from '../pageInitSteps';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** An initialization segment: read its settings, then start a feature directly. */
async function initializeSegment(
  steps: ReturnType<typeof createPageSteps>,
  read: Promise<{ enabled: boolean }>,
  startFeature: (enabled: boolean) => void,
): Promise<'started' | 'retired'> {
  try {
    const settings = await steps.settle(read);
    startFeature(settings.enabled);
    return 'started';
  } catch (error) {
    if (error instanceof PageRetiredError) return 'retired';
    throw error;
  }
}

describe('content-script initialization steps', () => {
  it('starts a feature directly after its settings read while the page is live', async () => {
    const lifetime = new AbortController();
    const startFeature = vi.fn();

    const result = await initializeSegment(
      createPageSteps(lifetime.signal),
      Promise.resolve({ enabled: true }),
      startFeature,
    );

    expect(result).toBe('started');
    expect(startFeature).toHaveBeenCalledWith(true);
  });

  it('starts nothing after a settings read that settles once the content script retired', async () => {
    const lifetime = new AbortController();
    const startFeature = vi.fn();
    const read = deferred<{ enabled: boolean }>();

    const running = initializeSegment(createPageSteps(lifetime.signal), read.promise, startFeature);
    lifetime.abort();
    read.resolve({ enabled: true });

    expect(await running).toBe('retired');
    expect(startFeature).not.toHaveBeenCalled();
  });

  it('tears down what a start built when it finishes after the content script retired', async () => {
    const lifetime = new AbortController();
    const steps = createPageSteps(lifetime.signal);
    const built = { destroy: vi.fn() };
    const start = deferred<typeof built | null>();

    const adopted = steps.adopt(start.promise, (manager) => manager?.destroy());
    lifetime.abort();
    start.resolve(built);

    await expect(adopted).rejects.toBeInstanceOf(PageRetiredError);
    expect(built.destroy).toHaveBeenCalledOnce();
  });

  it('hands back what a start built while the page is live', async () => {
    const steps = createPageSteps(new AbortController().signal);
    const built = { destroy: vi.fn() };

    await expect(steps.adopt(Promise.resolve(built), (b) => b.destroy())).resolves.toBe(built);
    expect(built.destroy).not.toHaveBeenCalled();
  });
});
