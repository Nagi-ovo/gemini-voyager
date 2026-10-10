import { useEffect, useState } from 'react';

import type { PluginManifest } from '@/features/plugins/types';
import type { TranslationKey } from '@/utils/translations';

import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { openChatGptExportInTab } from '../utils/chatgptExportEntry';
import { hasPluginSiteAccess, setPluginEnabledWithSiteAccess } from '../utils/pluginEnablement';

const NOTE_TONE: Readonly<Partial<Record<TranslationKey, string>>> = {
  pluginPermissionDenied: 'text-red-500',
  pluginUnsupportedPlatform: 'text-red-500',
};

export interface ChatGptExportCardProps {
  /** The `voyager.chatgpt-export` manifest listed for the active ChatGPT tab. */
  readonly plugin: PluginManifest;
  readonly enabled: boolean;
  readonly activeTabId: number | null;
  readonly activeUrl?: string;
  /** Called after the tab opened its export dialog, e.g. to close the popup. */
  readonly onOpened?: () => void;
  readonly t: (key: TranslationKey) => string;
}

/**
 * The ChatGPT popup's direct entry to conversation export: turns the exporter
 * on through the same host-access flow as its plugin toggle, then opens the
 * page's existing export dialog.
 */
export function ChatGptExportCard({
  plugin,
  enabled,
  activeTabId,
  activeUrl,
  onOpened,
  t,
}: ChatGptExportCardProps) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<TranslationKey | null>(null);
  // Enabled without the site grant (the prompt was denied after Chrome closed
  // the popup) cannot export; offer "Turn on" again so the grant is requested.
  const [accessMissing, setAccessMissing] = useState(false);
  const ready = enabled && !accessMissing;

  useEffect(() => {
    if (!enabled) {
      setAccessMissing(false);
      return;
    }
    let active = true;
    void hasPluginSiteAccess(plugin, activeUrl).then((granted) => {
      if (active) setAccessMissing(!granted);
    });
    return () => {
      active = false;
    };
  }, [activeUrl, enabled, plugin]);

  const turnOn = async () => {
    setNote(null);
    setBusy(true);
    try {
      const outcome = await setPluginEnabledWithSiteAccess(plugin, true, activeUrl, () => {});
      if (outcome === 'enabled') setAccessMissing(false);
      else if (outcome === 'denied') setNote('pluginPermissionDenied');
      else if (outcome === 'unsupported') setNote('pluginUnsupportedPlatform');
    } finally {
      setBusy(false);
    }
  };

  const exportNow = async () => {
    setNote(null);
    if (activeTabId === null) {
      setNote('chatgptExportReloadTab');
      return;
    }
    setBusy(true);
    try {
      const result = await openChatGptExportInTab(activeTabId);
      if (result === 'opened') {
        onOpened?.();
        return;
      }
      setNote(
        result === 'no-conversation' ? 'chatgptExportNoConversation' : 'chatgptExportReloadTab',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      style={{ order: -2 }}
      className="border-primary/20 p-4 transition-all hover:shadow-md"
      data-testid="chatgpt-export-card"
    >
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t('chatgptExportCardTitle')}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t(ready ? 'chatgptExportCardOnHint' : 'chatgptExportCardOffHint')}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant={ready ? 'default' : 'outline'}
            disabled={busy}
            onClick={() => void (ready ? exportNow() : turnOn())}
            className="shrink-0"
          >
            {t(ready ? 'pm_export' : 'chatgptExportTurnOn')}
          </Button>
        </div>
        {note && (
          <p
            role="status"
            className={`mt-2 text-[11px] leading-snug ${NOTE_TONE[note] ?? 'text-muted-foreground'}`}
          >
            {t(note)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
