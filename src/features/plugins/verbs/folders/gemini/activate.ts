/**
 * The folders primitive on Gemini: a lease on Gemini's folder session (which
 * the content script's start point also holds, so the data, the account's
 * route, the popup's answers and Folder-as-Project outlive the plugin), and
 * the view that shows it. Start-up runs as one of the scope's effects, so
 * turning the folders off while it still awaits waits for it and leaves
 * nothing behind.
 */
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings } from '@/features/plugins/types';
import { openGeminiFolderSession } from '@/pages/content/folder/session/geminiFolderSessions';

import { HIDE_FILED_SETTING } from '../hideFiled';
import { GeminiFoldersView } from './view';

export interface GeminiFoldersRuntime {
  /** Settles once start-up finished, or stopped early because the folders went off. */
  readonly started: Promise<void>;
  /** `hideFiledChats` hides the sidebar rows of filed chats, in place. */
  updateSettings(settings: PluginSettings): void;
  /** 1 while the folders show (the section, or the floating panel or its button), else 0. */
  onScreen(): number;
  /** The view while it runs; for tests that drive the page. */
  view(): GeminiFoldersView | null;
}

export function startGeminiFolders(
  scope: PluginScope,
  settings: PluginSettings = {},
): GeminiFoldersRuntime {
  let hideArchived = settings[HIDE_FILED_SETTING] === true;
  let view: GeminiFoldersView | null = null;
  const runtime = {
    updateSettings: (next: PluginSettings) => {
      hideArchived = next[HIDE_FILED_SETTING] === true;
      view?.setHideArchived(hideArchived);
    },
    onScreen: () => (view?.onScreen ? 1 : 0),
    view: () => view,
  };
  if (scope.isDisposed) return { started: Promise.resolve(), ...runtime };

  async function run(): Promise<void> {
    const lease = openGeminiFolderSession();
    // Last on stop: the view detaches first, then the lease drains.
    scope.effect(() => () => lease.release(), 'gemini-folders:session');
    await lease.ready;
    if (scope.isDisposed) return;
    const shown = new GeminiFoldersView(lease.session, hideArchived);
    view = shown;
    scope.effect(
      () => () => {
        if (view === shown) view = null;
        shown.destroy();
      },
      'gemini-folders:view',
    );
    await shown.start();
  }

  let started!: Promise<void>;
  scope.effect(() => {
    started = run().catch((error) => {
      console.error('[FolderManager] Start error:', error);
    });
    return started.then(() => () => {});
  }, 'gemini-folders:start');
  return { started, ...runtime };
}
