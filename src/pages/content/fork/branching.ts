import type { ForkNode } from './forkTypes';
import { normalizeTurnId } from './turnId';

export interface ForkPlan {
  forkGroupId: string;
  sourceForkIndex: number;
  nextForkIndex: number;
}

export function resolveForkPlan(
  conversationId: string,
  turnId: string,
  conversationNodes: ForkNode[],
  groups: Record<string, ForkNode[]>,
  createForkGroupId: () => string,
): ForkPlan {
  const normalizedTurnId = normalizeTurnId(turnId);
  const sameTurnNodes = conversationNodes.filter(
    (node) => normalizeTurnId(node.turnId) === normalizedTurnId,
  );

  if (sameTurnNodes.length === 0) {
    return {
      forkGroupId: createForkGroupId(),
      sourceForkIndex: 0,
      nextForkIndex: 1,
    };
  }

  const groupIds = Array.from(new Set(sameTurnNodes.map((node) => node.forkGroupId)));
  let bestGroupId = groupIds[0];
  let bestGroupNodes = groups[bestGroupId] || [];

  for (const groupId of groupIds) {
    const groupNodes = groups[groupId] || [];
    if (groupNodes.length > bestGroupNodes.length) {
      bestGroupId = groupId;
      bestGroupNodes = groupNodes;
    }
  }

  const sourceNode = bestGroupNodes.find(
    (node) =>
      node.conversationId === conversationId && normalizeTurnId(node.turnId) === normalizedTurnId,
  );
  const maxForkIndex = bestGroupNodes.reduce((max, node) => Math.max(max, node.forkIndex), 0);

  return {
    forkGroupId: bestGroupId,
    sourceForkIndex: sourceNode?.forkIndex ?? 0,
    nextForkIndex: maxForkIndex + 1,
  };
}

export function buildBranchDisplayNodes(groupNodesList: ForkNode[][]): ForkNode[] {
  const dedupedByConversation = new Map<string, ForkNode>();

  for (const node of groupNodesList.flat()) {
    const existing = dedupedByConversation.get(node.conversationId);
    if (!existing) {
      dedupedByConversation.set(node.conversationId, node);
      continue;
    }

    if (node.forkIndex < existing.forkIndex) {
      dedupedByConversation.set(node.conversationId, node);
      continue;
    }

    if (node.forkIndex === existing.forkIndex && node.createdAt < existing.createdAt) {
      dedupedByConversation.set(node.conversationId, node);
    }
  }

  return Array.from(dedupedByConversation.values()).sort((a, b) => {
    if (a.forkIndex !== b.forkIndex) return a.forkIndex - b.forkIndex;
    return a.createdAt - b.createdAt;
  });
}
