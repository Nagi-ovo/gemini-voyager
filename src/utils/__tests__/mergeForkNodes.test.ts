import { describe, expect, it } from 'vitest';

import type { ForkNode, ForkNodesData } from '@/pages/content/fork/forkTypes';

import { mergeForkNodes } from '../merge';

function createForkNode(overrides: Partial<ForkNode> = {}): ForkNode {
  return {
    turnId: 'u-0',
    conversationId: 'conv1',
    conversationUrl: 'https://gemini.google.com/app/conv1',
    conversationTitle: 'Test Conversation',
    forkGroupId: 'fork-group-1',
    forkIndex: 0,
    createdAt: 1000,
    ...overrides,
  };
}

function createForkData(
  nodes: Record<string, ForkNode[]>,
  groups?: Record<string, string[]>,
): ForkNodesData {
  // Auto-build groups from nodes if not provided
  if (!groups) {
    groups = {};
    for (const [convId, nodeArr] of Object.entries(nodes)) {
      for (const node of nodeArr) {
        if (!groups[node.forkGroupId]) groups[node.forkGroupId] = [];
        const key = `${convId}:${node.turnId}`;
        if (!groups[node.forkGroupId].includes(key)) {
          groups[node.forkGroupId].push(key);
        }
      }
    }
  }
  return { nodes, groups };
}

describe('mergeForkNodes', () => {
  it('should return empty data when both inputs are empty', () => {
    const local = createForkData({});
    const cloud = createForkData({});
    const result = mergeForkNodes(local, cloud);
    expect(result).toEqual({ nodes: {}, groups: {} });
  });

  it('should return local nodes when cloud is empty', () => {
    const node = createForkNode();
    const local = createForkData({ conv1: [node] });
    const cloud = createForkData({});
    const result = mergeForkNodes(local, cloud);
    expect(result.nodes.conv1).toHaveLength(1);
    expect(result.nodes.conv1[0].turnId).toBe('u-0');
  });

  it('should return cloud nodes when local is empty', () => {
    const node = createForkNode();
    const local = createForkData({});
    const cloud = createForkData({ conv1: [node] });
    const result = mergeForkNodes(local, cloud);
    expect(result.nodes.conv1).toHaveLength(1);
    expect(result.nodes.conv1[0].turnId).toBe('u-0');
  });

  it('should merge nodes from different conversations', () => {
    const node1 = createForkNode({ conversationId: 'conv1' });
    const node2 = createForkNode({ conversationId: 'conv2', forkGroupId: 'fork-group-2' });
    const local = createForkData({ conv1: [node1] });
    const cloud = createForkData({ conv2: [node2] });
    const result = mergeForkNodes(local, cloud);
    expect(Object.keys(result.nodes)).toHaveLength(2);
    expect(result.nodes.conv1).toHaveLength(1);
    expect(result.nodes.conv2).toHaveLength(1);
  });

  it('should prefer local node when createdAt is newer', () => {
    const localNode = createForkNode({ createdAt: 2000, conversationTitle: 'Local Title' });
    const cloudNode = createForkNode({ createdAt: 1000, conversationTitle: 'Cloud Title' });
    const local = createForkData({ conv1: [localNode] });
    const cloud = createForkData({ conv1: [cloudNode] });
    const result = mergeForkNodes(local, cloud);
    expect(result.nodes.conv1).toHaveLength(1);
    expect(result.nodes.conv1[0].conversationTitle).toBe('Local Title');
  });

  it('should prefer cloud node when cloud createdAt is newer', () => {
    const localNode = createForkNode({ createdAt: 1000, conversationTitle: 'Local Title' });
    const cloudNode = createForkNode({ createdAt: 2000, conversationTitle: 'Cloud Title' });
    const local = createForkData({ conv1: [localNode] });
    const cloud = createForkData({ conv1: [cloudNode] });
    const result = mergeForkNodes(local, cloud);
    expect(result.nodes.conv1).toHaveLength(1);
    expect(result.nodes.conv1[0].conversationTitle).toBe('Cloud Title');
  });

  it('should prefer local when timestamps are equal', () => {
    const localNode = createForkNode({ createdAt: 1000, conversationTitle: 'Local Title' });
    const cloudNode = createForkNode({ createdAt: 1000, conversationTitle: 'Cloud Title' });
    const local = createForkData({ conv1: [localNode] });
    const cloud = createForkData({ conv1: [cloudNode] });
    const result = mergeForkNodes(local, cloud);
    expect(result.nodes.conv1[0].conversationTitle).toBe('Local Title');
  });

  it('should merge different fork groups within the same conversation', () => {
    const node1 = createForkNode({ forkGroupId: 'fork-1', turnId: 'u-0' });
    const node2 = createForkNode({ forkGroupId: 'fork-2', turnId: 'u-1' });
    const local = createForkData({ conv1: [node1] });
    const cloud = createForkData({ conv1: [node2] });
    const result = mergeForkNodes(local, cloud);
    expect(result.nodes.conv1).toHaveLength(2);
  });

  it('should rebuild groups index from merged nodes', () => {
    const sourceNode = createForkNode({
      conversationId: 'conv1',
      forkGroupId: 'fork-1',
      turnId: 'u-0',
      forkIndex: 0,
    });
    const forkNode = createForkNode({
      conversationId: 'conv2',
      forkGroupId: 'fork-1',
      turnId: 'u-0',
      forkIndex: 1,
    });
    const local = createForkData({ conv1: [sourceNode] });
    const cloud = createForkData({ conv2: [forkNode] });
    const result = mergeForkNodes(local, cloud);

    expect(result.groups['fork-1']).toBeDefined();
    expect(result.groups['fork-1']).toHaveLength(2);
    expect(result.groups['fork-1']).toContain('conv1:u-0');
    expect(result.groups['fork-1']).toContain('conv2:u-0');
  });

  it('should handle undefined/null inputs gracefully', () => {
    // @ts-expect-error Testing null input
    const result1 = mergeForkNodes(null, createForkData({}));
    expect(result1).toEqual({ nodes: {}, groups: {} });

    // @ts-expect-error Testing undefined input
    const result2 = mergeForkNodes(undefined, createForkData({}));
    expect(result2).toEqual({ nodes: {}, groups: {} });

    // @ts-expect-error Testing both undefined
    const result3 = mergeForkNodes(undefined, undefined);
    expect(result3).toEqual({ nodes: {}, groups: {} });
  });

  it('should not create duplicate group entries', () => {
    const node = createForkNode({ forkGroupId: 'fork-1', turnId: 'u-0' });
    const local = createForkData({ conv1: [node] });
    const cloud = createForkData({ conv1: [node] });
    const result = mergeForkNodes(local, cloud);

    expect(result.groups['fork-1']).toHaveLength(1);
    expect(result.groups['fork-1'][0]).toBe('conv1:u-0');
  });
});
