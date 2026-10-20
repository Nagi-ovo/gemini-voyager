import React from 'react';

import type { TranslationKey } from '@/utils/translations';

import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { SettingToggleRow } from './SettingToggleRow';

/** Every folder toggle the card edits; the popup owns the state and persistence. */
export interface FolderSettingsValues {
  folderEnabled: boolean;
  floatingModeEnabled: boolean;
  floatingOpenOnStart: boolean;
  hideArchivedConversations: boolean;
  folderSearchEnabled: boolean;
  folderProjectEnabled: boolean;
}

export type AiStructureCopyStatus = 'idle' | 'loading' | 'copied' | 'empty' | 'error';

export interface FolderSettingsCardProps {
  values: FolderSettingsValues;
  /** One key per call; the popup mirrors it into state and storage. */
  onChange: (patch: Partial<FolderSettingsValues>) => void;
  /** Account isolation is stored per platform, so the popup resolves the active one. */
  accountIsolation: {
    enabled: boolean;
    platformLabel: string;
    onChange: (enabled: boolean) => void;
  };
  aiStructureCopy: {
    status: AiStructureCopyStatus;
    onCopy: () => void;
  };
  /** Site capability and settings-search gate, keyed by the setting's search id. */
  isVisible: (settingId: string) => boolean;
  t: (key: TranslationKey) => string;
}

const AI_COPY_LABELS: Record<AiStructureCopyStatus, TranslationKey> = {
  idle: 'aiOrgCopyButton',
  loading: 'aiOrgCopyButton',
  copied: 'aiOrgCopied',
  empty: 'aiOrgNoConversations',
  error: 'aiOrgError',
};

export function FolderSettingsCard({
  values,
  onChange,
  accountIsolation,
  aiStructureCopy,
  isVisible,
  t,
}: FolderSettingsCardProps) {
  return (
    <Card className="p-4">
      <CardTitle className="mb-4">{t('folderOptions')}</CardTitle>
      <CardContent className="space-y-4 p-0">
        <SettingToggleRow
          id="folder-enabled"
          settingId="enableFolderFeature"
          label="enableFolderFeature"
          checked={values.folderEnabled}
          onChange={(folderEnabled) => onChange({ folderEnabled })}
          isVisible={isVisible}
          t={t}
        />
        <SettingToggleRow
          id="floating-mode"
          settingId="enableFolderFloatingMode"
          label="enableFolderFloatingMode"
          hint="enableFolderFloatingModeHint"
          experimental
          checked={values.floatingModeEnabled}
          onChange={(floatingModeEnabled) => onChange({ floatingModeEnabled })}
          isVisible={isVisible}
          t={t}
        />
        {values.floatingModeEnabled && (
          <div className="ps-4">
            <SettingToggleRow
              id="floating-open-on-start"
              settingId="openFloatingFolderOnStartup"
              label="openFloatingFolderOnStartup"
              hint="openFloatingFolderOnStartupHint"
              checked={values.floatingOpenOnStart}
              onChange={(floatingOpenOnStart) => onChange({ floatingOpenOnStart })}
              isVisible={isVisible}
              unmountWhenHidden
              t={t}
            />
          </div>
        )}
        <SettingToggleRow
          id="hide-archived"
          settingId="hideArchivedConversations"
          label="hideArchivedConversations"
          checked={values.hideArchivedConversations}
          onChange={(hideArchivedConversations) => onChange({ hideArchivedConversations })}
          isVisible={isVisible}
          t={t}
        />
        <SettingToggleRow
          id="folder-search-enabled"
          settingId="showFolderSearch"
          label="showFolderSearch"
          checked={values.folderSearchEnabled}
          onChange={(folderSearchEnabled) => onChange({ folderSearchEnabled })}
          isVisible={isVisible}
          t={t}
        />
        <SettingToggleRow
          id="account-isolation-enabled"
          settingId="enableAccountIsolation"
          label="enableAccountIsolation"
          hint="enableAccountIsolationHint"
          experimental
          extra={
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t('currentPlatform')}:</span>
              <span className="bg-secondary text-foreground rounded px-1.5 py-0.5 font-medium">
                {accountIsolation.platformLabel}
              </span>
            </div>
          }
          checked={accountIsolation.enabled}
          onChange={accountIsolation.onChange}
          isVisible={isVisible}
          t={t}
        />
        <SettingToggleRow
          id="folder-project-enabled"
          settingId="folderAsProject"
          label="folderAsProject_enable"
          hint="folderAsProject_description"
          experimental
          checked={values.folderProjectEnabled}
          onChange={(folderProjectEnabled) => onChange({ folderProjectEnabled })}
          isVisible={isVisible}
          t={t}
        />
        <div hidden={!isVisible('aiOrgCopy')} className="border-border/50 border-t pt-3">
          <Button
            variant="outline"
            className="w-full text-sm"
            onClick={aiStructureCopy.onCopy}
            disabled={aiStructureCopy.status === 'loading'}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <span
                className="material-symbols-outlined translate-y-px text-[16px] leading-none"
                style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}
              >
                {aiStructureCopy.status === 'copied' ? 'check' : 'content_copy'}
              </span>
              <span className="leading-5">{t(AI_COPY_LABELS[aiStructureCopy.status])}</span>
            </span>
          </Button>
          <p className="text-muted-foreground mt-1.5 text-center text-[11px] leading-tight">
            {t('aiOrgCopyHint')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
