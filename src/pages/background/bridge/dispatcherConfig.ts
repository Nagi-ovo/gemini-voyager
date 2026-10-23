import { MAX_PARALLEL_JOBS } from '@/features/bridge/parallelJobs';
/**
 * The dispatcher's surface: what it needs, how it is tuned, and what it
 * answers. `bridgeDispatcher.ts` re-exports all of it for its callers.
 */
import type {
  ErrorCode,
  InflightState,
  OpName,
  ValidatedBridgeTask,
} from '@/features/bridge/protocol';

import type { BridgeClient, PairedConnection } from './bridgeClient';
import type { BridgePolicy } from './bridgePolicy';
import type { BridgeTabs } from './bridgeTabs';
import type { BridgeTaskRecord, BridgeTaskStore } from './bridgeTaskStore';
import type { CatalogRefreshRunner } from './catalogRefreshOp';
import { LEASE_PROBE_TIMEOUT_MS, type PageLeaseArbiter } from './pageLease';

/**
 * Most tasks of different jobs that run at once, each job in its own ChatGPT tab (a
 * tab costs a few hundred MB), once the person allows parallel jobs; one until then.
 * The person picks how many up to this in the popup.
 */
export const MAX_BRIDGE_TASKS = MAX_PARALLEL_JOBS;

/** Ops this build can run: the service worker's own plus what the content runtime implements. */
export const SUPPORTED_BRIDGE_OPS: ReadonlySet<OpName> = new Set<OpName>([
  'conversation.open',
  'conversation.close',
  'conversation.ready',
  'model.select',
  'composer.attach',
  'composer.send',
  'turns.waitReply',
  'turns.approve',
  'turns.read',
  'files.download',
  'project.list',
  'project.create',
  'project.open',
  'project.files',
  'project.upload',
  'project.remove',
  'catalog.refresh',
]);

export interface DispatcherConfig {
  /** Open bridge tabs in the foreground; off: every op runs in a background tab. */
  readonly openTabActive: boolean;
  /**
   * A running op silent for this long gets a document probe. Background-tab
   * throttling can stretch the 15 s progress beat to about a minute, so only a
   * probe that fails (no document) ends the task.
   */
  readonly silenceProbeMs: number;
  /** Slack past a task's deadline before the background gives it up. */
  readonly deadlineGraceMs: number;
  /** What a close keeps of its budget for closing the tab after switching its mode back. */
  readonly closeMarginMs: number;
  /** How long a page gets to answer `op.cancel` before the stop counts as unconfirmed for now. */
  readonly cancelReplyTimeoutMs: number;
  /** How often a close checks whether a timeout's mode switch-back has finished. */
  readonly leftRestorePollMs: number;
  /**
   * Switch a tab the bridge moved to chat back to the mode it came from. Off: the
   * person uses chat and asked that the bridge never switch their account to Work.
   */
  readonly restoreSwitchedMode: boolean;
  /** Tasks in flight at once, each of another job, while parallel jobs are allowed. */
  readonly maxTasks: number;
  readonly supportedOps: ReadonlySet<OpName>;
}

export const DEFAULT_DISPATCHER_CONFIG: DispatcherConfig = {
  openTabActive: false,
  silenceProbeMs: 120_000,
  deadlineGraceMs: 30_000,
  closeMarginMs: 2_000,
  cancelReplyTimeoutMs: LEASE_PROBE_TIMEOUT_MS,
  leftRestorePollMs: 250,
  restoreSwitchedMode: false,
  maxTasks: MAX_BRIDGE_TASKS,
  supportedOps: SUPPORTED_BRIDGE_OPS,
};

export interface DispatcherDeps {
  readonly store: BridgeTaskStore;
  readonly lease: PageLeaseArbiter;
  readonly policy: Pick<BridgePolicy, 'checkOp' | 'refreshIfOld'>;
  readonly tabs: BridgeTabs;
  readonly client: Pick<BridgeClient, 'ack' | 'progress' | 'result'>;
  readonly connection: () => Promise<PairedConnection | null>;
  readonly ready: () => Promise<void>;
  /** Runs `catalog.refresh` in the service worker; without it the op is unsupported. */
  readonly refreshCatalog?: CatalogRefreshRunner;
  /** Jobs the person lets run side by side: one while the switch is off, and without it. */
  readonly parallelJobs?: () => Promise<number>;
  readonly now?: () => number;
  readonly config?: Partial<DispatcherConfig>;
}

/** What the dispatcher's parts share: its deps, its resolved config and its clock. */
export interface DispatchContext {
  readonly deps: DispatcherDeps;
  readonly config: DispatcherConfig;
  readonly now: () => number;
}

export interface BridgeDispatcher {
  /** `from`: the pairing whose poll brought the task (the current one when omitted). */
  onTask(task: ValidatedBridgeTask, from?: PairedConnection): Promise<void>;
  /** The server gave the task up: stop it, and report it once its page confirms. */
  onAbort(taskId: string, reason: ErrorCode, from?: PairedConnection): Promise<void>;
  onHello(sender: chrome.runtime.MessageSender, docNonce: string): Promise<boolean>;
  onProgress(sender: chrome.runtime.MessageSender, message: ContentReport): Promise<boolean>;
  onDone(sender: chrome.runtime.MessageSender, message: ContentDone): Promise<boolean>;
  onTabRemoved(tabId: number): Promise<void>;
  /** Builtin off or unpaired: stop every task with `code`. */
  stopAll(code: ErrorCode, message: string): Promise<void>;
  /** Policy inputs changed: stop each task whose op is no longer allowed. */
  recheckPolicy(): Promise<void>;
  /** Periodic watchdog (alarm): deadlines, silent documents, vanished tabs, pending stops. */
  tick(): Promise<void>;
  inflight(): Promise<{ taskId: string; state: InflightState }[]>;
  drainOutbox(): Promise<boolean>;
  /** The tasks in flight, oldest first. */
  tasks(): Promise<BridgeTaskRecord[]>;
  /** Tasks it takes at once now: the person's count (at most `maxTasks`) while parallel jobs are allowed, else one. */
  capacity(): Promise<number>;
}

export interface ContentReport {
  readonly taskId: string;
  readonly docNonce: string;
  readonly progress: unknown;
}

export interface ContentDone {
  readonly taskId: string;
  readonly docNonce: string;
  readonly outcome: unknown;
}
