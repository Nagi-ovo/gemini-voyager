import { useRef, useState } from 'react';

import { ClipboardPaste, Download, Trash2, Upload, WandSparkles } from 'lucide-react';

import type { TranslationKey } from '@/utils/translations';

import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { type LocalPluginEntry, useLocalPlugins } from '../hooks/useLocalPlugins';
import { LocalPluginComposer } from './LocalPluginComposer';
import { LocalPluginInspection } from './LocalPluginInspection';
import { LocalPluginIssueList as IssueList } from './LocalPluginIssueList';

function LocalPluginRow({
  entry,
  t,
  onExport,
  onRemove,
}: {
  entry: LocalPluginEntry;
  t: (key: TranslationKey) => string;
  onExport: (entry: LocalPluginEntry) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const name =
    entry.manifest?.name ??
    (typeof entry.record.manifest.name === 'string' ? entry.record.manifest.name : entry.id);
  const version =
    entry.manifest?.version ??
    (typeof entry.record.manifest.version === 'string' ? entry.record.manifest.version : '');
  return (
    <div className="border-border/60 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug font-medium break-words">{name}</p>
          <p className="text-muted-foreground font-mono text-[10px] break-all">
            {version ? `${entry.id} · v${version}` : entry.id}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {entry.manifest && (
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="text-muted-foreground hover:text-foreground rounded px-1.5 py-1 text-[11px] font-medium transition-colors"
            >
              {open ? t('localPluginsHideDetails') : t('localPluginsInspect')}
            </button>
          )}
          <button
            type="button"
            onClick={() => onExport(entry)}
            title={t('pm_export')}
            aria-label={`${t('pm_export')} ${name}`}
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            title={t('localPluginsRemove')}
            aria-label={`${t('localPluginsRemove')} ${name}`}
            className="text-muted-foreground rounded p-1 transition-colors hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {confirming && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
            {t('localPluginsCancel')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => onRemove(entry.id)}>
            {t('localPluginsConfirmRemove')}
          </Button>
        </div>
      )}
      {!entry.manifest && (
        <div className="mt-1 text-[11px] text-red-500/80">
          <p>{t('localPluginsStoredInvalid')}</p>
          <IssueList issues={entry.issues} />
        </div>
      )}
      {open && entry.manifest && <LocalPluginInspection manifest={entry.manifest} t={t} />}
    </div>
  );
}

/**
 * Import, inspect, export and remove the user's own declarative plugins. Turning
 * one on stays in `PluginManager`, which owns the host-permission flow, so an
 * import can never enable anything by itself.
 */
export function LocalPluginsPanel({
  t,
  activeUrl,
}: {
  t: (key: TranslationKey) => string;
  /** The active tab's URL, used to preselect the site when describing a change. */
  activeUrl?: string;
}) {
  const local = useLocalPlugins();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [describeOpen, setDescribeOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const result = local.result;
  const imported = result?.ok ? result.manifest : null;

  return (
    <Card className="p-4 transition-all hover:shadow-md">
      <CardTitle className="mb-2">{t('localPluginsTitle')}</CardTitle>
      <CardContent className="space-y-3 p-0">
        <p className="text-muted-foreground text-xs">{t('localPluginsDescription')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={local.busy}
            onClick={() => fileInput.current?.click()}
          >
            <span className="inline-flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('localPluginsImportFiles')}</span>
            </span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={local.busy}
            aria-expanded={pasteOpen}
            onClick={() => setPasteOpen((value) => !value)}
          >
            <span className="inline-flex items-center gap-1.5">
              <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('localPluginsPasteJson')}</span>
            </span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="col-span-2 w-full"
            aria-expanded={describeOpen}
            onClick={() => setDescribeOpen((value) => !value)}
          >
            <span className="inline-flex items-center gap-1.5">
              <WandSparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('localPluginDescribeOpen')}</span>
            </span>
          </Button>
        </div>
        {describeOpen && <LocalPluginComposer t={t} local={local} activeUrl={activeUrl} />}
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".json,.css,application/json,text/css"
          aria-label={t('localPluginsImportFiles')}
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length > 0) void local.importFiles(files);
          }}
        />
        {pasteOpen && (
          <div className="space-y-2">
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              aria-label={t('localPluginsPasteLabel')}
              spellCheck={false}
              rows={6}
              placeholder='{ "id": "me.my-tweak", … }'
              className="bg-background border-border focus:ring-primary/50 w-full rounded-md border p-2 font-mono text-[11px] focus:ring-2 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPasteOpen(false)}>
                {t('localPluginsCancel')}
              </Button>
              <Button
                size="sm"
                disabled={local.busy || pasteText.trim() === ''}
                onClick={() => void local.importText(pasteText)}
              >
                {t('localPluginsCheckAndImport')}
              </Button>
            </div>
          </div>
        )}

        {result && !result.ok && (
          <div className="text-[11px] text-red-500" role="alert">
            <p>{t('localPluginsRejected')}</p>
            <IssueList issues={result.issues} />
            {result.previousVersion && (
              <p className="text-muted-foreground mt-1">
                {t('localPluginsPreviousKept').replace('{version}', result.previousVersion)}
              </p>
            )}
          </div>
        )}
        {imported && (
          <div role="status">
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
              {t('localPluginsImported')
                .replace('{name}', imported.name)
                .replace('{version}', imported.version)}
            </p>
            <LocalPluginInspection manifest={imported} t={t} />
          </div>
        )}

        {local.entries.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t('localPluginsEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {local.entries.map((entry) => (
              <LocalPluginRow
                key={entry.id}
                entry={entry}
                t={t}
                onExport={local.exportPlugin}
                onRemove={(id) => void local.remove(id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
