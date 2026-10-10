import { StorageKeys } from '@/core/types/common';
import type { ForkNode, ForkNodesData } from '@/pages/content/fork/forkTypes';

interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function isForkNodesData(value: unknown): value is ForkNodesData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as { nodes?: unknown; groups?: unknown };
  return (
    typeof data.nodes === 'object' &&
    data.nodes !== null &&
    typeof data.groups === 'object' &&
    data.groups !== null
  );
}

function isForkNode(value: unknown): value is ForkNode {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Record<string, unknown>;
  return (
    typeof node.turnId === 'string' &&
    typeof node.conversationId === 'string' &&
    typeof node.conversationUrl === 'string' &&
    typeof node.forkGroupId === 'string' &&
    typeof node.forkIndex === 'number' &&
    typeof node.createdAt === 'number'
  );
}

/** Add `node` and its group index entry unless the same fork is already recorded. */
function insertForkNode(data: ForkNodesData, node: ForkNode): boolean {
  const nodes = (data.nodes[node.conversationId] ??= []);
  if (nodes.some((n) => n.turnId === node.turnId && n.forkGroupId === node.forkGroupId)) {
    return false;
  }
  nodes.push(node);
  const group = (data.groups[node.forkGroupId] ??= []);
  const groupKey = `${node.conversationId}:${node.turnId}`;
  if (!group.includes(groupKey)) group.push(groupKey);
  return true;
}

class ForkNodesManager {
  private operationQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly area: StorageArea) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const promise = this.operationQueue.then(operation, operation);
    this.operationQueue = promise.catch(() => {});
    return promise;
  }

  // Writes read strictly: saving over an empty read-error fallback would erase the stored forks.
  private async readStored(): Promise<ForkNodesData> {
    const result = await this.area.get([StorageKeys.FORK_NODES]);
    const forkNodes = result[StorageKeys.FORK_NODES];
    return isForkNodesData(forkNodes) ? forkNodes : { nodes: {}, groups: {} };
  }

  private async getFromStorage(): Promise<ForkNodesData> {
    try {
      return await this.readStored();
    } catch (error) {
      console.error('[Background] Failed to get fork nodes:', error);
      return { nodes: {}, groups: {} };
    }
  }

  private async saveToStorage(data: ForkNodesData): Promise<void> {
    await this.area.set({ [StorageKeys.FORK_NODES]: data });
  }

  async addForkNode(node: ForkNode): Promise<boolean> {
    return this.serialize(async () => {
      const data = await this.readStored();
      if (!insertForkNode(data, node)) return false;
      await this.saveToStorage(data);
      return true;
    });
  }

  /** Add the forks from a Drive envelope; restores never remove local forks. */
  async mergeCloud(envelope: unknown): Promise<{ status: 'absent' | 'merged' }> {
    return this.serialize(async () => {
      if (envelope === null || typeof envelope !== 'object') return { status: 'absent' };
      const cloud = 'data' in envelope ? envelope.data : undefined;
      if (
        ('format' in envelope && envelope.format !== 'gemini-voyager.forks.v1') ||
        !isForkNodesData(cloud)
      ) {
        throw new Error('Invalid fork nodes envelope');
      }
      const data = await this.readStored();
      let changed = false;
      for (const nodes of Object.values(cloud.nodes)) {
        if (!Array.isArray(nodes)) continue;
        for (const node of nodes) {
          if (isForkNode(node) && insertForkNode(data, node)) changed = true;
        }
      }
      if (changed) await this.saveToStorage(data);
      return { status: 'merged' };
    });
  }

  async removeForkNode(
    conversationId: string,
    turnId: string,
    forkGroupId: string,
  ): Promise<boolean> {
    return this.serialize(async () => {
      const data = await this.readStored();

      if (data.nodes[conversationId]) {
        const initialLength = data.nodes[conversationId].length;
        data.nodes[conversationId] = data.nodes[conversationId].filter(
          (n) => !(n.turnId === turnId && n.forkGroupId === forkGroupId),
        );

        if (data.nodes[conversationId].length < initialLength) {
          if (data.nodes[conversationId].length === 0) {
            delete data.nodes[conversationId];
          }

          // Update group index
          if (data.groups[forkGroupId]) {
            const groupKey = `${conversationId}:${turnId}`;
            data.groups[forkGroupId] = data.groups[forkGroupId].filter((k) => k !== groupKey);
            if (data.groups[forkGroupId].length === 0) {
              delete data.groups[forkGroupId];
            }
          }

          await this.saveToStorage(data);
          return true;
        }
      }
      return false;
    });
  }

  async getAllForkNodes(): Promise<ForkNodesData> {
    return this.getFromStorage();
  }

  async getForConversation(conversationId: string): Promise<ForkNode[]> {
    const data = await this.getFromStorage();
    return data.nodes[conversationId] || [];
  }

  async getGroup(forkGroupId: string): Promise<ForkNode[]> {
    const data = await this.getFromStorage();
    const groupKeys = data.groups[forkGroupId] || [];
    const nodes: ForkNode[] = [];

    for (const key of groupKeys) {
      const [convId, turnId] = key.split(':');
      const convNodes = data.nodes[convId] || [];
      const match = convNodes.find((n) => n.turnId === turnId && n.forkGroupId === forkGroupId);
      if (match) nodes.push(match);
    }

    return nodes.sort((a, b) => a.forkIndex - b.forkIndex);
  }
}

type ForkMessageRequest =
  | { type: 'gv.fork.add'; payload: ForkNode }
  | { type: 'gv.fork.remove'; payload: Pick<ForkNode, 'conversationId' | 'turnId' | 'forkGroupId'> }
  | { type: 'gv.fork.getAll' }
  | { type: 'gv.fork.mergeCloud'; payload: unknown }
  | { type: 'gv.fork.getForConversation'; payload: Pick<ForkNode, 'conversationId'> }
  | { type: 'gv.fork.getGroup'; payload: Pick<ForkNode, 'forkGroupId'> };

export interface ForkMessagesOwner {
  handle(message: unknown): Promise<Record<string, unknown>> | null;
  getAllForkNodes(): Promise<ForkNodesData>;
}

/** Owns fork records and their group index in one serialized queue. */
export function createForkMessagesOwner(area: StorageArea): ForkMessagesOwner {
  const manager = new ForkNodesManager(area);
  return {
    getAllForkNodes: () => manager.getAllForkNodes(),
    handle(message) {
      const request = message as ForkMessageRequest | null;
      switch (request?.type) {
        case 'gv.fork.add':
          return manager.addForkNode(request.payload).then((added) => ({ ok: true, added }));
        case 'gv.fork.remove':
          return manager
            .removeForkNode(
              request.payload.conversationId,
              request.payload.turnId,
              request.payload.forkGroupId,
            )
            .then((removed) => ({ ok: true, removed }));
        case 'gv.fork.getAll':
          return manager.getAllForkNodes().then((data) => ({ ok: true, data }));
        case 'gv.fork.mergeCloud':
          return manager.mergeCloud(request.payload).then((result) => ({ ok: true, ...result }));
        case 'gv.fork.getForConversation':
          return manager
            .getForConversation(request.payload.conversationId)
            .then((nodes) => ({ ok: true, nodes }));
        case 'gv.fork.getGroup':
          return manager
            .getGroup(request.payload.forkGroupId)
            .then((nodes) => ({ ok: true, nodes }));
        default:
          return null;
      }
    },
  };
}
