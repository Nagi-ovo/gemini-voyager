/**
 * Pairing with `voyager serve` (spec §2.3). The popup sends its intent
 * (`gv.bridge.pairIntent`) before it asks for the 127.0.0.1 permission,
 * because the permission prompt can close the popup: the background then
 * finishes the pairing when the permission arrives (`permissions.onAdded`), or
 * at once when it was already granted.
 *
 * The token is stored in `chrome.storage.local` only (never sync, never a
 * backup) and read only here and by the background's HTTP calls. v1 pairs one
 * server with one browser profile; a new pairing replaces the old one.
 */
import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import { EXTENSION_VERSION } from '@/core/utils/version';
import {
  type BridgeBrowser,
  type BridgeError,
  type ErrorCode,
  bridgeError,
  PAIRING_TOKEN_PATTERN,
  PROTOCOL,
  negotiateProtocol,
  normalizePairingCode,
} from '@/features/bridge/protocol';

import { type BridgeClient, isValidBridgePort } from './bridgeClient';
import { BRIDGE_SESSION_KEYS, type StorageAreaLike } from './bridgeTaskStore';

export interface BridgePairingRecord {
  readonly serverId: string;
  readonly port: number;
  readonly token: string;
  readonly pairedAt: number;
  readonly protocol: number;
}

export type PairingAttempt =
  | { readonly state: 'idle' }
  | { readonly state: 'pending'; readonly at: number }
  | { readonly state: 'paired'; readonly at: number }
  | { readonly state: 'failed'; readonly at: number; readonly error: BridgeError };

export const PAIR_INTENT_TTL_MS = 5 * 60 * 1000;
/** Same shape as the protocol's ids, which the server id also is. */
const SERVER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

interface PairIntent {
  readonly port: number;
  readonly code: string;
  readonly at: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePairing(raw: unknown): BridgePairingRecord | null {
  if (!isRecord(raw)) return null;
  const { serverId, port, token, pairedAt, protocol } = raw;
  if (typeof serverId !== 'string' || !SERVER_ID_PATTERN.test(serverId)) return null;
  if (!isValidBridgePort(port)) return null;
  if (typeof token !== 'string' || !PAIRING_TOKEN_PATTERN.test(token)) return null;
  if (typeof pairedAt !== 'number' || !Number.isFinite(pairedAt)) return null;
  const agreed =
    typeof protocol === 'number' && protocol >= PROTOCOL.min && protocol <= PROTOCOL.max
      ? protocol
      : PROTOCOL.max;
  return { serverId, port, token, pairedAt, protocol: agreed };
}

function parseIntent(raw: unknown): PairIntent | null {
  if (!isRecord(raw)) return null;
  const { port, code, at } = raw;
  if (!isValidBridgePort(port) || typeof code !== 'string' || typeof at !== 'number') return null;
  const normalized = normalizePairingCode(code);
  return normalized ? { port, code: normalized, at } : null;
}

export interface BridgePairingDeps {
  readonly local: StorageAreaLike;
  readonly session: StorageAreaLike;
  readonly client: BridgeClient;
  readonly browser: BridgeBrowser;
  readonly hasLoopbackPermission: () => Promise<boolean>;
  /** After a pairing is stored: refresh the policy and start polling. */
  readonly onPaired: () => void;
  readonly now?: () => number;
}

export interface BridgePairing {
  load(): Promise<BridgePairingRecord | null>;
  /** Store the popup's intent; pair now when the permission is already there. */
  recordIntent(input: { port: unknown; code: unknown }): Promise<PairingAttempt>;
  /** `permissions.onAdded`: finish a pending, unexpired intent. */
  completeIntent(): Promise<PairingAttempt>;
  /**
   * Pair with `code`. A code is used once: asking again with the code an
   * intent already used (the popup's `pair` after `permissions.onAdded` did
   * the work) returns that attempt's outcome instead of a second request.
   */
  pair(input: { port: unknown; code: unknown }): Promise<PairingAttempt>;
  /** Forget the pairing here, and tell the server when it is reachable. */
  unpair(): Promise<void>;
  /** The server dropped this pairing: forget it without calling back. */
  forget(): Promise<void>;
  lastAttempt(): PairingAttempt;
}

const USED_CODE_MEMORY = 8;

export function createBridgePairing(deps: BridgePairingDeps): BridgePairing {
  const now = deps.now ?? (() => Date.now());
  const INTENT = BRIDGE_SESSION_KEYS.pairIntent;
  let attempt: PairingAttempt = { state: 'idle' };
  /** Recent codes and the attempt each started, keyed `port:code`. */
  const used = new Map<string, Promise<PairingAttempt>>();

  const fail = (
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): PairingAttempt => {
    attempt = { state: 'failed', at: now(), error: bridgeError(code, message, details) };
    return attempt;
  };

  const load = async (): Promise<BridgePairingRecord | null> =>
    parsePairing((await deps.local.get(StorageKeys.BRIDGE_PAIRING))[StorageKeys.BRIDGE_PAIRING]);

  const run = async (port: number, code: string): Promise<PairingAttempt> => {
    attempt = { state: 'pending', at: now() };
    if (!(await deps.hasLoopbackPermission())) {
      return fail('permission-missing', 'Allow access to 127.0.0.1 to pair.');
    }
    const hello = await deps.client.hello(port);
    if (!hello.ok) return fail(hello.error.code, hello.error.message, hello.error.details);
    const negotiation = negotiateProtocol({ extension: PROTOCOL, cli: hello.data.protocol });
    if (!negotiation.ok) {
      return fail(
        'protocol-mismatch',
        `Update ${negotiation.upgrade === 'extension' ? 'Voyager' : 'voyager-cli'}.`,
        {
          upgrade: negotiation.upgrade,
        },
      );
    }
    const connection = { port, protocol: negotiation.selected };
    const paired = await deps.client.pair(connection, {
      code,
      browser: deps.browser,
      extensionVersion: EXTENSION_VERSION,
    });
    if (!paired.ok) return fail(paired.error.code, paired.error.message, paired.error.details);
    const record: BridgePairingRecord = {
      serverId: paired.data.serverId,
      port,
      token: paired.data.token,
      pairedAt: now(),
      protocol: negotiation.selected,
    };
    await deps.local.set({ [StorageKeys.BRIDGE_PAIRING]: record });
    attempt = { state: 'paired', at: record.pairedAt };
    logger.info('Local bridge paired', { serverId: record.serverId, port });
    deps.onPaired();
    return attempt;
  };

  const readInput = (input: {
    port: unknown;
    code: unknown;
  }): { error: PairingAttempt } | { port: number; code: string } => {
    const code = typeof input.code === 'string' ? normalizePairingCode(input.code) : undefined;
    if (!isValidBridgePort(input.port)) return { error: fail('bad-request', 'Invalid port.') };
    if (!code) return { error: fail('bad-request', 'The pairing code has eight digits.') };
    return { port: input.port, code };
  };

  const pair = async (input: { port: unknown; code: unknown }): Promise<PairingAttempt> => {
    const read = readInput(input);
    if ('error' in read) return read.error;
    const key = `${read.port}:${read.code}`;
    const earlier = used.get(key);
    if (earlier) return earlier;
    // Registered before the first await: a concurrent caller with this code must find it.
    const started = (async () => {
      // Whoever pairs first consumes the intent, so a later grant cannot replay it.
      await deps.session.remove(INTENT);
      return run(read.port, read.code);
    })()
      .catch((error: unknown) => fail('server-unreachable', String(error)))
      .then((outcome) => {
        // A failed try must not hold the code: otherwise clicking Pair again
        // answers with the old failure and never reaches the server.
        if (outcome.state === 'failed') used.delete(key);
        return outcome;
      });
    used.set(key, started);
    while (used.size > USED_CODE_MEMORY) used.delete(used.keys().next().value as string);
    return started;
  };

  const completeIntent = async (): Promise<PairingAttempt> => {
    const intent = parseIntent((await deps.session.get(INTENT))[INTENT]);
    if (!intent) return attempt;
    const age = now() - intent.at;
    if (age < 0 || age > PAIR_INTENT_TTL_MS) {
      await deps.session.remove(INTENT);
      return attempt;
    }
    return pair({ port: intent.port, code: intent.code });
  };

  return {
    load,
    recordIntent: async (input) => {
      const read = readInput(input);
      if ('error' in read) return read.error;
      await deps.session.set({ [INTENT]: { port: read.port, code: read.code, at: now() } });
      attempt = { state: 'pending', at: now() };
      if (await deps.hasLoopbackPermission()) void completeIntent();
      return attempt;
    },
    completeIntent,
    pair,
    unpair: async () => {
      const record = await load();
      if (record) {
        const reply = await deps.client.unpair(record).catch(() => null);
        if (!reply?.ok) logger.info('Local bridge unpaired while the server was unreachable');
      }
      await deps.local.remove(StorageKeys.BRIDGE_PAIRING);
      attempt = { state: 'idle' };
    },
    forget: async () => {
      await deps.local.remove(StorageKeys.BRIDGE_PAIRING);
      attempt = { state: 'idle' };
    },
    lastAttempt: () => attempt,
  };
}
