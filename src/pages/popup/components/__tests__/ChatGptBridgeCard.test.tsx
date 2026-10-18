import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TranslationKey } from '@/utils/translations';

import { CHATGPT_LOCAL_BRIDGE_PLUGIN_ID } from '../../hooks/useBridgeStatus';
import { ChatGptBridgeCard } from '../ChatGptBridgeCard';

type StateCallback = (state: Record<string, { enabled: boolean }>) => void;

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  permissionRequest: vi.fn(),
  loadPluginState: vi.fn(),
  subscribers: [] as StateCallback[],
  askConfirm: vi.fn(),
  buildTarget: vi.fn(() => 'chrome'),
  optionalHosts: vi.fn(() => true),
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { sendMessage: mocks.sendMessage },
    permissions: {
      request: mocks.permissionRequest,
      onAdded: { addListener: vi.fn(), removeListener: vi.fn() },
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  },
}));

vi.mock('@/features/plugins/storage/pluginState', () => ({
  loadPluginState: mocks.loadPluginState,
  subscribePluginState: (callback: StateCallback) => {
    mocks.subscribers.push(callback);
    return () => {};
  },
}));

vi.mock('@/core/ui/confirm', () => ({ askConfirm: mocks.askConfirm }));

vi.mock('@/core/utils/browser', () => ({
  getVoyagerBuildTarget: mocks.buildTarget,
  supportsOptionalHostPermissions: mocks.optionalHosts,
}));

const t = (key: TranslationKey): string => key;
const SERVER_ID = 'abcdef0123456789';

const ON = { [CHATGPT_LOCAL_BRIDGE_PLUGIN_ID]: { enabled: true } };

/** Background answers keyed by message type; `status` is the `data` of `gv.bridge.status`. */
let status: Record<string, unknown> | null;
let replies: Record<string, unknown>;

let container: HTMLElement;
let root: Root;

async function flush(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(React.createElement(ChatGptBridgeCard, { t }));
  });
  await flush();
}

function card(): HTMLElement | null {
  return container.querySelector('[data-testid="chatgpt-bridge-card"]');
}

function buttonByText(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (element) => element.textContent === text,
  );
  if (!found) throw new Error(`Expected a "${text}" button.`);
  return found;
}

function typeInto(id: string, value: string): void {
  const input = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Expected #${id}.`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(text: string): Promise<void> {
  await act(async () => {
    buttonByText(text).click();
  });
  await flush();
}

function sentTypes(): string[] {
  return mocks.sendMessage.mock.calls.map(([message]) => (message as { type: string }).type);
}

function sent(type: string): unknown[] {
  return mocks.sendMessage.mock.calls
    .map(([message]) => message as { type: string })
    .filter((message) => message.type === type);
}

function callOrder(type: string): number {
  const index = mocks.sendMessage.mock.calls.findIndex(
    ([message]) => (message as { type: string }).type === type,
  );
  return mocks.sendMessage.mock.invocationCallOrder[index] ?? -1;
}

function pairedStatus(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    permission: true,
    paired: { serverId: SERVER_ID, port: 47321, pairedAt: 1 },
    server: 'online',
    policy: 'allowed',
    onlineUpdatesEnabled: true,
    ...overrides,
  };
}

const UNPAIRED = {
  permission: false,
  paired: null,
  server: 'unknown',
  policy: 'unknown',
  onlineUpdatesEnabled: true,
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.subscribers.length = 0;
  mocks.buildTarget.mockReturnValue('chrome');
  mocks.optionalHosts.mockReturnValue(true);
  mocks.loadPluginState.mockResolvedValue(ON);
  mocks.permissionRequest.mockResolvedValue(true);
  status = UNPAIRED;
  replies = {};
  mocks.sendMessage.mockImplementation(async (message: { type: string }) => {
    if (message.type === 'gv.bridge.status') return status ? { ok: true, data: status } : undefined;
    return replies[message.type] ?? { ok: true, data: {} };
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('ChatGptBridgeCard visibility', () => {
  it('stays hidden while the bridge builtin is off and appears once it is turned on', async () => {
    mocks.loadPluginState.mockResolvedValue({});
    await render();
    expect(card()).toBeNull();
    expect(sentTypes()).not.toContain('gv.bridge.status');

    await act(async () => {
      for (const notify of mocks.subscribers) notify(ON);
    });
    await flush();

    expect(card()).not.toBeNull();
    expect(sentTypes()).toContain('gv.bridge.status');
  });

  it('explains that Safari is not supported without asking the background', async () => {
    mocks.buildTarget.mockReturnValue('safari');
    await render();

    expect(card()?.textContent).toContain('bridgeUnsupportedSafari');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it('explains that Firefox before 128 cannot grant loopback access', async () => {
    mocks.optionalHosts.mockReturnValue(false);
    await render();

    expect(card()?.textContent).toContain('bridgeUnsupportedFirefox');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});

describe('ChatGptBridgeCard pairing', () => {
  it('sends the intent before asking for loopback access, then pairs after the grant', async () => {
    let grant: (granted: boolean) => void = () => {};
    mocks.permissionRequest.mockReturnValue(
      new Promise<boolean>((resolve) => {
        grant = resolve;
      }),
    );
    await render();
    typeInto('gv-bridge-code', '1234-5678');

    await act(async () => {
      buttonByText('bridgePair').click();
      // Within the click itself, before anything awaited: the gesture still holds.
      expect(sent('gv.bridge.pairIntent')).toHaveLength(1);
      expect(mocks.permissionRequest).toHaveBeenCalledOnce();
    });
    await flush();

    // The prompt is still open: the background already holds the intent, nothing paired yet.
    expect(sent('gv.bridge.pairIntent')).toEqual([
      { type: 'gv.bridge.pairIntent', port: 47321, code: '12345678' },
    ]);
    expect(mocks.permissionRequest).toHaveBeenCalledWith({ origins: ['http://127.0.0.1/*'] });
    expect(callOrder('gv.bridge.pairIntent')).toBeLessThan(
      mocks.permissionRequest.mock.invocationCallOrder[0],
    );
    expect(sent('gv.bridge.pair')).toEqual([]);

    status = pairedStatus();
    await act(async () => grant(true));
    await flush();

    expect(sent('gv.bridge.pair')).toEqual([
      { type: 'gv.bridge.pair', port: 47321, code: '12345678' },
    ]);
    expect(card()?.textContent).toContain('bridgeStatusConnected');
  });

  it('pairs on the port set under Advanced', async () => {
    await render();
    typeInto('gv-bridge-code', '12345678');
    await click('bridgeAdvanced');
    typeInto('gv-bridge-port', '50000');

    await click('bridgePair');

    expect(sent('gv.bridge.pair')).toEqual([
      { type: 'gv.bridge.pair', port: 50000, code: '12345678' },
    ]);
  });

  it('does not pair when loopback access is refused', async () => {
    mocks.permissionRequest.mockResolvedValue(false);
    await render();
    typeInto('gv-bridge-code', '12345678');

    await click('bridgePair');

    expect(sent('gv.bridge.pair')).toEqual([]);
    expect(card()?.textContent).toContain('bridgeErrorPermission');
  });

  it('rejects a malformed code before any prompt or message', async () => {
    await render();
    mocks.sendMessage.mockClear();
    typeInto('gv-bridge-code', '1234');

    await click('bridgePair');

    expect(mocks.permissionRequest).not.toHaveBeenCalled();
    expect(sent('gv.bridge.pairIntent')).toEqual([]);
    expect(card()?.textContent).toContain('bridgeErrorCode');
  });

  it('rejects a privileged port the background would refuse, before any prompt or message', async () => {
    await render();
    mocks.sendMessage.mockClear();
    typeInto('gv-bridge-code', '12345678');
    await click('bridgeAdvanced');
    typeInto('gv-bridge-port', '80');

    await click('bridgePair');

    expect(mocks.permissionRequest).not.toHaveBeenCalled();
    expect(sent('gv.bridge.pairIntent')).toEqual([]);
    expect(sent('gv.bridge.pair')).toEqual([]);
    expect(card()?.textContent).toContain('bridgeErrorPort');
  });

  it('tells the person to get a new code when the server refuses it', async () => {
    replies['gv.bridge.pair'] = {
      ok: false,
      error: { code: 'unauthorized', category: 'user-action', message: 'bad code' },
    };
    await render();
    typeInto('gv-bridge-code', '12345678');

    await click('bridgePair');

    expect(card()?.textContent).toContain('bridgeErrorRejected');
  });

  it('names the side to upgrade on a protocol mismatch', async () => {
    replies['gv.bridge.pair'] = {
      ok: false,
      error: {
        code: 'protocol-mismatch',
        category: 'data',
        message: 'mismatch',
        details: { upgrade: 'cli' },
      },
    };
    await render();
    typeInto('gv-bridge-code', '12345678');

    await click('bridgePair');

    expect(card()?.textContent).toContain('bridgeErrorUpgradeCli');
  });

  it('shows a pairing failure the background kept while the popup was closed', async () => {
    status = { ...UNPAIRED, lastError: { code: 'server-unreachable' } };
    await render();

    expect(card()?.textContent).toContain('bridgeErrorUnreachable');
  });
});

describe('ChatGptBridgeCard paired status', () => {
  it('shows the connected server by the start of its id', async () => {
    status = pairedStatus({ activeTask: { jobId: 'job-1234567890', op: 'turns.waitReply' } });
    await render();

    expect(card()?.textContent).toContain('bridgeStatusConnected');
    expect(card()?.textContent).not.toContain('bridgeCodeLabel');
    expect(card()?.textContent).toContain('bridgeActiveTask');
  });

  it('asks the person to start the server when it stopped answering', async () => {
    status = pairedStatus({ server: 'offline' });
    await render();

    expect(card()?.textContent).toContain('bridgeStatusOffline');
  });

  it('asks again for loopback access the pairing lost', async () => {
    status = pairedStatus({ permission: false });
    await render();
    expect(card()?.textContent).toContain('bridgeNeedsAccess');

    await click('bridgeAllowAccess');

    expect(mocks.permissionRequest).toHaveBeenCalledWith({ origins: ['http://127.0.0.1/*'] });
  });

  it('says the bridge is switched off remotely when policy denies it', async () => {
    status = pairedStatus({ policy: 'denied' });
    await render();

    expect(card()?.textContent).toContain('bridgePolicyDenied');
    expect(() => buttonByText('bridgeTurnOnUpdates')).toThrow();
  });

  it('offers to turn online updates on when stale rules cannot refresh', async () => {
    status = pairedStatus({ policy: 'stale', onlineUpdatesEnabled: false });
    await render();
    expect(card()?.textContent).toContain('bridgePolicyNeedsUpdates');

    await click('bridgeTurnOnUpdates');

    expect(sent('gv.bridge.enableRefresh')).toEqual([{ type: 'gv.bridge.enableRefresh' }]);
  });

  it('keeps the pairing when the unpair confirm is cancelled', async () => {
    status = pairedStatus();
    mocks.askConfirm.mockResolvedValue(null);
    await render();

    await click('bridgeUnpair');

    expect(mocks.askConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ tone: 'danger', message: 'bridgeUnpairConfirm' }),
    );
    expect(sent('gv.bridge.unpair')).toEqual([]);
  });

  it('unpairs after the person confirms', async () => {
    status = pairedStatus();
    mocks.askConfirm.mockResolvedValue('unpair');
    await render();

    status = UNPAIRED;
    await click('bridgeUnpair');

    expect(sent('gv.bridge.unpair')).toEqual([{ type: 'gv.bridge.unpair' }]);
    expect(card()?.textContent).toContain('bridgeCodeLabel');
  });
});
