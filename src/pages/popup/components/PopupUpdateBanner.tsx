import { Card } from '@/components/ui/card';
import type { TranslationKey } from '@/utils/translations';

import type { usePopupReleaseInfo } from '../hooks/usePopupReleaseInfo';

export function PopupUpdateBanner({
  release,
  isSafariBrowser,
  t,
}: {
  release: ReturnType<typeof usePopupReleaseInfo>;
  isSafariBrowser: boolean;
  t: (key: TranslationKey) => string;
}) {
  const {
    hasUpdate,
    normalizedLatestVersion,
    normalizedCurrentVersion,
    safariDmgUrl,
    latestReleaseUrl,
  } = release;
  return (
    hasUpdate &&
    normalizedLatestVersion &&
    normalizedCurrentVersion && (
      <Card style={{ order: -2 }} className="border-warning/40 bg-warning/5 p-3">
        <div className="flex items-start gap-2.5">
          {/* A circular "refresh" arrow: a new version, not an upload. */}
          <svg
            className="text-warning mt-0.5 shrink-0"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm leading-tight font-medium">{t('newVersionAvailable')}</p>
            <p className="text-muted-foreground text-xs leading-tight">
              {t('currentVersionLabel')}: v{normalizedCurrentVersion} · {t('latestVersionLabel')}: v
              {normalizedLatestVersion}
            </p>
          </div>
          {isSafariBrowser ? (
            safariDmgUrl ? (
              <a
                href={safariDmgUrl}
                target="_blank"
                rel="noreferrer"
                className="border-warning/40 text-foreground hover:bg-warning/10 shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
              >
                {t('updateNow')}
              </a>
            ) : (
              <span className="text-muted-foreground shrink-0 text-xs leading-tight">
                {t('safariUpdateNotSynced')}
              </span>
            )
          ) : (
            <a
              href={latestReleaseUrl}
              target="_blank"
              rel="noreferrer"
              className="border-warning/40 text-foreground hover:bg-warning/10 shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
            >
              {t('updateNow')}
            </a>
          )}
        </div>
      </Card>
    )
  );
}
