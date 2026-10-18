// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/c/conv-1" }
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CONTENT_SOURCE, OBSERVER_SOURCE } from './protocol';

const observerScript = readFileSync(
  resolve(process.cwd(), 'public/chatgpt-pro-usage-observer.js'),
  'utf-8',
);

type ObserverWindow = Window & typeof globalThis & { __gvChatGptProUsageObserver?: boolean };

let posted: Array<{ type: string; payload?: Record<string, unknown> }> = [];
let pageFetch: Mock;
const realFetch = window.fetch;

function onMessage(event: MessageEvent): void {
  const data = event.data as { source?: string; type: string; payload?: Record<string, unknown> };
  if (data?.source === OBSERVER_SOURCE) posted.push({ type: data.type, payload: data.payload });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0));
}

/** jsdom's postMessage sets neither `source` nor `origin`; a browser sets both. */
function postLikeABrowser(): void {
  vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
    setTimeout(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data, source: window, origin: location.origin }),
      );
    }, 0);
  });
}

function install(): void {
  // oxlint-disable-next-line no-eval -- evaluating the page script under test is what this suite exercises
  (0, eval)(observerScript);
}

async function arm(): Promise<void> {
  window.postMessage({ source: CONTENT_SOURCE, type: 'arm' }, location.origin);
  await settle();
  posted = [];
}

function sendBody(model: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    action: 'next',
    model,
    conversation_id: 'conv-1',
    messages: [{ id: 'm-1', content: { parts: ['hi'] } }],
    ...extra,
  });
}

describe('chatgpt-pro-usage-observer', () => {
  beforeEach(() => {
    delete (window as ObserverWindow).__gvChatGptProUsageObserver;
    posted = [];
    pageFetch = vi.fn(async () => new Response('{}', { status: 200 }));
    window.fetch = pageFetch as unknown as typeof fetch;
    postLikeABrowser();
    window.addEventListener('message', onMessage);
    install();
  });

  afterEach(() => {
    window.removeEventListener('message', onMessage);
    window.postMessage({ source: CONTENT_SOURCE, type: 'disarm' }, location.origin);
    window.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('reports a 2xx conversation POST with its model and a turn key', async () => {
    await arm();
    const init = { method: 'POST', body: sendBody('gpt-6-pro') };
    const response = await window.fetch('/backend-api/f/conversation', init);
    await settle();

    expect(pageFetch).toHaveBeenCalledWith('/backend-api/f/conversation', init);
    expect(response.status).toBe(200);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: 'send', payload: { model: 'gpt-6-pro', mode: null } });
    expect(posted[0].payload?.key).toMatch(/^[0-9a-f]{8}$/);
  });

  it('leaves the send response unread for the page', async () => {
    await arm();
    const response = await window.fetch('/backend-api/f/conversation', {
      method: 'POST',
      body: sendBody('gpt-6-pro'),
    });
    await settle();
    expect(posted[0]?.type).toBe('send');
    expect(response.bodyUsed).toBe(false);
  });

  it('reports the hashed account header and carries it on later sends without one', async () => {
    await arm();
    await window.fetch('/backend-api/me', { headers: { 'chatgpt-account-id': 'acct-1' } });
    await window.fetch('/backend-api/f/conversation', {
      method: 'POST',
      body: sendBody('gpt-6-pro'),
    });
    await settle();

    const account = posted[0]?.payload?.account;
    expect(posted[0]?.type).toBe('account');
    expect(account).toMatch(/^[0-9a-f]{8}$/);
    expect(account).not.toContain('acct-1');
    expect(posted[1]).toMatchObject({ type: 'send', payload: { account } });
  });

  it('reports a new account when the header changes, read from a Request too', async () => {
    await arm();
    await window.fetch('/backend-api/me', { headers: { 'chatgpt-account-id': 'acct-1' } });
    await window.fetch('/backend-api/me', { headers: { 'chatgpt-account-id': 'acct-1' } });
    await window.fetch(
      new Request('https://chatgpt.com/backend-api/me', {
        headers: { 'chatgpt-account-id': 'acct-2' },
      }),
    );
    await settle();

    const accounts = posted.filter((entry) => entry.type === 'account');
    expect(accounts).toHaveLength(2);
    expect(accounts[0].payload?.account).not.toBe(accounts[1].payload?.account);
  });

  const checkBody = {
    accounts: {
      'acct-1': {
        account: {
          account_id: 'acct-1',
          plan_type: 'prolite',
          plan_display_name: 'Pro',
          email: 'jesse@example.com',
          name: 'Jesse',
        },
        entitlement: { subscription_plan: 'chatgptprolite', expires_at: '2026-11-01T00:00:00Z' },
      },
    },
  };
  const checkUrl = '/backend-api/accounts/check/v4-2023-04-27';
  const accountHeader = { headers: { 'chatgpt-account-id': 'acct-1' } };

  it("reports only the plan type and subscription of the page's account", async () => {
    await arm();
    pageFetch.mockResolvedValueOnce(new Response(JSON.stringify(checkBody), { status: 200 }));
    const response = await window.fetch(checkUrl, accountHeader);
    await settle();

    const plans = posted.filter((entry) => entry.type === 'plan');
    expect(plans).toHaveLength(1);
    expect(Object.keys(plans[0].payload ?? {}).sort()).toEqual([
      'account',
      'planType',
      'subscriptionPlan',
    ]);
    expect(plans[0].payload).toMatchObject({
      planType: 'prolite',
      subscriptionPlan: 'chatgptprolite',
    });
    const everything = JSON.stringify(posted);
    for (const secret of ['jesse@example.com', 'Jesse', 'acct-1', '2026-11-01']) {
      expect(everything).not.toContain(secret);
    }
    expect(await response.json()).toEqual(checkBody);
  });

  it('remembers the plan check the page makes before it is armed, and reports it on arm', async () => {
    const proBody = JSON.parse(JSON.stringify(checkBody));
    proBody.accounts['acct-1'].account.plan_type = 'pro';
    pageFetch.mockResolvedValueOnce(new Response(JSON.stringify(proBody), { status: 200 }));
    await window.fetch(checkUrl, accountHeader);
    await settle();
    expect(posted.filter((entry) => entry.type === 'plan')).toEqual([]);

    window.postMessage({ source: CONTENT_SOURCE, type: 'arm' }, location.origin);
    await settle();
    // Observers installed by earlier cases answer the arm too; this page's plan is the `pro` one.
    expect(
      posted.filter((entry) => entry.type === 'plan' && entry.payload?.planType === 'pro'),
    ).toHaveLength(1);
  });

  it('gives the same turn the same key on both conversation endpoints', async () => {
    await arm();
    await window.fetch('/backend-api/f/conversation', { method: 'POST', body: sendBody('x') });
    await window.fetch('https://chatgpt.com/backend-api/conversation', {
      method: 'POST',
      body: sendBody('x'),
    });
    await settle();
    expect(posted).toHaveLength(2);
    expect(posted[0].payload?.key).toBe(posted[1].payload?.key);
  });

  it('reads the body of a Request object without consuming it', async () => {
    await arm();
    const request = new Request('https://chatgpt.com/backend-api/f/conversation', {
      method: 'POST',
      body: sendBody('gpt-6-pro'),
    });
    await window.fetch(request);
    await settle();
    expect(posted[0]).toMatchObject({ type: 'send', payload: { model: 'gpt-6-pro' } });
    expect(request.bodyUsed).toBe(false);
  });

  it('does not report a rejected send', async () => {
    await arm();
    pageFetch.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    await window.fetch('/backend-api/f/conversation', {
      method: 'POST',
      body: sendBody('gpt-6-pro'),
    });
    await settle();
    expect(posted).toEqual([]);
  });

  it('ignores other endpoints, other methods and other origins', async () => {
    await arm();
    await window.fetch('/backend-api/f/conversation');
    await window.fetch('/backend-api/conversations', { method: 'POST', body: sendBody('p') });
    await window.fetch('https://evil.example/backend-api/f/conversation', {
      method: 'POST',
      body: sendBody('p'),
    });
    await settle();
    expect(posted).toEqual([]);
  });

  it('stays inert until the content script arms it, and after it disarms', async () => {
    const init = { method: 'POST', body: sendBody('gpt-6-pro') };
    await window.fetch('/backend-api/f/conversation', init);
    await settle();
    // Only the install-time ready, announcing itself to a content script that started first.
    expect(posted.map((entry) => entry.type)).toEqual(['ready']);

    await arm();
    window.postMessage({ source: CONTENT_SOURCE, type: 'disarm' }, location.origin);
    await settle();
    await window.fetch('/backend-api/f/conversation', init);
    await settle();
    expect(posted).toEqual([]);
    expect(pageFetch).toHaveBeenCalledTimes(2);
  });

  it('answers an arm with ready', async () => {
    window.postMessage({ source: CONTENT_SOURCE, type: 'arm' }, location.origin);
    await settle();
    expect(posted.map((entry) => entry.type)).toContain('ready');
  });

  it('reports the limit lists of a conversation/init response', async () => {
    await arm();
    const body = {
      model_limits: [{ model_slug: 'gpt-6-pro', resets_after: '2026-10-21T08:00:00Z' }],
      blocked_features: [{ name: 'reason', limit: 15 }],
      limits_progress: [{ feature_name: 'image_gen', remaining: 1000 }],
    };
    pageFetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
    const response = await window.fetch('/backend-api/conversation/init', {
      method: 'POST',
      body: '{}',
    });
    await settle();

    expect(await response.json()).toEqual(body);
    expect(posted).toEqual([
      {
        type: 'quota',
        payload: {
          account: null,
          model_limits: body.model_limits,
          blocked_features: body.blocked_features,
        },
      },
    ]);
  });

  it('stays quiet for an init response with empty limit lists', async () => {
    await arm();
    pageFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ model_limits: [], blocked_features: [] }), { status: 200 }),
    );
    await window.fetch('/backend-api/conversation/init', { method: 'POST', body: '{}' });
    await settle();
    expect(posted).toEqual([]);
  });

  it('passes a failing page fetch through unchanged', async () => {
    await arm();
    const failure = new TypeError('network down');
    pageFetch.mockRejectedValueOnce(failure);
    await expect(
      window.fetch('/backend-api/f/conversation', { method: 'POST', body: sendBody('p') }),
    ).rejects.toBe(failure);
    await settle();
    expect(posted).toEqual([]);
  });
});
