import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';

import type { FolderAuthority } from '../authority';
import type { FolderOpBody, StoredOutcome } from '../folderOps';
import {
  type FolderOwnerCore,
  type FolderOwnerCoreOptions,
  MAX_BATCH_OPS,
  createFolderOwnerCore,
} from '../folderOwnerCore';
import type { ApplyReply } from '../folderOwnerMessages';
import type { FolderSite } from '../folderOwnerPolicy';
import { type FolderOwnerMeta, ownerMetaKey, pendingOpKey } from '../folderOwnerState';
import type { FaultyStorage } from './faultyStorage';

export const KEY = 'gvFolderData';

export function folder(id: string, name = id, extra: Partial<Folder> = {}): Folder {
  return {
    id,
    name,
    parentId: null,
    isExpanded: true,
    sortIndex: 0,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

export function conversation(
  conversationId: string,
  extra: Partial<ConversationReference> = {},
): ConversationReference {
  return {
    conversationId,
    title: conversationId,
    url: `https://gemini.google.com/app/${conversationId}`,
    addedAt: 1,
    ...extra,
  };
}

export function folderData(
  folders: Folder[],
  contents: Record<string, ConversationReference[]> = {},
): FolderData {
  return {
    folders,
    folderContents: Object.fromEntries(folders.map((f) => [f.id, contents[f.id] ?? []])),
  };
}

export const rename = (folderId: string, name: string): FolderOpBody => ({
  kind: 'renameFolder',
  folderId,
  name,
});

/** A controllable clock and deterministic ids shared by every process of one test. */
/** Every site owned: the build the core harness tests unless a test says otherwise. */
export const ALL_OWNER: Readonly<Record<FolderSite, FolderAuthority>> = {
  gemini: 'owner',
  aistudio: 'owner',
  chatgpt: 'owner',
};

export function createWorld(
  storage: FaultyStorage,
  start = 1_000_000,
  authority: Readonly<Record<FolderSite, FolderAuthority>> = ALL_OWNER,
  extra: Partial<FolderOwnerCoreOptions> = {},
) {
  let time = start;
  let ids = 0;
  const world = {
    storage,
    now: () => time,
    advance: (ms: number) => void (time += ms),
    /** A fresh owner process over the same storage: nothing survives but storage. */
    process: (): FolderOwnerCore =>
      createFolderOwnerCore({
        area: storage.area,
        authority,
        now: world.now,
        newId: () => `id-${++ids}`,
        ...extra,
      }),
  };
  return world;
}

export type World = ReturnType<typeof createWorld>;

/** A tab client reduced to what the owner sees: registration, pending keys and requests. */
export class TestClient {
  epoch = '';
  nextSeq = 1;
  readonly bodies = new Map<number, FolderOpBody>();

  constructor(
    private readonly world: World,
    readonly clientId: string,
    readonly key = KEY,
  ) {}

  async open(owner: FolderOwnerCore, ackedThrough = 0) {
    const reply = await owner.open({ key: this.key, clientId: this.clientId, ackedThrough });
    if ('epoch' in reply) this.epoch = reply.epoch;
    return reply;
  }

  /** Accepts ops: one pending key per `set`, in seq order (addendum P0 §1). */
  accept(...bodies: FolderOpBody[]): number[] {
    return bodies.map((body) => {
      const seq = this.nextSeq++;
      this.bodies.set(seq, body);
      this.world.storage.write(pendingOpKey(this.clientId, seq), {
        v: 1,
        key: this.key,
        epoch: this.epoch,
        clientId: this.clientId,
        seq,
        at: this.world.now(),
        op: body,
      });
      return seq;
    });
  }

  send(owner: FolderOwnerCore, seqs: number[], ackedThrough = 0): Promise<ApplyReply> {
    return owner.apply({
      key: this.key,
      clientId: this.clientId,
      epoch: this.epoch,
      ops: seqs.map((seq) => ({ seq, body: this.bodies.get(seq) })),
      ackedThrough,
    });
  }

  /** Highest seq whose outcome this client has seen. */
  acked = 0;
  readonly outcomes = new Map<number, StoredOutcome>();

  /** Sends every accepted op it has no outcome for yet, as a tab does after any wake-up. */
  async flush(owner: FolderOwnerCore): Promise<ApplyReply | null> {
    const last = Math.min(this.nextSeq - 1, this.acked + MAX_BATCH_OPS);
    if (last <= this.acked) return null;
    const reply = await this.send(owner, range(this.acked + 1, last), this.acked);
    if (reply.kind === 'ok') {
      for (const [seq, outcome] of Object.entries(reply.outcomes)) {
        this.outcomes.set(Number(seq), outcome);
      }
      this.acked = last;
    }
    return reply;
  }
}

export const storedMeta = (storage: FaultyStorage, key = KEY): FolderOwnerMeta =>
  storage.read(ownerMetaKey(key)) as FolderOwnerMeta;

export const storedData = (storage: FaultyStorage, key = KEY): FolderData =>
  storage.read(key) as FolderData;

export const pendingKeys = (storage: FaultyStorage): string[] =>
  storage.keys().filter((key) => key.startsWith('gvFolderOwner:pending:'));

export const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);
