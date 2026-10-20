import type { CSSProperties } from 'react';

import { TriangleAlert, X } from 'lucide-react';

import { Card } from '@/components/ui/card';
import {
  type NativeHealthEntry,
  type NativeHealthFeature,
  buildNativeHealthIssueUrl,
} from '@/core/gemini/nativeHealth';
import { buildVoyagerDiagnostics } from '@/core/services/DiagnosticsExportService';
import { isRTLLanguage } from '@/core/utils/rtl';
import type { TranslationKey } from '@/utils/translations';

const FEATURE_MESSAGE_KEYS: Record<NativeHealthFeature, TranslationKey> = {
  timeline: 'nativeHealthTimeline',
  'chat-width': 'nativeHealthChatWidth',
  folders: 'nativeHealthFolders',
  export: 'nativeHealthExport',
  composer: 'nativeHealthComposer',
};

export interface NativeHealthNoticeProps {
  entries: readonly NativeHealthEntry[];
  /** The popup UI language; the popup document itself carries no direction. */
  language: string;
  onDismiss: () => void;
  t: (key: TranslationKey) => string;
  style?: CSSProperties;
}

/** Tells the user that a Voyager feature lost its Gemini anchor on the active page. */
export function NativeHealthNotice({
  entries,
  language,
  onDismiss,
  t,
  style,
}: NativeHealthNoticeProps) {
  if (entries.length === 0) return null;
  const { extension, environment } = buildVoyagerDiagnostics();
  const issueUrl = buildNativeHealthIssueUrl(entries, {
    extensionVersion: extension.version,
    browser: [environment.browser, environment.browserVersion].filter(Boolean).join(' '),
  });

  return (
    <Card
      style={style}
      dir={isRTLLanguage(language) ? 'rtl' : 'ltr'}
      className="border-warning/40 bg-warning/5 p-3"
      role="status"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          {entries.map((entry) => (
            <p key={entry.feature} className="text-sm leading-snug font-medium">
              {t(FEATURE_MESSAGE_KEYS[entry.feature])}
            </p>
          ))}
          <p className="text-muted-foreground text-xs leading-snug">
            {t('nativeHealthCause')}{' '}
            <a
              href={issueUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline underline-offset-2"
            >
              {t('nativeHealthReport')}
            </a>
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:bg-secondary hover:text-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors"
          aria-label={t('nativeHealthDismiss')}
          title={t('nativeHealthDismiss')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </Card>
  );
}
