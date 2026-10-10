import { useEffect, useMemo, useState } from 'react';

import { Copy, Download, FileJson, X } from 'lucide-react';

import type { NativeHealthEntry } from '@/core/gemini/nativeHealth';
import {
  type DiagnosticPluginInput,
  type VoyagerDiagnosticsPayload,
  buildVoyagerDiagnostics,
  copyVoyagerDiagnosticsMarkdown,
  downloadVoyagerDiagnostics,
  formatVoyagerDiagnosticsMarkdown,
} from '@/core/services/DiagnosticsExportService';

import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../../contexts/LanguageContext';

export interface DiagnosticsExportCardProps {
  activeUrl: string;
  loading?: boolean;
  /** Gemini anchors the active page could not find (empty when healthy). */
  nativeHealth?: readonly NativeHealthEntry[];
  plugins: readonly DiagnosticPluginInput[];
}

type CopyStatus = 'copying' | 'error' | 'idle' | 'success';

export function DiagnosticsExportCard({
  activeUrl,
  loading = false,
  nativeHealth = [],
  plugins,
}: DiagnosticsExportCardProps) {
  const { t } = useLanguage();
  const [payload, setPayload] = useState<VoyagerDiagnosticsPayload | null>(null);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const markdown = useMemo(
    () => (payload ? formatVoyagerDiagnosticsMarkdown(payload) : ''),
    [payload],
  );

  useEffect(() => {
    if (!payload) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPayload(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [payload]);

  const handlePreview = (): void => {
    setPayload(buildVoyagerDiagnostics({ activeUrl, nativeHealth, plugins }));
    setCopyStatus('idle');
  };

  const handleCopy = async (): Promise<void> => {
    if (!payload) return;
    setCopyStatus('copying');
    try {
      await copyVoyagerDiagnosticsMarkdown(payload);
      setCopyStatus('success');
    } catch {
      setCopyStatus('error');
    }
  };

  const copyLabel =
    copyStatus === 'copying'
      ? t('diagnosticsCopying')
      : copyStatus === 'success'
        ? t('diagnosticsCopied')
        : t('diagnosticsCopyMarkdown');

  return (
    <>
      <div className="border-border/60 bg-muted/30 flex items-center gap-3 rounded-xl border p-3">
        <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
          <FileJson className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-xs font-semibold">{t('diagnosticsTitle')}</p>
          <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">
            {t('diagnosticsHint')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 px-2.5 text-xs"
          disabled={loading}
          onClick={handlePreview}
        >
          {t('diagnosticsPreview')}
        </Button>
      </div>

      {payload && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPayload(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="diagnostics-dialog-title"
            className="border-border bg-background flex max-h-[calc(100vh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border shadow-2xl"
          >
            <div className="border-border/70 flex items-start justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <h2 id="diagnostics-dialog-title" className="text-sm font-semibold">
                  {t('diagnosticsPreviewTitle')}
                </h2>
                <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">
                  {t('diagnosticsPrivacyNote')}
                </p>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground shrink-0 rounded-md p-1 transition-colors"
                onClick={() => setPayload(null)}
                aria-label={t('diagnosticsClose')}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 p-3">
              <textarea
                readOnly
                dir="ltr"
                wrap="off"
                spellCheck={false}
                value={markdown}
                aria-label={t('diagnosticsPreviewTitle')}
                onFocus={(event) => event.currentTarget.select()}
                className="border-border bg-muted/35 text-foreground focus:ring-primary/40 h-[min(16rem,calc(100vh-12rem))] min-h-40 w-full resize-none overflow-auto rounded-xl border p-3 font-mono text-[10px] leading-relaxed outline-none focus:ring-2"
              />
              {copyStatus === 'error' && (
                <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400" role="status">
                  {t('diagnosticsCopyFailed')}
                </p>
              )}
            </div>

            <div className="border-border/70 flex items-center justify-end gap-2 border-t px-3 py-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 text-xs"
                onClick={() => downloadVoyagerDiagnostics(payload)}
              >
                <Download className="size-3.5 shrink-0" aria-hidden="true" />
                {t('diagnosticsDownloadJson')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="shrink-0 gap-1.5 text-xs"
                disabled={copyStatus === 'copying'}
                onClick={() => void handleCopy()}
              >
                <Copy className="size-3.5 shrink-0" aria-hidden="true" />
                {copyLabel}
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
