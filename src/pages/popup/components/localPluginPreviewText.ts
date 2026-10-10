import type {
  PluginPreviewChange,
  PluginPreviewTarget,
  PluginPreviewWarning,
} from '@/features/plugins/local/pluginPreview';
import type { PluginReplyProblem } from '@/features/plugins/local/pluginReply';
import {
  type SemanticSelectorKey,
  isSemanticSelectorKey,
} from '@/features/plugins/sites/semanticKeys';
import type { TranslationKey } from '@/utils/translations';

type Translate = (key: TranslationKey) => string;

const TARGET_KEYS: Readonly<Record<SemanticSelectorKey, TranslationKey>> = {
  userTurn: 'localPluginTargetUserTurn',
  assistantTurn: 'localPluginTargetAssistantTurn',
  thinkingBlock: 'localPluginTargetThinkingBlock',
  codeBlock: 'localPluginTargetCodeBlock',
  composer: 'localPluginTargetComposer',
  sidebar: 'localPluginTargetSidebar',
  sidePanel: 'localPluginTargetSidePanel',
  headerActions: 'localPluginTargetHeaderActions',
  scrollContainer: 'localPluginTargetScrollContainer',
};

export const REPLY_PROBLEM_KEYS: Readonly<Record<PluginReplyProblem, TranslationKey>> = {
  empty: 'localPluginReplyEmpty',
  'too-long': 'localPluginReplyTooLong',
  'no-json': 'localPluginReplyNoJson',
  'multiple-json': 'localPluginReplyMultipleJson',
};

/** Fill `{name}` placeholders; values are inserted literally. */
function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    template,
  );
}

function targetText(t: Translate, target: PluginPreviewTarget): string {
  if (target.kind === 'css')
    return fill(t('localPluginTargetSelector'), { selector: target.selector });
  return isSemanticSelectorKey(target.key) ? t(TARGET_KEYS[target.key]) : target.key;
}

export function changeText(t: Translate, change: PluginPreviewChange): string {
  switch (change.kind) {
    case 'css':
      return fill(t('localPluginChangeCss'), { chars: change.chars });
    case 'addClass':
      return fill(t('localPluginChangeAddClass'), {
        target: targetText(t, change.target),
        className: change.className,
      });
    case 'hide':
      return fill(t('localPluginChangeHide'), { target: targetText(t, change.target) });
    case 'setStyle':
      return fill(t('localPluginChangeSetStyle'), {
        target: targetText(t, change.target),
        styles: change.styles,
      });
    case 'setAttribute':
      return fill(t('localPluginChangeSetAttribute'), {
        target: targetText(t, change.target),
        name: change.name,
        value: change.value,
      });
    case 'native':
      return fill(t('localPluginChangeNative'), { handler: change.handler });
    case 'setting':
      return fill(t('localPluginChangeSetting'), { label: change.label });
    case 'theme':
      return fill(t('localPluginChangeTheme'), { color: change.brand });
  }
}

export function warningText(t: Translate, warning: PluginPreviewWarning): string {
  switch (warning.kind) {
    case 'css':
      return t('localPluginWarnCss');
    case 'raw-selector':
      return t('localPluginWarnSelector');
    case 'hides':
      return t('localPluginWarnHides');
    case 'not-on-site':
      return fill(t('localPluginWarnNotOnSite'), { site: warning.site });
    case 'theme':
      return t('localPluginWarnTheme');
    case 'native':
      return t('localPluginWarnNative');
    case 'replaces':
      return fill(t('localPluginWarnReplaces'), { version: warning.version });
  }
}
