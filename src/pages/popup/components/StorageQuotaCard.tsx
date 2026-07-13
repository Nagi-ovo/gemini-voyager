import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Database,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import browser from 'webextension-polyfill';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  STORAGE_QUOTA_CRITICAL_RATIO,
  STORAGE_QUOTA_WARNING_RATIO,
  type StorageAreaUsage,
  type StorageQuotaSnapshot,
  getStorageQuotaEffectiveUsageRatio,
  storageQuotaService,
} from '@/core/services/StorageQuotaService';
import { cn } from '@/lib/utils';
import type { TranslationKey } from '@/utils/translations';

export type StorageQuotaTranslationKey =
  | 'storageQuotaTitle'
  | 'storageQuotaManage'
  | 'storageQuotaLocal'
  | 'storageQuotaSync'
  | 'storageQuotaHealthy'
  | 'storageQuotaAttention'
  | 'storageQuotaCritical'
  | 'storageQuotaUnknown'
  | 'storageQuotaBreakdown'
  | 'storageQuotaSoftLimit'
  | 'storageQuotaEffectiveLimit'
  | 'storageQuotaCache'
  | 'storageQuotaHighlights'
  | 'storageQuotaOther'
  | 'storageQuotaUnlock'
  | 'storageQuotaSafariLimit'
  | 'storageQuotaUnknownLimit'
  | 'storageQuotaClearConfirm'
  | 'storageQuotaDraftClearConfirm'
  | 'storageQuotaHighlightClearConfirm';

export type StorageQuotaTranslator = (key: TranslationKey) => string;

export function translateStorageQuota(
  t: StorageQuotaTranslator,
  key: StorageQuotaTranslationKey,
): string {
  return t(key);
}

export interface StorageQuotaReader {
  getSnapshot(): Promise<StorageQuotaSnapshot>;
}

export interface StorageQuotaCardProps {
  onManage: () => void;
  service?: StorageQuotaReader;
  className?: string;
}

export type QuotaSeverity = 'normal' | 'warning' | 'critical' | 'unknown';

interface StorageQuotaSnapshotState {
  snapshot: StorageQuotaSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}

const STORAGE_CHANGE_DEBOUNCE_MS = 120;

export function formatStorageBytes(bytes: number, locale: string, estimated = false): string {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  const unitIndex = Math.min(
    units.length - 1,
    safeBytes === 0 ? 0 : Math.floor(Math.log(safeBytes) / Math.log(1024)),
  );
  const value = safeBytes / 1024 ** unitIndex;
  const formatted = new Intl.NumberFormat(locale.replace('_', '-'), {
    maximumFractionDigits: unitIndex === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2,
  }).format(value);
  return `${estimated ? '~' : ''}${formatted} ${units[unitIndex]}`;
}

export function getStorageAreaForDisplay(
  snapshot: StorageQuotaSnapshot,
  area: 'local' | 'sync',
): StorageAreaUsage {
  const usage = snapshot[area];
  if (area !== 'local' || usage.quotaBytes !== null) return usage;

  // unlimitedStorage removes the browser hard cap. The user-selected soft cap
  // remains the useful reference for both the bar and the warning thresholds.
  return {
    ...usage,
    quotaBytes: snapshot.softCapBytes,
    usageRatio: snapshot.softCapUsageRatio,
    quotaEstimated: false,
  };
}

export function getStorageQuotaSeverity(snapshot: StorageQuotaSnapshot): QuotaSeverity {
  const highestRatio = getStorageQuotaEffectiveUsageRatio(snapshot);
  if (highestRatio === null) return 'unknown';
  if (highestRatio >= STORAGE_QUOTA_CRITICAL_RATIO) return 'critical';
  if (highestRatio >= STORAGE_QUOTA_WARNING_RATIO) return 'warning';
  return 'normal';
}

export function useStorageQuotaSnapshot(
  service: StorageQuotaReader = storageQuotaService,
): StorageQuotaSnapshotState {
  const [snapshot, setSnapshot] = useState<StorageQuotaSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const mountedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const requestSequenceRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestSequence = ++requestSequenceRef.current;
    const isInitialLoad = !hasLoadedRef.current;
    if (isInitialLoad) setLoading(true);
    else setRefreshing(true);

    try {
      const nextSnapshot = await service.getSnapshot();
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;
      setSnapshot(nextSnapshot);
      setError(false);
      hasLoadedRef.current = true;
    } catch (refreshError) {
      if (mountedRef.current && requestSequence === requestSequenceRef.current) {
        console.error('[StorageQuota] Failed to read storage usage:', refreshError);
        setError(true);
      }
    } finally {
      if (mountedRef.current && requestSequence === requestSequenceRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [service]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const handleStorageChange = (
      _changes: Record<string, browser.Storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local' && areaName !== 'sync') return;
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), STORAGE_CHANGE_DEBOUNCE_MS);
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      mountedRef.current = false;
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [refresh]);

  return { snapshot, loading, refreshing, error, refresh };
}

function quotaSeverityStyles(severity: QuotaSeverity): {
  fill: string;
  badge: string;
} {
  switch (severity) {
    case 'critical':
      return {
        fill: 'bg-destructive',
        badge: 'bg-destructive/10 text-destructive',
      };
    case 'warning':
      return {
        fill: 'bg-amber-500 dark:bg-amber-400',
        badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
      };
    case 'normal':
      return {
        fill: 'bg-primary',
        badge: 'bg-primary/10 text-primary',
      };
    default:
      return {
        fill: 'bg-muted-foreground/40',
        badge: 'bg-muted text-muted-foreground',
      };
  }
}

export function QuotaStatus({
  severity,
  t,
}: {
  severity: QuotaSeverity;
  t: StorageQuotaTranslator;
}) {
  const styles = quotaSeverityStyles(severity);
  const status = {
    normal: {
      icon: CheckCircle2,
      label: translateStorageQuota(t, 'storageQuotaHealthy'),
    },
    warning: {
      icon: TriangleAlert,
      label: translateStorageQuota(t, 'storageQuotaAttention'),
    },
    critical: {
      icon: CircleAlert,
      label: translateStorageQuota(t, 'storageQuotaCritical'),
    },
    unknown: {
      icon: CircleHelp,
      label: translateStorageQuota(t, 'storageQuotaUnknown'),
    },
  }[severity];
  const StatusIcon = status.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] leading-none font-semibold',
        styles.badge,
      )}
      role="status"
    >
      <StatusIcon className="h-3 w-3" aria-hidden="true" />
      {status.label}
    </span>
  );
}

export function StorageQuotaAreaRow({
  label,
  usage,
  locale,
  t,
}: {
  label: string;
  usage: StorageAreaUsage;
  locale: string;
  t: StorageQuotaTranslator;
}) {
  const severity: QuotaSeverity =
    usage.usageRatio === null
      ? 'unknown'
      : usage.usageRatio >= STORAGE_QUOTA_CRITICAL_RATIO
        ? 'critical'
        : usage.usageRatio >= STORAGE_QUOTA_WARNING_RATIO
          ? 'warning'
          : 'normal';
  const ratio = usage.usageRatio ?? 0;
  const clampedPercent = Math.max(0, Math.min(100, ratio * 100));
  const styles = quotaSeverityStyles(severity);
  const valueLabel = usage.available
    ? usage.quotaBytes === null
      ? formatStorageBytes(usage.bytesInUse, locale, usage.estimated)
      : `${formatStorageBytes(usage.bytesInUse, locale, usage.estimated)} / ${formatStorageBytes(
          usage.quotaBytes,
          locale,
          usage.quotaEstimated,
        )}`
    : translateStorageQuota(t, 'storageQuotaUnknown');

  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-3">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          {label}
        </span>
        <div className="flex min-w-0 items-baseline gap-2 text-right tabular-nums">
          <span className="truncate text-sm font-semibold tracking-tight">{valueLabel}</span>
          {usage.usageRatio !== null && (
            <span className="text-muted-foreground shrink-0 text-[11px] font-medium">
              {Math.round(usage.usageRatio * 100)}%
            </span>
          )}
        </div>
      </div>
      <div
        className="bg-secondary h-1.5 overflow-hidden rounded-full"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={usage.usageRatio === null ? undefined : Math.round(clampedPercent)}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none',
            styles.fill,
          )}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
    </div>
  );
}

function StorageQuotaSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row} className="space-y-2">
          <div className="flex justify-between">
            <div className="bg-muted h-3 w-12 animate-pulse rounded motion-reduce:animate-none" />
            <div className="bg-muted h-4 w-28 animate-pulse rounded motion-reduce:animate-none" />
          </div>
          <div className="bg-muted h-1.5 animate-pulse rounded-full motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

export function StorageQuotaCard({
  onManage,
  service = storageQuotaService,
  className,
}: StorageQuotaCardProps) {
  const { language, t } = useLanguage();
  const { snapshot, loading, refreshing, error, refresh } = useStorageQuotaSnapshot(service);
  const severity = useMemo(
    () => (snapshot ? getStorageQuotaSeverity(snapshot) : 'unknown'),
    [snapshot],
  );

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-0">
        <div className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                <Database className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <h2 className="truncate text-sm font-semibold tracking-tight">
                {translateStorageQuota(t, 'storageQuotaTitle')}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <QuotaStatus severity={error ? 'unknown' : severity} t={t} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground h-7 w-7"
                onClick={() => void refresh()}
                aria-label={t('usageStatusRefresh')}
                title={t('usageStatusRefresh')}
                disabled={loading || refreshing}
              >
                <RefreshCw
                  className={cn(
                    'h-3.5 w-3.5',
                    refreshing && 'animate-spin motion-reduce:animate-none',
                  )}
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>

          {loading && !snapshot ? (
            <StorageQuotaSkeleton />
          ) : snapshot ? (
            <div className="space-y-3.5">
              <StorageQuotaAreaRow
                label={translateStorageQuota(t, 'storageQuotaLocal')}
                usage={getStorageAreaForDisplay(snapshot, 'local')}
                locale={language}
                t={t}
              />
              <StorageQuotaAreaRow
                label={translateStorageQuota(t, 'storageQuotaSync')}
                usage={getStorageAreaForDisplay(snapshot, 'sync')}
                locale={language}
                t={t}
              />
            </div>
          ) : (
            <p className="text-muted-foreground py-2 text-xs" role="alert">
              {translateStorageQuota(t, 'storageQuotaUnknown')}
            </p>
          )}
        </div>

        <div className="border-border/60 bg-muted/25 flex items-center justify-end border-t px-4 py-2.5">
          <Button type="button" variant="outline" size="sm" onClick={onManage} className="h-8">
            {translateStorageQuota(t, 'storageQuotaManage')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
