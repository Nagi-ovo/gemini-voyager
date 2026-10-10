import { useState } from 'react';

import { Check, Link } from 'lucide-react';

import { WRITE_PLUGIN_SKILL_URL } from '@/features/plugins/local/authoring/skillLink';
import type { TranslationKey } from '@/utils/translations';

import { Button } from '../../../components/ui/button';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * For users with a coding agent: the public write-voyager-plugin skill, which
 * has the agent write plugin.json and style.css and check them offline. The
 * popup only copies the link; it opens and sends nothing.
 */
export function LocalPluginSkillLink({ t }: { t: (key: TranslationKey) => string }) {
  const [copy, setCopy] = useState<CopyState>('idle');

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(WRITE_PLUGIN_SKILL_URL);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };

  return (
    <div className="space-y-1.5" data-testid="local-plugin-skill-link">
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-[11px]">{t('localPluginSkillHint')}</p>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => void copyLink()}>
          <span className="inline-flex items-center gap-1.5">
            {copy === 'copied' ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Link className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>
              {copy === 'copied' ? t('localPluginDescribeCopied') : t('localPluginSkillCopy')}
            </span>
          </span>
        </Button>
      </div>
      {copy === 'failed' && (
        <div className="space-y-1" role="alert">
          <p className="text-[11px] text-red-500">{t('localPluginSkillCopyFailed')}</p>
          <input
            readOnly
            value={WRITE_PLUGIN_SKILL_URL}
            aria-label={t('localPluginSkillCopy')}
            onFocus={(event) => event.target.select()}
            className="bg-background border-border w-full rounded-md border p-1.5 font-mono text-[10px]"
          />
        </div>
      )}
    </div>
  );
}
