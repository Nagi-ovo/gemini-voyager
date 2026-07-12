import React, { useMemo, useState } from 'react';

import {
  CircleHelp,
  Database,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  type ClearableStorageCategoryId,
  STORAGE_SOFT_CAP_OPTIONS_MB,
  type StorageCategoryId,
  type StorageCleanupResult,
  type StorageQuotaSnapshot,
  type StorageSoftCapMb,
  type UnlimitedStoragePermissionRequestResult,
  storageQuotaService,
} from '@/core/services/StorageQuotaService';
import { getSafariMajorVersion } from '@/core/utils/browser';
import { cn } from '@/lib/utils';
import type { TranslationKey } from '@/utils/translations';

import {
  QuotaStatus,
  StorageQuotaAreaRow,
  type StorageQuotaReader,
  formatStorageBytes,
  getStorageAreaForDisplay,
  getStorageQuotaSeverity,
  translateStorageQuota,
  useStorageQuotaSnapshot,
} from './StorageQuotaCard';

export interface StorageManagerService extends StorageQuotaReader {
  saveSoftCapMb(value: StorageSoftCapMb): Promise<void>;
  requestUnlimitedStoragePermission(): Promise<UnlimitedStoragePermissionRequestResult>;
  clearCategory(category: ClearableStorageCategoryId): Promise<StorageCleanupResult>;
}

export interface StorageManagerProps {
  onClose: () => void;
  onManageHighlights?: () => void;
  service?: StorageManagerService;
  clearHighlights?: () => Promise<void>;
}

type BusyAction = 'permission' | 'soft-cap' | ClearableStorageCategoryId | null;
type ActionErrorKey = TranslationKey | 'storageQuotaUnknown';

const UI_CLEARABLE_CATEGORIES = new Set<StorageCategoryId>(['cache', 'drafts', 'highlights']);

async function clearAllHighlights(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'gv.highlight.clearAllAccounts' })) as
    | { ok?: boolean; error?: string }
    | undefined;
  if (!response?.ok) throw new Error(response?.error || 'Failed to clear highlights');
}

function categoryLabel(id: StorageCategoryId, t: (key: TranslationKey) => string): string {
  switch (id) {
    case 'prompts':
      return t('promptManagerOptions');
    case 'folders':
      return t('folderOptions');
    case 'timeline':
      return t('timelineOptions');
    case 'highlights':
      return translateStorageQuota(t, 'storageQuotaHighlights');
    case 'drafts':
      return t('draftAutoSave');
    case 'cache':
      return translateStorageQuota(t, 'storageQuotaCache');
    case 'settings':
      return t('generalOptions');
    case 'other':
      return translateStorageQuota(t, 'storageQuotaOther');
  }
}

function actionErrorLabel(
  key: ActionErrorKey,
  t: (translationKey: TranslationKey) => string,
): string {
  return key === 'storageQuotaUnknown' ? translateStorageQuota(t, key) : t(key);
}

function StorageOverview({
  snapshot,
  error,
  refreshing,
  onRefresh,
}: {
  snapshot: StorageQuotaSnapshot;
  error: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { language, t } = useLanguage();
  const severity = useMemo(
    () => (error ? 'unknown' : getStorageQuotaSeverity(snapshot)),
    [error, snapshot],
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <QuotaStatus severity={severity} t={t} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground h-7 w-7"
            onClick={onRefresh}
            aria-label={t('usageStatusRefresh')}
            title={t('usageStatusRefresh')}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', refreshing && 'animate-spin motion-reduce:animate-none')}
              aria-hidden="true"
            />
          </Button>
        </div>
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
        {error && (
          <p className="text-muted-foreground text-xs" role="alert">
            {translateStorageQuota(t, 'storageQuotaUnknown')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LimitNotice({ snapshot }: { snapshot: StorageQuotaSnapshot }) {
  const { t } = useLanguage();
  const isSafari = snapshot.permission.browser === 'safari';
  const safariMajorVersion = isSafari ? getSafariMajorVersion() : null;
  const hasLegacySafariLimit = safariMajorVersion !== null && safariMajorVersion < 16;
  const hasUnknownSafariLimit = isSafari && safariMajorVersion === null;

  if (!hasLegacySafariLimit && !hasUnknownSafariLimit) return null;

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-relaxed',
        hasLegacySafariLimit
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
          : 'border-border bg-muted/40 text-muted-foreground',
      )}
      role="note"
    >
      {hasLegacySafariLimit ? (
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>
        {translateStorageQuota(
          t,
          hasLegacySafariLimit ? 'storageQuotaSafariLimit' : 'storageQuotaUnknownLimit',
        )}
      </span>
    </div>
  );
}

export function StorageManager({
  onClose,
  onManageHighlights,
  service = storageQuotaService,
  clearHighlights = clearAllHighlights,
}: StorageManagerProps) {
  const { language, t } = useLanguage();
  const { snapshot, loading, refreshing, error, refresh } = useStorageQuotaSnapshot(service);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [actionError, setActionError] = useState<ActionErrorKey | null>(null);
  const [cleanupResult, setCleanupResult] = useState<StorageCleanupResult | null>(null);

  const runAction = async (action: Exclude<BusyAction, null>, callback: () => Promise<void>) => {
    setBusyAction(action);
    setActionError(null);
    setCleanupResult(null);
    try {
      await callback();
    } catch (actionFailure) {
      console.error(`[StorageQuota] ${action} action failed:`, actionFailure);
      setActionError(action === 'permission' ? 'permissionRequestFailed' : 'storageQuotaUnknown');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSoftCapChange = (value: StorageSoftCapMb) => {
    if (snapshot?.softCapMb === value || busyAction !== null) return;
    void runAction('soft-cap', async () => {
      await service.saveSoftCapMb(value);
      await refresh();
    });
  };

  const handlePermissionRequest = () => {
    if (busyAction !== null) return;
    void runAction('permission', async () => {
      const result = await service.requestUnlimitedStoragePermission();
      if (!result.granted) {
        setActionError(result.reason === 'denied' ? 'permissionDenied' : 'permissionRequestFailed');
      }
      await refresh();
    });
  };

  const handleClearCategory = (category: ClearableStorageCategoryId, label: string) => {
    if (!UI_CLEARABLE_CATEGORIES.has(category) || busyAction !== null) return;
    const confirmTemplate = translateStorageQuota(
      t,
      category === 'highlights'
        ? 'storageQuotaHighlightClearConfirm'
        : category === 'drafts'
          ? 'storageQuotaDraftClearConfirm'
          : 'storageQuotaClearConfirm',
    );
    if (!window.confirm(confirmTemplate.replace('{category}', label))) return;

    void runAction(category, async () => {
      const result =
        category === 'highlights'
          ? await (async (): Promise<StorageCleanupResult> => {
              const before = snapshot?.categories.find((item) => item.id === category);
              await clearHighlights();
              return {
                category,
                removedKeys: before?.keys ?? [],
                bytesBefore: before?.bytesInUse ?? 0,
                bytesAfter: 0,
                bytesFreed: before?.bytesInUse ?? 0,
                estimated: true,
              };
            })()
          : await service.clearCategory(category);
      setCleanupResult(result);
      await refresh();
    });
  };

  return (
    <div className="bg-background text-foreground flex h-[600px] w-[360px] flex-col">
      <header className="border-border/60 bg-card flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <Database className="h-4 w-4" aria-hidden="true" />
          </span>
          <h1 className="truncate text-base font-semibold tracking-tight">
            {translateStorageQuota(t, 'storageQuotaTitle')}
          </h1>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground h-8 w-8 rounded-full"
          onClick={onClose}
          aria-label={t('pm_cancel')}
          title={t('pm_cancel')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {loading && !snapshot ? (
          <div className="flex h-full items-center justify-center" role="status">
            <span className="text-muted-foreground text-sm">{t('loading')}</span>
          </div>
        ) : snapshot ? (
          <div className="space-y-4">
            <StorageOverview
              snapshot={snapshot}
              error={error}
              refreshing={refreshing}
              onRefresh={() => void refresh()}
            />

            <LimitNotice snapshot={snapshot} />

            <section aria-labelledby="storage-soft-limit-title" className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2
                  id="storage-soft-limit-title"
                  className="text-muted-foreground text-xs font-bold tracking-wider uppercase"
                >
                  {translateStorageQuota(t, 'storageQuotaSoftLimit')}
                </h2>
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {formatStorageBytes(snapshot.softCapBytes, language)}
                </span>
              </div>
              <div
                className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1"
                role="group"
                aria-label={translateStorageQuota(t, 'storageQuotaSoftLimit')}
              >
                {STORAGE_SOFT_CAP_OPTIONS_MB.map((value) => {
                  const selected = snapshot.softCapMb === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      className={cn(
                        'rounded-md px-2 py-1.5 text-xs font-semibold tabular-nums transition-colors',
                        selected
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                      aria-pressed={selected}
                      disabled={busyAction !== null}
                      onClick={() => handleSoftCapChange(value)}
                    >
                      {value} MB
                    </button>
                  );
                })}
              </div>
              {snapshot.local.quotaBytes !== null &&
                snapshot.local.quotaBytes < snapshot.softCapBytes && (
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    {translateStorageQuota(t, 'storageQuotaEffectiveLimit').replace(
                      '{size}',
                      formatStorageBytes(
                        snapshot.local.quotaBytes,
                        language,
                        snapshot.local.quotaEstimated,
                      ),
                    )}
                  </p>
                )}
            </section>

            {snapshot.permission.requestable && (
              <button
                type="button"
                className="border-primary/25 bg-primary/5 text-foreground hover:bg-primary/10 flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors disabled:opacity-50"
                onClick={handlePermissionRequest}
                disabled={busyAction !== null}
              >
                <span className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  {translateStorageQuota(t, 'storageQuotaUnlock')}
                </span>
              </button>
            )}

            {(actionError || cleanupResult) && (
              <div
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs',
                  actionError
                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                    : 'border-primary/20 bg-primary/5 text-foreground',
                )}
                role={actionError ? 'alert' : 'status'}
                aria-live="polite"
              >
                {actionError
                  ? actionErrorLabel(actionError, t)
                  : `${t('pm_deleted')}: ${formatStorageBytes(
                      cleanupResult?.bytesFreed ?? 0,
                      language,
                      cleanupResult?.estimated,
                    )}`}
              </div>
            )}

            <section aria-labelledby="storage-breakdown-title" className="space-y-2.5">
              <h2
                id="storage-breakdown-title"
                className="text-muted-foreground text-xs font-bold tracking-wider uppercase"
              >
                {translateStorageQuota(t, 'storageQuotaBreakdown')}
              </h2>
              <Card>
                <CardContent className="divide-border/60 divide-y p-0">
                  {snapshot.categories.map((category) => {
                    const label = categoryLabel(category.id, t);
                    const canClear = UI_CLEARABLE_CATEGORIES.has(category.id);
                    return (
                      <div key={category.id} className="flex min-h-11 items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">{label}</div>
                        </div>
                        <span className="text-muted-foreground shrink-0 text-xs font-semibold tabular-nums">
                          {formatStorageBytes(category.bytesInUse, language, category.estimated)}
                        </span>
                        {category.id === 'highlights' && onManageHighlights && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-primary hover:bg-primary/10 hover:text-primary h-7 shrink-0 px-2 text-xs"
                            onClick={onManageHighlights}
                            disabled={busyAction !== null}
                          >
                            {translateStorageQuota(t, 'storageQuotaManage')}
                          </Button>
                        )}
                        {canClear && category.keys.length > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 shrink-0 px-2 text-xs"
                            onClick={() =>
                              handleClearCategory(category.id as ClearableStorageCategoryId, label)
                            }
                            disabled={busyAction !== null || !category.clearable}
                            aria-label={`${t('pm_delete')} ${label}`}
                            title={`${t('pm_delete')} ${label}`}
                          >
                            <span className="inline-flex items-center gap-1">
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                              {t('pm_delete')}
                            </span>
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </section>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CircleHelp className="text-muted-foreground h-7 w-7" aria-hidden="true" />
            <p
              className="text-muted-foreground max-w-64 text-sm"
              role={error ? 'alert' : undefined}
            >
              {translateStorageQuota(t, 'storageQuotaUnknown')}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
              {t('usageStatusRefresh')}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
