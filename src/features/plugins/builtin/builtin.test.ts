import { describe, expect, it } from 'vitest';

import { NATIVE_HANDLER_BINDINGS } from '@/pages/content/pluginNativeRegistration';

import { checkPrimitivesAreShippable } from '../../../../scripts/lib/pluginChecks';
import { validateManifest } from '../manifest/validate';
import { activateChatGptFolders } from './chatgptFolders';
import { HIDE_FILED_SETTING } from './chatgptFolders/chatgptHideFiled';
import { BUILTIN_PLUGINS, NATIVE_BUILTIN_PLUGIN_IDS } from './index';

describe('BUILTIN_PLUGINS', () => {
  it('every builtin manifest passes validation', () => {
    for (const m of BUILTIN_PLUGINS) {
      expect(validateManifest(m).success).toBe(true);
    }
  });

  it('every builtin engine floor covers the primitives and params it uses', () => {
    for (const m of BUILTIN_PLUGINS) {
      expect(checkPrimitivesAreShippable(m, `builtin ${m.id}`)).toEqual([]);
    }
  });

  it('includes the formula-copy native function plugin scoped to Claude/ChatGPT', () => {
    const fc = BUILTIN_PLUGINS.find((m) => m.id === 'voyager.formula-copy');
    expect(fc).toBeDefined();
    expect(fc?.matches).toEqual([
      'https://claude.ai/*',
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
    ]);
    // Its behaviour is the formulaCopy primitive, invoked through a native op.
    expect(fc?.contributes.styles ?? []).toEqual([]);
    expect(fc?.contributes.domOps).toEqual([{ op: 'native', handler: 'formulaCopy', params: {} }]);
    expect(fc?.requires).toEqual({ handlers: ['formulaCopy'] });
    expect(fc?.i18n?.zh?.name).toBe('公式复制');
    expect(fc?.i18n?.ja?.description).toContain('LaTeX');
  });

  it('includes the input Vim native function plugin scoped to Claude/ChatGPT', () => {
    const vim = BUILTIN_PLUGINS.find((m) => m.id === 'voyager.input-vim');
    expect(vim).toBeDefined();
    expect(vim?.matches).toEqual([
      'https://claude.ai/*',
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
    ]);
    expect(vim?.contributes.styles ?? []).toEqual([]);
    expect(vim?.contributes.domOps).toEqual([{ op: 'native', handler: 'vimInput', params: {} }]);
    expect(vim?.requires).toEqual({ handlers: ['vimInput'], semantic: ['composer'] });
    expect(vim?.i18n?.zh?.name).toBe('Vim 输入');
  });

  it('includes the ChatGPT export native function plugin scoped to ChatGPT', () => {
    const exportPlugin = BUILTIN_PLUGINS.find((m) => m.id === 'voyager.chatgpt-export');
    expect(exportPlugin).toBeDefined();
    expect(exportPlugin?.matches).toEqual(['https://chatgpt.com/*', 'https://chat.openai.com/*']);
    expect(exportPlugin?.contributes.styles ?? []).toEqual([]);
    expect(exportPlugin?.contributes.domOps ?? []).toEqual([]);
    expect(exportPlugin?.i18n?.zh?.name).toBe('ChatGPT · 对话导出');
  });

  it('keeps temporary-chat handoff separate from conversation export', () => {
    const handoff = BUILTIN_PLUGINS.find(
      (plugin) => plugin.id === 'voyager.chatgpt-temporary-handoff',
    );
    expect(handoff).toBeDefined();
    expect(handoff?.matches).toEqual(['https://chatgpt.com/*', 'https://chat.openai.com/*']);
    expect(handoff?.contributes.styles ?? []).toEqual([]);
    expect(handoff?.contributes.domOps ?? []).toEqual([]);
    expect(handoff?.i18n?.zh?.name).toBe('ChatGPT · 临时对话反悔');
    expect(handoff?.i18n?.zh_TW?.name).toBe('ChatGPT · 暫時對話反悔');
    expect(handoff?.id).not.toBe('voyager.chatgpt-export');
  });

  it('includes the Claude timeline native function plugin', () => {
    const timeline = BUILTIN_PLUGINS.find((m) => m.id === 'voyager.claude-timeline');
    expect(timeline).toBeDefined();
    expect(timeline?.matches).toEqual(['https://claude.ai/*']);
    expect(timeline?.contributes.styles ?? []).toEqual([]);
    // Its behaviour is the turnNavigator primitive; Claude keeps the guide
    // closed while an artifact frame is open, and names each thread's conversation.
    expect(timeline?.contributes.domOps).toEqual([
      {
        op: 'native',
        handler: 'turnNavigator',
        params: {
          yieldWhen: 'iframe[src*="claudeusercontent.com"]',
          conversationIdAttribute: 'data-conv-id',
        },
      },
    ]);
    expect(timeline?.engine).toBe('>=1.6.0');
    expect(timeline?.requires).toEqual({ handlers: ['turnNavigator'], semantic: ['userTurn'] });
    expect(timeline?.contributes.settings?.timelineStyle).toEqual({
      type: 'select',
      label: 'Timeline style',
      default: 'dots',
      options: [
        { value: 'dots', label: 'Nodes' },
        { value: 'compact', label: 'Compact' },
        { value: 'ruler', label: 'Ruler' },
      ],
    });
    expect(timeline?.i18n?.zh?.name).toBe('Claude · 时间线');
    expect(timeline?.i18n?.zh?.settings?.timelineStyle?.label).toBe('时间线样式');
  });

  it("includes the ChatGPT timeline, which needs the engine that reads a turn's item", () => {
    const timeline = BUILTIN_PLUGINS.find((m) => m.id === 'voyager.chatgpt-timeline');
    expect(timeline).toBeDefined();
    expect(timeline?.matches).toEqual(['https://chatgpt.com/*', 'https://chat.openai.com/*']);
    expect(timeline?.engine).toBe('>=1.6.0');
    expect(timeline?.contributes.domOps).toMatchObject([
      {
        op: 'native',
        handler: 'turnNavigator',
        params: {
          turnItem: '[data-turn-key]',
          conversationIdAttribute: 'data-chatgpt-selection-conversation-id',
        },
      },
    ]);
    expect(timeline?.requires).toEqual({ handlers: ['turnNavigator'], semantic: ['userTurn'] });
    expect(timeline?.contributes.settings?.timelineStyle?.default).toBe('dots');
    const locales = ['zh', 'zh_TW', 'ja', 'ko', 'fr', 'es', 'pt', 'ru', 'ar'] as const;
    for (const locale of locales) {
      expect(timeline?.i18n?.[locale]?.name, locale).toContain('ChatGPT');
      expect(timeline?.i18n?.[locale]?.description, locale).toContain('ChatGPT');
      expect(timeline?.i18n?.[locale]?.settings?.timelineStyle?.label, locale).toBeTruthy();
    }
  });

  it('binds ChatGPT folders, a ChatGPT-only native plugin, to its activate handler', () => {
    const folders = BUILTIN_PLUGINS.find((m) => m.id === 'voyager.chatgpt-folders');
    expect(folders?.matches).toEqual(['https://chatgpt.com/*', 'https://chat.openai.com/*']);
    // Still bound by id: its only contribution is a setting, no native op.
    expect(folders?.contributes.domOps).toBeUndefined();
    expect(folders?.i18n?.zh?.name).toBe('ChatGPT · 文件夹');
    // Manifest -> handler and handler -> manifest.
    expect(NATIVE_BUILTIN_PLUGIN_IDS).toContain('voyager.chatgpt-folders');
    expect(NATIVE_HANDLER_BINDINGS['voyager.chatgpt-folders']).toEqual({
      activate: activateChatGptFolders,
    });
  });

  it('describes ChatGPT folders and its opt-in hide setting in every locale', () => {
    const folders = BUILTIN_PLUGINS.find((m) => m.id === 'voyager.chatgpt-folders');
    // The key the plugin reads at activation is the key the manifest declares.
    expect(folders?.contributes.settings?.[HIDE_FILED_SETTING]).toMatchObject({
      type: 'boolean',
      default: false,
    });
    const locales = ['zh', 'zh_TW', 'ja', 'ko', 'fr', 'es', 'pt', 'ru', 'ar'] as const;
    for (const locale of locales) {
      expect(folders?.i18n?.[locale]?.description, locale).toContain('ChatGPT');
      expect(folders?.i18n?.[locale]?.description, locale).not.toBe(folders?.description);
      expect(folders?.i18n?.[locale]?.settings?.[HIDE_FILED_SETTING]?.label, locale).toBeTruthy();
    }
  });

  it('does not expose the retired Claude usage plugin', () => {
    const usage = BUILTIN_PLUGINS.find((m) => m.id === 'voyager.claude-usage');
    expect(usage).toBeUndefined();
  });
});
