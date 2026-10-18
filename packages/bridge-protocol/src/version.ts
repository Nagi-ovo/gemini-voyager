/**
 * Protocol and op versions (spec §2.1). Both sides send their supported range
 * in `POST /v1/hello`; every later request carries the selected version in
 * `X-Voyager-Protocol`. Ops are versioned on their own, so one op can change
 * shape without a new protocol version.
 */
import type { OpName } from './ops';
import { PROJECT_OP_VERSIONS } from './projectOps';

export interface ProtocolRange {
  readonly min: number;
  readonly max: number;
}

export const PROTOCOL: ProtocolRange = { min: 1, max: 1 };

export const PROTOCOL_HEADER = 'X-Voyager-Protocol';

/** The version of each op this package describes. */
export const OP_VERSIONS: Readonly<Record<OpName, number>> = {
  'conversation.open': 1,
  'conversation.close': 1,
  'conversation.ready': 1,
  'model.inspect': 1,
  'model.select': 1,
  'composer.attach': 1,
  'composer.send': 1,
  'turns.waitReply': 1,
  'turns.read': 1,
  'files.download': 1,
  'catalog.refresh': 1,
  ...PROJECT_OP_VERSIONS,
};

/** Which side has to be upgraded when the ranges do not meet. */
export type UpgradeSide = 'extension' | 'cli';

export type Negotiation =
  | { readonly ok: true; readonly selected: number }
  | { readonly ok: false; readonly upgrade: UpgradeSide };

/**
 * Pick the highest version both sides support. When the ranges are disjoint,
 * the side whose newest version is older than the other's oldest is the one to
 * upgrade. Ranges must already be validated (`min <= max`, positive integers).
 */
export function negotiateProtocol(sides: {
  readonly extension: ProtocolRange;
  readonly cli: ProtocolRange;
}): Negotiation {
  const { extension, cli } = sides;
  if (extension.max < cli.min) return { ok: false, upgrade: 'extension' };
  if (cli.max < extension.min) return { ok: false, upgrade: 'cli' };
  return { ok: true, selected: Math.min(extension.max, cli.max) };
}

/** Read `X-Voyager-Protocol`; anything but a plain positive integer is absent. */
export function parseProtocolHeader(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || !/^[1-9][0-9]{0,5}$/.test(value.trim())) {
    return undefined;
  }
  return Number(value.trim());
}

export function supportsOpVersion(op: OpName, version: number): boolean {
  return OP_VERSIONS[op] === version;
}
