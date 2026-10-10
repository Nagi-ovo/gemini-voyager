import type { ComponentProps } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CHATGPT_EXPORT_PLUGIN_ID } from '@/features/plugins/builtin/chatgptExport/openMessage';
import type { TranslationKey } from '@/utils/translations';

import type { PromptDataTransferController } from '../hooks/usePromptDataTransfer';
import { ChatGptExportCard } from './ChatGptExportCard';
import { LocalPluginsPanel } from './LocalPluginsPanel';
import { PluginManager } from './PluginManager';
import { PromptDataTransfer } from './PromptDataTransfer';

export function PluginSiteSettings({
  siteDomain,
  siteLabel,
  promptEnabled,
  onTogglePrompt,
  promptDataTransfer,
  plugins,
  exportEntry,
  t,
}: {
  siteDomain: string;
  siteLabel: string;
  promptEnabled: boolean;
  onTogglePrompt: () => void;
  promptDataTransfer: PromptDataTransferController;
  plugins: ComponentProps<typeof PluginManager>;
  /** Enabled state and target tab for the ChatGPT export card. */
  exportEntry?: {
    enabled: boolean;
    activeTabId: number | null;
    onOpened?: () => void;
  };
  t: (key: TranslationKey) => string;
}) {
  // Listed only where the exporter's `matches` cover the active tab (ChatGPT).
  const exportPlugin = plugins.manifests.find((plugin) => plugin.id === CHATGPT_EXPORT_PLUGIN_ID);
  return (
    <>
      {exportPlugin && exportEntry && (
        <ChatGptExportCard
          plugin={exportPlugin}
          enabled={exportEntry.enabled}
          activeTabId={exportEntry.activeTabId}
          activeUrl={plugins.activeUrl}
          onOpened={exportEntry.onOpened}
          t={t}
        />
      )}
      {siteDomain && (
        <Card
          style={{ order: -2 }}
          className="border-primary/20 p-4 transition-all hover:shadow-md"
        >
          <CardContent className="p-0">
            <div className="group flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Label
                  htmlFor="prompt-manager-site-enabled"
                  className="group-hover:text-primary cursor-pointer text-sm font-medium transition-colors"
                >
                  {t('enablePromptManagerOnSite').replace('{site}', siteLabel || siteDomain)}
                </Label>
                <p className="text-muted-foreground mt-1 text-xs">
                  {t('enablePromptManagerOnSiteHint')}
                </p>
              </div>
              <Switch
                id="prompt-manager-site-enabled"
                checked={promptEnabled}
                onChange={onTogglePrompt}
              />
            </div>
          </CardContent>
        </Card>
      )}
      {/* The shared prompt library remains available on third-party sites. */}
      <Card style={{ order: -2 }} className="border-primary/20 p-4">
        <CardContent className="p-0">
          <PromptDataTransfer t={t} transfer={promptDataTransfer} />
        </CardContent>
      </Card>
      <div style={{ order: -1 }} className="flex flex-col gap-4">
        <PluginManager {...plugins} />
        <LocalPluginsPanel t={t} activeUrl={plugins.activeUrl} />
      </div>
    </>
  );
}
