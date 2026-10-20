import React from 'react';

import { Check, X } from 'lucide-react';

import type { TranslationKey } from '@/utils/translations';

import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import type { PromptDataTransferController } from '../hooks/usePromptDataTransfer';
import type { PromptManagerSettings } from '../hooks/usePromptManagerSettings';
import { PromptDataTransfer } from './PromptDataTransfer';
import { SettingToggleRow } from './SettingToggleRow';
import {
  IconChatGPT,
  IconClaude,
  IconDeepSeek,
  IconKimi,
  IconMidjourney,
  IconNotebookLM,
  IconQwen,
} from './WebsiteLogos';

export interface PromptManagerSettingsCardProps {
  settings: PromptManagerSettings;
  transfer: PromptDataTransferController;
  t: (key: TranslationKey) => string;
  isVisible: (settingId: string) => boolean;
  isPluginSite: boolean;
}

export function PromptManagerSettingsCard({
  settings,
  transfer,
  t,
  isVisible,
  isPluginSite,
}: PromptManagerSettingsCardProps) {
  const { values, onChange, customWebsites, newWebsiteInput, websiteError } = settings;

  return (
    <Card className="p-4">
      <CardTitle className="mb-4">{t('promptManagerOptions')}</CardTitle>
      <CardContent className="space-y-3 p-0">
        <SettingToggleRow
          id="hide-prompt-manager"
          settingId="hidePromptManager"
          label="hidePromptManager"
          hint="hidePromptManagerHint"
          checked={values.hidePromptManager}
          onChange={(hidePromptManager) => onChange({ hidePromptManager })}
          isVisible={isVisible}
          unmountWhenHidden
          t={t}
        />
        <SettingToggleRow
          id="prompt-trigger-mascot-logo"
          settingId="promptTriggerMascotLogo"
          label="promptTriggerMascotLogo"
          hint="promptTriggerMascotLogoHint"
          checked={values.promptTriggerMascotLogo}
          onChange={(promptTriggerMascotLogo) => onChange({ promptTriggerMascotLogo })}
          isVisible={isVisible}
          unmountWhenHidden
          t={t}
        />
        <SettingToggleRow
          id="slash-prompt-enabled"
          settingId="slashPromptEnabled"
          label="slashPromptEnabled"
          hint="slashPromptEnabledHint"
          checked={values.slashPromptEnabled}
          onChange={(slashPromptEnabled) => onChange({ slashPromptEnabled })}
          isVisible={isVisible}
          unmountWhenHidden
          t={t}
        />
        <SettingToggleRow
          id="prompt-insert-on-click"
          settingId="promptInsertOnClick"
          label="promptInsertOnClick"
          hint="promptInsertOnClickHint"
          checked={values.promptInsertOnClickEnabled}
          onChange={(promptInsertOnClickEnabled) => onChange({ promptInsertOnClickEnabled })}
          isVisible={isVisible}
          unmountWhenHidden
          t={t}
        />
        {isVisible('promptDataMigration') && <PromptDataTransfer t={t} transfer={transfer} />}
        {isVisible('customWebsites') && (
          <div>
            <Label className="mb-1 block text-sm font-medium">{t('customWebsites')}</Label>
            {!isPluginSite && (
              <p className="text-muted-foreground mb-2.5 text-xs leading-snug">
                {t('geminiOnlyNotice')}
              </p>
            )}
            {/* Prompt Manager coverage is separate from plugins on these shared sites. */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {[
                { domain: 'chatgpt.com', label: 'ChatGPT', Icon: IconChatGPT },
                { domain: 'claude.ai', label: 'Claude', Icon: IconClaude },
                { domain: 'deepseek.com', label: 'DeepSeek', Icon: IconDeepSeek },
                { domain: 'qwen.ai', label: 'Qwen', Icon: IconQwen },
                { domain: 'kimi.com', label: 'Kimi', Icon: IconKimi },
                { domain: 'notebooklm.google.com', label: 'NotebookLM', Icon: IconNotebookLM },
                { domain: 'midjourney.com', label: 'Midjourney', Icon: IconMidjourney },
              ].map(({ domain, label, Icon }) => {
                const isEnabled = customWebsites.includes(domain);
                return (
                  <button
                    key={domain}
                    type="button"
                    onClick={() => {
                      void settings.toggleQuickWebsite(domain, isEnabled);
                    }}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors ${
                      isEnabled
                        ? 'border-border bg-secondary text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground border-border/70'
                    }`}
                    title={label}
                  >
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      <Icon />
                    </span>
                    <span className="truncate">{label}</span>
                    {isEnabled && (
                      <Check
                        className="text-primary size-3 shrink-0"
                        strokeWidth={2.5}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
            {customWebsites.length > 0 && (
              <div className="mb-3 space-y-1">
                {customWebsites.map((website) => (
                  <div
                    key={website}
                    className="bg-secondary/40 flex items-center justify-between gap-2 rounded-lg py-1 ps-2.5 pe-1"
                  >
                    <span className="text-foreground/90 min-w-0 truncate text-[13px]">
                      {website}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void settings.handleRemoveWebsite(website);
                      }}
                      className="text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-ring/60 flex size-6 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">{t('removeWebsite')}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Input
                  type="text"
                  value={newWebsiteInput}
                  onChange={(event) => settings.onWebsiteInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void settings.handleAddWebsite();
                  }}
                  placeholder={t('customWebsitesPlaceholder')}
                  className="flex-1"
                />
                <Button
                  onClick={() => {
                    void settings.handleAddWebsite();
                  }}
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                >
                  {t('addWebsite')}
                </Button>
              </div>
              {websiteError && <p className="text-destructive text-xs">{websiteError}</p>}
            </div>
            <p className="text-muted-foreground mt-3 text-xs leading-snug">
              {t('customWebsitesNote')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
