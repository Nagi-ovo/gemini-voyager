import type { OpName, ProjectOpName } from '@/features/bridge/protocol';
import type {
  BridgeGrant,
  BridgeOpOutcome,
  BridgeOpStartAck,
} from '@/features/bridge/runtimeMessages';
import { chatgptAdapter } from '@/features/plugins/sites/adapters/chatgpt';

import { getDocNonce } from '../docIdentity';
import { type BridgeRuntime, createBridgeRuntime } from '../runtime';

export interface Harness {
  readonly runtime: BridgeRuntime;
  readonly sent: Record<string, unknown>[];
  start(
    op: OpName | ProjectOpName,
    params: unknown,
    grant?: Partial<BridgeGrant>,
  ): BridgeOpStartAck;
  readonly taskId: string;
  outcome(taskId?: string): BridgeOpOutcome | undefined;
  progress(taskId?: string): Record<string, unknown>[];
}

let nextTask = 0;

/**
 * A runtime attached to the bundled ChatGPT adapter, recording what it sends
 * the background; `reply` plays the background's answer (blob reads).
 */
export function createHarness(
  reply: (message: Record<string, unknown>) => unknown = () => undefined,
): Harness {
  const sent: Record<string, unknown>[] = [];
  const runtime = createBridgeRuntime({
    send: async (message) => {
      sent.push(message);
      return reply(message);
    },
    listen: false,
  });
  runtime.attach(chatgptAdapter);
  let taskId = '';
  return {
    runtime,
    sent,
    get taskId() {
      return taskId;
    },
    start(op, params, grant = {}) {
      nextTask += 1;
      taskId = `task-${nextTask}`;
      return runtime.handleOpStart(
        {
          taskId,
          jobId: 'job-1',
          // The project ops join `OpName` with their registration; the runtime refuses them until then.
          op: op as OpName,
          opVersion: 1,
          params,
          deadlineMs: 30_000,
          issuedAt: Date.now(),
        },
        { docNonce: getDocNonce(), deadline: Date.now() + 30_000, leaseId: 'lease-1', ...grant },
      );
    },
    outcome(id = taskId) {
      const done = sent.find(
        (message) => message.type === 'gv.bridge.op.done' && message.taskId === id,
      );
      return done?.outcome as BridgeOpOutcome | undefined;
    },
    progress(id = taskId) {
      return sent
        .filter((message) => message.type === 'gv.bridge.op.progress' && message.taskId === id)
        .map((message) => message.progress as Record<string, unknown>);
    },
  };
}

export function errorCode(outcome: BridgeOpOutcome | undefined): string | undefined {
  return outcome && !outcome.ok ? outcome.error.code : undefined;
}
