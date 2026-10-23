import { describe, expect, it } from 'vitest';

import {
  bridgeError,
  ERROR_CODES,
  isExtensionOrigin,
  MAX_BLOB_CHUNK_BASE64,
  MAX_INFLIGHT_TASKS,
  negotiateProtocol,
  normalizePairingCode,
  parseProtocolHeader,
  PROTOCOL,
  validateEnvelope,
  validateMessage,
  validateOpParams,
} from '../src';

describe('negotiateProtocol', () => {
  it('selects the highest version both sides support', () => {
    expect(negotiateProtocol({ extension: { min: 1, max: 3 }, cli: { min: 2, max: 5 } })).toEqual({
      ok: true,
      selected: 3,
    });
    expect(negotiateProtocol({ extension: PROTOCOL, cli: PROTOCOL })).toEqual({
      ok: true,
      selected: PROTOCOL.max,
    });
  });

  it('names the older side as the one to upgrade when the ranges do not meet', () => {
    expect(negotiateProtocol({ extension: { min: 1, max: 1 }, cli: { min: 2, max: 3 } })).toEqual({
      ok: false,
      upgrade: 'extension',
    });
    expect(negotiateProtocol({ extension: { min: 3, max: 4 }, cli: { min: 1, max: 2 } })).toEqual({
      ok: false,
      upgrade: 'cli',
    });
  });
});

describe('parseProtocolHeader', () => {
  it('reads a plain positive integer and treats anything else as absent', () => {
    expect(parseProtocolHeader('1')).toBe(1);
    expect(parseProtocolHeader(' 2 ')).toBe(2);
    for (const value of [null, undefined, '', '0', '01', '1.5', '-1', '1e3', 'v1']) {
      expect(parseProtocolHeader(value)).toBeUndefined();
    }
  });
});

describe('pairing input', () => {
  it('accepts the displayed form of a code and refuses anything but eight digits', () => {
    expect(normalizePairingCode('1234-5678')).toBe('12345678');
    expect(normalizePairingCode(' 1234 5678 ')).toBe('12345678');
    expect(normalizePairingCode('1234-567')).toBeUndefined();
    expect(normalizePairingCode('1234-567a')).toBeUndefined();
  });

  it('pairs only with extension origins', () => {
    expect(isExtensionOrigin(`chrome-extension://${'a'.repeat(32)}`)).toBe(true);
    expect(isExtensionOrigin('moz-extension://0b9e6a52-3c1d-4e8f-9a7b-1c2d3e4f5a6b')).toBe(true);
    expect(isExtensionOrigin('https://chatgpt.com')).toBe(false);
    expect(isExtensionOrigin(`chrome-extension://${'z'.repeat(32)}`)).toBe(false);
    expect(isExtensionOrigin(`chrome-extension://${'a'.repeat(32)}.evil.test`)).toBe(false);
  });
});

describe('validators', () => {
  it('takes a blob chunk of the full size without overflowing the stack', () => {
    const base64 = 'A'.repeat(MAX_BLOB_CHUNK_BASE64);
    expect(validateMessage('blobChunk', { blobId: 'b1', offset: 0, base64 }).ok).toBe(true);
    for (const bad of ['QUJD=', 'QU=JD', 'QUJD!']) {
      expect(validateMessage('blobChunk', { blobId: 'b1', offset: 0, base64: bad }).ok, bad).toBe(
        false,
      );
    }
  });

  it('accepts every error built by bridgeError', () => {
    for (const code of ERROR_CODES) {
      const result = validateMessage('bridgeError', bridgeError(code, 'm', { a: 1 }));
      expect(result.ok, code).toBe(true);
    }
  });

  it('keeps only known fields, so unknown keys never reach page code', () => {
    const result = validateOpParams('composer.send', { text: 'hi', submit: 'now' });
    expect(result).toEqual({ ok: true, value: { text: 'hi' } });
  });

  it('takes a poll that names an op it does not know, without that op', () => {
    const result = validateMessage('pollRequest', {
      capabilities: {
        ops: [
          { name: 'conversation.ready', v: 1 },
          { name: 'from.a.newer.extension', v: 1 },
        ],
      },
      inflight: [],
      policy: { revision: 1, state: 'allowed' },
    });
    expect(result.ok && result.value.capabilities.ops).toEqual([
      { name: 'conversation.ready', v: 1 },
    ]);
  });

  it('holds a poll to the tasks it can list, whatever maxTasks a newer extension offers', () => {
    const poll = (maxTasks: unknown) =>
      validateMessage('pollRequest', {
        capabilities: { ops: [] },
        inflight: [],
        policy: { revision: 1, state: 'allowed' },
        maxTasks,
      });
    const read = (maxTasks: unknown) => {
      const result = poll(maxTasks);
      return result.ok ? result.value.maxTasks : 'refused';
    };
    expect(read(4)).toBe(4);
    expect(read(64)).toBe(MAX_INFLIGHT_TASKS);
    expect(read(0)).toBe(1);
    expect(read('many')).toBe(1);
  });

  it('reports every issue of a message at once', () => {
    const result = validateMessage('pairRequest', { code: '1', browser: 'ie' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.path).sort()).toEqual([
      'browser',
      'code',
      'extensionVersion',
    ]);
  });

  it('narrows task params by op after validation', () => {
    const result = validateMessage('pollResponse', {
      kind: 'task',
      task: {
        taskId: 'T5',
        jobId: 'J1',
        op: 'turns.waitReply',
        opVersion: 1,
        params: { conversationId: 'abc', afterUserTurnKey: 't-7' },
        deadlineMs: 600_000,
        issuedAt: 0,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== 'task') return;
    const { task } = result.value;
    expect(task.op === 'turns.waitReply' && task.params.afterUserTurnKey).toBe('t-7');
  });

  it('lets the page click only the approval answers it knows', () => {
    const params = { conversationId: 'abc', afterUserTurnKey: 't-7' };
    expect(validateOpParams('turns.approve', { ...params, choice: 'always' }).ok).toBe(true);
    expect(validateOpParams('turns.approve', { ...params, choice: 'once' }).ok).toBe(true);
    expect(validateOpParams('turns.approve', { ...params, choice: 'deny' }).ok).toBe(false);
    expect(validateOpParams('turns.approve', params).ok).toBe(false);
  });

  it('checks the payload inside an envelope at its own path', () => {
    const ok = validateEnvelope(
      {
        ok: true,
        data: {
          serverId: 's',
          serverVersion: '0.1.0',
          protocol: { min: 1, max: 1, selected: 1 },
          paired: true,
        },
      },
      'helloResponse',
    );
    expect(ok.ok).toBe(true);

    const bad = validateEnvelope({ ok: true, data: { serverId: 's' } }, 'helloResponse');
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.issues.map((issue) => issue.path)).toContain('data.protocol');

    const err = validateEnvelope(
      { ok: false, error: bridgeError('busy', 'a job is running', { activeJobId: 'J1' }) },
      'helloResponse',
    );
    expect(err).toEqual({
      ok: true,
      value: {
        ok: false,
        error: {
          code: 'busy',
          category: 'transient',
          message: 'a job is running',
          details: { activeJobId: 'J1' },
        },
      },
    });
  });
});
