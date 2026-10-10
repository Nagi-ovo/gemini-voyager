import { useMemo, useRef, useState } from 'react';

import { Check, Copy } from 'lucide-react';

import {
  MAX_PLUGIN_REQUEST_CHARS,
  authoringSiteForUrl,
  authoringSites,
  buildPluginAuthoringPrompt,
} from '@/features/plugins/local/pluginAuthoringPrompt';
import { previewPlugin } from '@/features/plugins/local/pluginPreview';
import { type CheckedPluginReply, checkPluginReply } from '@/features/plugins/local/pluginReply';
import type { TranslationKey } from '@/utils/translations';

import { Button } from '../../../components/ui/button';
import type { LocalPluginsController } from '../hooks/useLocalPlugins';
import { LocalPluginCssSource } from './LocalPluginCssSource';
import { LocalPluginInspection } from './LocalPluginInspection';
import { LocalPluginIssueList } from './LocalPluginIssueList';
import { REPLY_PROBLEM_KEYS, changeText, warningText } from './localPluginPreviewText';

const FIELD_CLASS =
  'bg-background border-border focus:ring-primary/50 w-full rounded-md border p-2 text-[11px] focus:ring-2 focus:outline-none';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * One sentence → a prompt the user sends to any AI themselves → the pasted reply
 * is checked by the local plugin gate, previewed in plain language, and imported
 * (disabled) through the same `importLocalPlugin` path as a pasted manifest.
 * Nothing here sends, opens or fetches anything; the reply step works on its
 * own, because the popup closes while the user is in their AI tab.
 */
export function LocalPluginComposer({
  t,
  local,
  activeUrl,
}: {
  t: (key: TranslationKey) => string;
  local: LocalPluginsController;
  activeUrl?: string;
}) {
  const sites = authoringSites();
  const [request, setRequest] = useState('');
  // The site a reply is checked against: the active tab's, or the user's pick.
  // With neither, the picker only shows a default and nothing is compared.
  const [picked, setPicked] = useState(() => {
    const activeSite = authoringSiteForUrl(activeUrl);
    return { id: activeSite?.id ?? sites[0]?.id ?? '', chosen: activeSite !== null };
  });
  const siteId = picked.id;
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copy, setCopy] = useState<CopyState>('idle');
  const [reply, setReply] = useState('');
  const [checked, setChecked] = useState<CheckedPluginReply | null>(null);
  const [checking, setChecking] = useState(false);
  const [details, setDetails] = useState(false);
  const [changedSinceReview, setChangedSinceReview] = useState(false);
  const checkRun = useRef(0);

  const site = sites.find((candidate) => candidate.id === siteId) ?? null;
  const targetSite = picked.chosen ? site : null;
  const preview = useMemo(
    () =>
      checked?.ok
        ? previewPlugin(checked.manifest, {
            previousVersion: checked.previousVersion,
            targetSite,
          })
        : null,
    [checked, targetSite],
  );

  const writePrompt = (): void => {
    if (!site || request.trim() === '') return;
    setPrompt(buildPluginAuthoringPrompt(request, site));
    setCopy('idle');
  };

  const copyPrompt = async (): Promise<void> => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };

  const changeReply = (value: string): void => {
    checkRun.current += 1;
    setReply(value);
    setChecked(null);
    setChecking(false);
    setDetails(false);
    setChangedSinceReview(false);
  };

  /** Check the reply on screen; false when an edit or a newer check superseded it. */
  const checkReply = async (): Promise<boolean> => {
    const run = (checkRun.current += 1);
    local.clearResult();
    setChangedSinceReview(false);
    setChecking(true);
    let outcome: CheckedPluginReply;
    try {
      outcome = await checkPluginReply(reply);
    } catch (error) {
      outcome = {
        ok: false,
        issues: [{ path: '', message: error instanceof Error ? error.message : String(error) }],
      };
    }
    if (run !== checkRun.current) return false;
    setChecked(outcome);
    setChecking(false);
    return true;
  };

  /** Close the preview; like an edit, it starts a new run so no pending result reopens it. */
  const dismissPreview = (): void => {
    checkRun.current += 1;
    // A superseded check returns before clearing this, so the dismiss clears it.
    setChecking(false);
    setChecked(null);
    setDetails(false);
    setChangedSinceReview(false);
  };

  const importPreviewed = async (): Promise<void> => {
    if (!checked?.ok) return;
    // Every edit or check bumps the run. If the reply changed while the import
    // ran, this outcome belongs to a reply no longer on screen: leave the new
    // one alone. A refusal wrote nothing, so it is not shown under the new reply
    // either; a finished import is still reported.
    const run = checkRun.current;
    const outcome = await local.importManifest(checked.raw, checked.installed);
    if (run !== checkRun.current) {
      if (!outcome.ok) local.clearResult();
      return;
    }
    if (outcome.ok) {
      changeReply('');
    } else if (outcome.changedSinceReview) {
      // Nothing was written: refresh the preview against what is installed now.
      if (await checkReply()) setChangedSinceReview(true);
    }
  };

  return (
    <div
      className="border-border/60 space-y-3 rounded-lg border p-3"
      data-testid="local-plugin-composer"
    >
      <p className="text-muted-foreground text-[11px]">{t('localPluginDescribeHint')}</p>

      <label className="block space-y-1">
        <span className="text-xs font-medium">{t('localPluginDescribeRequestLabel')}</span>
        <textarea
          value={request}
          maxLength={MAX_PLUGIN_REQUEST_CHARS}
          rows={2}
          placeholder={t('localPluginDescribeRequestPlaceholder')}
          onChange={(event) => {
            setRequest(event.target.value);
            setPrompt(null);
          }}
          className={FIELD_CLASS}
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground text-[11px]">
            {t('localPluginDescribeSiteLabel')}
          </span>
          <select
            value={siteId}
            onChange={(event) => {
              setPicked({ id: event.target.value, chosen: true });
              setPrompt(null);
            }}
            className="bg-background border-border focus:ring-primary/50 rounded-md border px-2 py-1 text-[11px] transition-all focus:ring-2 focus:outline-none"
          >
            {sites.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" disabled={!site || request.trim() === ''} onClick={writePrompt}>
          {t('localPluginDescribeBuildPrompt')}
        </Button>
      </div>

      {prompt && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">{t('localPluginDescribePromptLabel')}</span>
            <Button variant="outline" size="sm" onClick={() => void copyPrompt()}>
              <span className="inline-flex items-center gap-1.5">
                {copy === 'copied' ? (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {copy === 'copied'
                    ? t('localPluginDescribeCopied')
                    : t('localPluginDescribeCopy')}
                </span>
              </span>
            </Button>
          </div>
          <textarea
            readOnly
            value={prompt}
            rows={5}
            aria-label={t('localPluginDescribePromptLabel')}
            spellCheck={false}
            onFocus={(event) => event.target.select()}
            className={`${FIELD_CLASS} text-muted-foreground font-mono text-[10px]`}
          />
          {copy === 'failed' && (
            <p className="text-[11px] text-red-500" role="alert">
              {t('localPluginDescribeCopyFailed')}
            </p>
          )}
          <p className="text-muted-foreground text-[11px]">{t('localPluginDescribePromptHint')}</p>
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-xs font-medium">{t('localPluginDescribeReplyLabel')}</span>
        <textarea
          value={reply}
          rows={4}
          spellCheck={false}
          placeholder={t('localPluginDescribeReplyPlaceholder')}
          onChange={(event) => changeReply(event.target.value)}
          className={`${FIELD_CLASS} font-mono`}
        />
      </label>
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={checking || local.busy || reply.trim() === ''}
          onClick={() => void checkReply()}
        >
          {t('localPluginDescribeCheck')}
        </Button>
      </div>

      {checked && !checked.ok && (
        <div
          className="text-[11px] text-red-500"
          role="alert"
          data-testid="local-plugin-reply-error"
        >
          {'problem' in checked ? (
            <p>{t(REPLY_PROBLEM_KEYS[checked.problem])}</p>
          ) : (
            <>
              <p>{t('localPluginsRejected')}</p>
              <LocalPluginIssueList issues={checked.issues} />
            </>
          )}
        </div>
      )}

      {changedSinceReview && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400" role="alert">
          {t('localPluginChangedSinceReview')}
        </p>
      )}

      {checked?.ok && preview && (
        <div
          className="border-border/60 bg-muted/30 space-y-2 rounded-md border p-3"
          data-testid="local-plugin-preview"
        >
          <p className="text-xs font-medium">{t('localPluginPreviewTitle')}</p>
          <div>
            <p className="text-sm leading-snug font-medium break-words">
              {preview.name}{' '}
              <span className="text-muted-foreground font-mono text-[10px]">
                {checked.manifest.id} · v{checked.manifest.version}
              </span>
            </p>
            <p className="text-muted-foreground text-[11px] break-words">{preview.description}</p>
          </div>
          <p className="text-[11px]">
            <span className="text-muted-foreground">{t('localPluginInspectSites')}: </span>
            {preview.sites.join(', ')}
          </p>
          <div>
            <p className="text-muted-foreground text-[11px]">{t('localPluginPreviewChanges')}</p>
            <ul className="mt-0.5 list-disc space-y-0.5 ps-4 text-[11px] break-words">
              {preview.changes.map((change, index) => (
                <li key={index}>{changeText(t, change)}</li>
              ))}
            </ul>
          </div>
          <LocalPluginCssSource css={preview.css} label={t('localPluginInspectCss')} />
          {preview.warnings.length > 0 && (
            <div className="text-amber-700 dark:text-amber-400" data-testid="local-plugin-warnings">
              <p className="text-[11px] font-medium">{t('localPluginPreviewWarnings')}</p>
              <ul className="mt-0.5 list-disc space-y-0.5 ps-4 text-[11px]">
                {preview.warnings.map((warning, index) => (
                  <li key={index}>{warningText(t, warning)}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={() => setDetails((value) => !value)}
            aria-expanded={details}
            className="text-muted-foreground hover:text-foreground text-[11px] font-medium transition-colors"
          >
            {details ? t('localPluginsHideDetails') : t('localPluginsInspect')}
          </button>
          {details && <LocalPluginInspection manifest={checked.manifest} t={t} />}
          <p className="text-muted-foreground text-[11px]">{t('localPluginPreviewLandsOff')}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={local.busy} onClick={dismissPreview}>
              {t('localPluginsCancel')}
            </Button>
            <Button size="sm" disabled={local.busy} onClick={() => void importPreviewed()}>
              {t('localPluginDescribeImport')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
