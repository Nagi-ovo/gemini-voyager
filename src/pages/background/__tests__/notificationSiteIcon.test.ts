import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Records what a drawing paints, in the order it paints it. */
class FakeContext {
  public fillStyle = '';
  public readonly fills: string[] = [];
  beginPath(): void {}
  roundRect(): void {}
  translate(): void {}
  scale(): void {}
  fill(): void {
    this.fills.push(this.fillStyle);
  }
}

let contexts: FakeContext[] = [];

class FakeOffscreenCanvas {
  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {}
  getContext(): FakeContext {
    const context = new FakeContext();
    contexts.push(context);
    return context;
  }
  async convertToBlob(): Promise<Pick<Blob, 'type' | 'arrayBuffer'>> {
    // jsdom's Blob has no arrayBuffer(); the worker's does.
    const png = new Uint8Array([137, 80, 78, 71]);
    return { type: 'image/png', arrayBuffer: async () => png.buffer };
  }
}

async function loadIcon() {
  vi.resetModules();
  return (await import('../notificationSiteIcon')).siteNotificationIcon;
}

describe('site notification icon', () => {
  beforeEach(() => {
    contexts = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws each site mark in its own colour on a white tile', async () => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    vi.stubGlobal('Path2D', class {});
    const siteNotificationIcon = await loadIcon();

    const chatgpt = await siteNotificationIcon('chatgpt');
    const gemini = await siteNotificationIcon('gemini');

    expect(chatgpt).toBe('data:image/png;base64,iVBORw==');
    expect(gemini).toBe('data:image/png;base64,iVBORw==');
    expect(contexts[0].fills[0]).toBe('#ffffff');
    expect(new Set(contexts[0].fills.slice(1))).toEqual(new Set(['#000000']));
    expect(new Set(contexts[1].fills.slice(1))).toEqual(new Set(['#4285f4']));
  });

  it('draws a site once and reuses the picture', async () => {
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    vi.stubGlobal('Path2D', class {});
    const siteNotificationIcon = await loadIcon();

    await siteNotificationIcon('gemini');
    await siteNotificationIcon('gemini');

    expect(contexts).toHaveLength(1);
  });

  it('gives no picture where the browser cannot draw off screen', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const siteNotificationIcon = await loadIcon();

    await expect(siteNotificationIcon('chatgpt')).resolves.toBeNull();
  });
});
