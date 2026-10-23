import { type FormEvent, type MouseEvent, useEffect, useRef, useState } from 'react';

import { askConfirm } from '@/core/ui/confirm';
import { getVoyagerBuildTarget, supportsOptionalHostPermissions } from '@/core/utils/browser';
import { MAX_PARALLEL_JOBS, MIN_PARALLEL_JOBS } from '@/features/bridge/parallelJobs';
import { DEFAULT_PORT, normalizePairingCode } from '@/features/bridge/protocol';
import type { TranslationKey } from '@/utils/translations';

import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { fieldVariants } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Switch } from '../../../components/ui/switch';
import {
  type BridgeActionResult,
  type BridgeParallelChange,
  type BridgeStatus,
  enableBridgeRefresh,
  pairBridge,
  requestBridgeAccess,
  setBridgeParallel,
  unpairBridge,
  useBridgePluginEnabled,
  useBridgeStatus,
} from '../hooks/useBridgeStatus';
import { NumberSetting } from './NumberSetting';

const INPUT_CLASS = `${fieldVariants({ size: 'lg' })} w-full tabular-nums`;

/** Characters of the server id worth showing; enough to tell two servers apart. */
const SERVER_ID_PREFIX = 8;

type Failure = Extract<BridgeActionResult, { ok: false }>;

interface ParallelChoice {
  readonly enabled: boolean;
  readonly jobs: number;
}

/** Copy for a failed pairing, phrased as what to do next. */
export function bridgeErrorKey(failure: Pick<Failure, 'code' | 'upgrade'>): TranslationKey {
  switch (failure.code) {
    case 'permission-missing':
      return 'bridgeErrorPermission';
    case 'server-unreachable':
      return 'bridgeErrorUnreachable';
    case 'unauthorized':
    case 'bad-request':
    case 'not-found':
    case 'gone':
      return 'bridgeErrorRejected';
    case 'protocol-mismatch':
      if (failure.upgrade === 'extension') return 'bridgeErrorUpgradeExtension';
      if (failure.upgrade === 'cli') return 'bridgeErrorUpgradeCli';
      return 'bridgeErrorGeneric';
    case 'no-response':
      return 'bridgeErrorNoResponse';
    default:
      return 'bridgeErrorGeneric';
  }
}

function parsePort(value: string): number | undefined {
  if (!/^\d{1,5}$/.test(value.trim())) return undefined;
  const port = Number(value.trim());
  // The background's `isValidBridgePort` range: a lower port passed here, asked for access, then failed.
  return port >= 1024 && port <= 65535 ? port : undefined;
}

/** Why this browser cannot run the bridge at all; null when it can. */
function unsupportedReason(): TranslationKey | null {
  if (getVoyagerBuildTarget() === 'safari') return 'bridgeUnsupportedSafari';
  if (!supportsOptionalHostPermissions()) return 'bridgeUnsupportedFirefox';
  return null;
}

function popupScheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function StatusDot({ tone }: { tone: 'ok' | 'warn' | 'idle' }) {
  const color =
    tone === 'ok' ? 'bg-success' : tone === 'warn' ? 'bg-warning' : 'bg-muted-foreground/60';
  return (
    <span
      aria-hidden="true"
      className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${color}`}
    />
  );
}

export interface ChatGptBridgeCardProps {
  readonly t: (key: TranslationKey) => string;
}

/**
 * Pairs this browser with the local `voyager serve` and shows what the
 * background bridge is doing. Every answer comes from the background: the
 * popup never contacts 127.0.0.1 itself. Hidden while the bridge builtin is off.
 */
export function ChatGptBridgeCard({ t }: ChatGptBridgeCardProps) {
  const enabled = useBridgePluginEnabled();
  const unsupported = unsupportedReason();
  const { status, refresh } = useBridgeStatus(enabled && unsupported === null);
  const [code, setCode] = useState('');
  const [port, setPort] = useState(String(DEFAULT_PORT));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<TranslationKey | null>(null);
  // Shown at once; the status read after the last change takes over once it is in.
  const [parallelShown, setParallelShown] = useState<ParallelChoice | null>(null);
  const parallelPending = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (!enabled) return null;

  /** Settles an action; resolves once the status read it asks for is in. */
  const finish = (result: BridgeActionResult, failureKey?: TranslationKey): Promise<void> => {
    if (!mounted.current) return Promise.resolve();
    setBusy(false);
    setNote(result.ok ? null : (failureKey ?? bridgeErrorKey(result)));
    return refresh();
  };

  const pair = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setNote(null);
    const normalized = normalizePairingCode(code);
    if (!normalized) {
      setNote('bridgeErrorCode');
      return;
    }
    const portNumber = parsePort(port);
    if (portNumber === undefined) {
      setAdvancedOpen(true);
      setNote('bridgeErrorPort');
      return;
    }
    setBusy(true);
    // Called synchronously from the gesture: it asks for loopback access as its first await.
    void pairBridge(portNumber, normalized).then((result) => {
      if (result.ok && mounted.current) setCode('');
      void finish(result);
    });
  };

  const allowAccess = (): void => {
    setNote(null);
    void requestBridgeAccess().then((granted) => {
      if (!mounted.current) return;
      if (!granted) setNote('bridgeErrorPermission');
      void refresh();
    });
  };

  const turnOnUpdates = (): void => {
    setNote(null);
    setBusy(true);
    void enableBridgeRefresh().then((result) => void finish(result, 'bridgeErrorAction'));
  };

  const changeParallel = (change: BridgeParallelChange): void => {
    if (!status) return;
    setNote(null);
    setParallelShown((shown) => ({
      ...(shown ?? { enabled: status.parallel, jobs: status.parallelJobs }),
      ...change,
    }));
    // Only the switch waits: a count typed digit by digit must keep its field usable.
    if (change.enabled !== undefined) setBusy(true);
    parallelPending.current += 1;
    void setBridgeParallel(change).then(async (result) => {
      await finish(result, 'bridgeErrorAction');
      parallelPending.current -= 1;
      // Cleared only after the status read has the change: earlier, the switch flicks back.
      if (mounted.current && parallelPending.current === 0) setParallelShown(null);
    });
  };

  const unpair = async (anchor: HTMLElement): Promise<void> => {
    setNote(null);
    const answer = await askConfirm({
      message: t('bridgeUnpairConfirm'),
      anchor,
      align: 'end',
      tone: 'danger',
      scheme: popupScheme(),
      choices: [{ id: 'unpair', label: t('bridgeUnpair') }],
    });
    if (answer !== 'unpair' || !mounted.current) return;
    setBusy(true);
    await finish(await unpairBridge(), 'bridgeErrorAction');
  };

  // A failure the background kept (the popup may have closed during the
  // permission prompt) shows until this popup has something newer to say.
  const lastErrorKey =
    status && !status.paired && status.lastError ? bridgeErrorKey(status.lastError) : null;
  const shownNote = note ?? lastErrorKey;

  return (
    <Card style={{ order: -2 }} className="p-4" data-testid="chatgpt-bridge-card">
      <CardContent className="p-0">
        <p className="text-sm font-medium">{t('bridgeCardTitle')}</p>
        {unsupported ? (
          <p className="text-muted-foreground mt-1 text-xs">{t(unsupported)}</p>
        ) : !status ? (
          <p role="status" className="text-muted-foreground mt-1 text-xs">
            {t('bridgeStatusChecking')}
          </p>
        ) : status.paired ? (
          <PairedDetails
            status={status}
            serverId={status.paired.serverId}
            busy={busy}
            parallel={parallelShown ?? { enabled: status.parallel, jobs: status.parallelJobs }}
            onParallelChange={changeParallel}
            onAllowAccess={allowAccess}
            onTurnOnUpdates={turnOnUpdates}
            onUnpair={(event) => void unpair(event.currentTarget)}
            t={t}
          />
        ) : (
          <form className="mt-1 space-y-2" onSubmit={pair} noValidate>
            <p className="text-muted-foreground text-xs">{t('bridgeCardHint')}</p>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="gv-bridge-code" className="text-xs">
                  {t('bridgeCodeLabel')}
                </Label>
                <input
                  id="gv-bridge-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={9}
                  placeholder="1234-5678"
                  className={INPUT_CLASS}
                />
              </div>
              <Button type="submit" size="sm" disabled={busy} className="shrink-0">
                {t(busy ? 'bridgePairing' : 'bridgePair')}
              </Button>
            </div>
            <button
              type="button"
              aria-expanded={advancedOpen}
              aria-controls="gv-bridge-advanced"
              onClick={() => setAdvancedOpen((open) => !open)}
              className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline"
            >
              {t('bridgeAdvanced')}
            </button>
            {advancedOpen && (
              <div id="gv-bridge-advanced" className="w-28 space-y-1">
                <Label htmlFor="gv-bridge-port" className="text-xs">
                  {t('bridgePortLabel')}
                </Label>
                <input
                  id="gv-bridge-port"
                  value={port}
                  onChange={(event) => setPort(event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={5}
                  className={INPUT_CLASS}
                />
              </div>
            )}
          </form>
        )}
        {shownNote && (
          <p role="status" className="text-destructive mt-2 text-[11px] leading-snug">
            {t(shownNote)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PairedDetails({
  status,
  serverId,
  busy,
  parallel,
  onParallelChange,
  onAllowAccess,
  onTurnOnUpdates,
  onUnpair,
  t,
}: {
  status: BridgeStatus;
  serverId: string;
  busy: boolean;
  parallel: ParallelChoice;
  onParallelChange: (change: BridgeParallelChange) => void;
  onAllowAccess: () => void;
  onTurnOnUpdates: () => void;
  onUnpair: (event: MouseEvent<HTMLButtonElement>) => void;
  t: (key: TranslationKey) => string;
}) {
  const server = serverId.slice(0, SERVER_ID_PREFIX);
  const connection: { key: TranslationKey; tone: 'ok' | 'warn' | 'idle' } = !status.permission
    ? { key: 'bridgeNeedsAccess', tone: 'warn' }
    : status.server === 'online'
      ? { key: 'bridgeStatusConnected', tone: 'ok' }
      : status.server === 'offline'
        ? { key: 'bridgeStatusOffline', tone: 'warn' }
        : { key: 'bridgeStatusWaiting', tone: 'idle' };
  const policyKey: TranslationKey | null = !status.permission
    ? null
    : status.policy === 'denied'
      ? 'bridgePolicyDenied'
      : status.policy === 'stale'
        ? status.onlineUpdatesEnabled
          ? 'bridgePolicyStale'
          : 'bridgePolicyNeedsUpdates'
        : status.policy === 'unknown'
          ? 'bridgePolicyChecking'
          : null;
  const offerUpdates =
    status.permission && status.policy === 'stale' && !status.onlineUpdatesEnabled;

  return (
    <div className="mt-1 space-y-2">
      <div role="status" className="flex items-start gap-2 text-xs">
        <StatusDot tone={connection.tone} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p>{t(connection.key).replace('{server}', server)}</p>
          {status.lastPollAt !== undefined && (
            <p className="text-muted-foreground text-[11px]">
              {t('bridgeLastContact').replace(
                '{time}',
                new Date(status.lastPollAt).toLocaleTimeString(),
              )}
            </p>
          )}
          {status.activeTasks.map((task) => (
            <p key={task.jobId} className="text-muted-foreground text-[11px]">
              {t('bridgeActiveTask')
                .replace('{op}', task.op)
                .replace('{job}', task.jobId.slice(0, SERVER_ID_PREFIX))}
            </p>
          ))}
        </div>
      </div>
      {policyKey && (
        // Theme tokens for the text: Tailwind's `dark:` follows the OS, not the popup's own theme.
        <div className="flex items-start gap-2 text-[11px] leading-snug">
          <StatusDot tone="warn" />
          <p className="min-w-0 flex-1">{t(policyKey)}</p>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label htmlFor="gv-bridge-parallel" className="cursor-pointer text-xs font-medium">
            {t('bridgeParallelLabel')}
          </Label>
          <p
            id="gv-bridge-parallel-hint"
            className="text-muted-foreground mt-0.5 text-[11px] leading-snug"
          >
            {t('bridgeParallelHint')}
          </p>
        </div>
        <Switch
          id="gv-bridge-parallel"
          size="sm"
          checked={parallel.enabled}
          disabled={busy}
          aria-describedby="gv-bridge-parallel-hint"
          onChange={(event) => onParallelChange({ enabled: event.target.checked })}
        />
      </div>
      {parallel.enabled && (
        <div className="flex items-center justify-between gap-3">
          <span aria-hidden="true" className="text-foreground/80 text-xs">
            {t('bridgeParallelJobsLabel')}
          </span>
          <NumberSetting
            label={t('bridgeParallelJobsLabel')}
            value={parallel.jobs}
            min={MIN_PARALLEL_JOBS}
            max={MAX_PARALLEL_JOBS}
            disabled={false}
            onChange={(jobs) => onParallelChange({ jobs })}
          />
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {!status.permission && (
          <Button type="button" size="sm" onClick={onAllowAccess}>
            {t('bridgeAllowAccess')}
          </Button>
        )}
        {offerUpdates && (
          <Button type="button" size="sm" disabled={busy} onClick={onTurnOnUpdates}>
            {t('bridgeTurnOnUpdates')}
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onUnpair}>
          {t('bridgeUnpair')}
        </Button>
      </div>
    </div>
  );
}
