/**
 * Folders on the shared folder core for a plugin site: a folder section in the
 * site's sidebar (introduced once by a guide), the shared floating panel, and,
 * where the site offers them, "Move to folder" in a row's menu, a row dragged
 * onto a folder, and the site's own rename. `site` holds everything that is the
 * site's; everything created here is registered on `scope`.
 */
import type { ConversationReference } from '@/core/types/folder';
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { sendSiteOf, trackUserSends } from '@/features/plugins/sends/trackUserSends';
import type { PluginSettings, SiteAdapter } from '@/features/plugins/types';
import { watchRouteChanges } from '@/pages/content/utils/routeWatcher';
import { getTranslationSyncUnsafe as t, initI18n } from '@/utils/i18n';

import { SiteFolderGuide } from './folderGuide';
import { SiteFoldersView } from './foldersView';
import { HIDE_FILED_SETTING, SidebarHideFiled } from './hideFiled';
import { loadPanelPrefs } from './panelPrefs';
import { type DroppedConversation, bindSidebarRowDrag } from './rowDrag';
import { loadSectionPrefs } from './sectionPrefs';
import { SidebarWatcher } from './sidebarWatcher';
import { SidebarTitleSync } from './titleSync';
import type { SidebarConversation, SiteFoldersAdapter } from './types';

/** A sidebar row as the folder entry it files. */
function referenceOf(
  site: SiteFoldersAdapter,
  row: SidebarConversation,
  origin: string,
): DroppedConversation {
  return {
    conversationId: site.identity.storedId(row.id),
    title: site.sidebar.title(row) || t(site.messages.untitled),
    url: `${origin}${row.path}`,
  };
}

/**
 * Records when the user last sent to each chat, for the Activity view. A send
 * seen while the stored folders still load waits for them; the store refuses
 * edits until then, and the tracker has already let the send go.
 */
function trackActivity(
  scope: PluginScope,
  key: string,
  sendSite: NonNullable<ReturnType<typeof sendSiteOf>>,
  store: { readonly ready: boolean; subscribe(listener: () => void): () => void },
  setActivity: (entries: { conversationId: string; lastTurnAt: number }[]) => void,
): void {
  const waiting = new Map<string, number>();
  const flush = (): void => {
    // Storage can finish loading while the folders turn off; nothing is saved after that.
    if (scope.isDisposed || !store.ready || waiting.size === 0) return;
    const entries = Array.from(waiting, ([conversationId, lastTurnAt]) => ({
      conversationId,
      lastTurnAt,
    }));
    waiting.clear();
    setActivity(entries);
  };
  scope.effect(() => {
    const unsubscribe = store.subscribe(flush);
    return () => {
      unsubscribe();
      waiting.clear();
    };
  }, `${key}:activity-wait`);
  // A chat's Activity time is when the user last sent a message in it.
  trackUserSends(scope, sendSite, ({ conversationKey, at }) => {
    waiting.set(conversationKey, Math.max(at, waiting.get(conversationKey) ?? 0));
    flush();
  });
}

export async function activateSiteFolders(
  scope: PluginScope,
  site: SiteFoldersAdapter,
  settings: PluginSettings = {},
  adapter: SiteAdapter | null = null,
): Promise<void> {
  await initI18n();
  if (scope.isDisposed) return;
  const { key } = site;
  // Created below, before the store first loads, so a load's notice has somewhere to show.
  let view: SiteFoldersView | null = null;
  const { store, commands } = site.createFolders((message, tone) =>
    view?.notifyStorage(message, tone),
  );
  scope.child(store, `${key}:store`);
  const [prefs, sectionPrefs] = await Promise.all([
    loadPanelPrefs(site.prefsKeys.panel),
    loadSectionPrefs(site.prefsKeys.section),
  ]);
  if (scope.isDisposed) return;
  const hideFiled =
    settings[HIDE_FILED_SETTING] === true
      ? new SidebarHideFiled(scope, site.hideFiled, site.sidebar, key)
      : null;
  const nativeRename = site.native.rename;
  const renameNative = async (conversation: ConversationReference): Promise<void> => {
    if (!nativeRename) return;
    const nativeTitle = await nativeRename(site.identity.bareId(conversation.conversationId), {
      sidebar: () => site.sidebar.find(),
      reveal: (id) => hideFiled?.reveal(id) ?? (() => {}),
      active: () => !scope.isDisposed,
    });
    if (nativeTitle === null || scope.isDisposed) return;
    await commands.run({
      kind: 'restoreNativeTitle',
      conversationId: conversation.conversationId,
      nativeTitle,
    });
  };
  view = new SiteFoldersView(scope, site, store, commands, prefs, (c) => {
    void renameNative(c);
  });
  const sendSite = sendSiteOf(adapter);
  view.start(sectionPrefs, sendSite !== null);
  if (sendSite) {
    trackActivity(scope, key, sendSite, store, (entries) => {
      void commands.run({ kind: 'setConversationActivity', entries });
    });
  }
  const sidebar = new SidebarWatcher(
    scope,
    { find: (doc) => site.sidebar.find(doc), attributes: site.sidebar.observedAttributes },
    key,
  );
  const moveMenu =
    site.native.createMoveMenu?.({
      label: () => t('conversation_move_to_folder'),
      untitled: () => t(site.messages.untitled),
      canFile: () => store.ready,
      onMove: (conversation) => view.pickFolderFor(conversation),
    }) ?? null;
  const titles = new SidebarTitleSync(store, commands, {
    rows: site.sidebar,
    isPlaceholderTitle: (title) => site.page.isPlaceholderTitle(title),
    storedId: (id) => site.identity.storedId(id),
  });
  const guide = new SiteFolderGuide(
    scope,
    site.guide,
    {
      anchor: () => view.guideAnchor(),
      ready: () => store.ready,
      busy: () => view.sectionBusy(),
    },
    key,
  );
  if (moveMenu) scope.effect(() => () => moveMenu.dispose(), `${key}:move-menu`);
  const rowAt = site.native.rowAt;
  if (rowAt) {
    bindSidebarRowDrag(scope, {
      conversationAt: (target) => {
        const row = rowAt(target);
        return row ? referenceOf(site, row, location.origin) : null;
      },
      label: key,
      dropTargetAt: (x, y) => view.dropTargetAt(x, y),
      onDrop: (folderId, conversation) => view.file(folderId, conversation, 'outside-drop'),
    });
  }
  sidebar.onChange((nav) => {
    view.placeSection(nav);
    hideFiled?.sync(nav);
    titles.sync(nav);
    guide.check();
    if (moveMenu?.check(nav)) sidebar.schedule();
  });
  scope.effect(() => store.subscribe(() => sidebar.schedule()), `${key}:sidebar-sync`);
  // A chat older than the loaded sidebar opens without any sidebar change.
  scope.effect(() => watchRouteChanges(() => sidebar.schedule()), `${key}:route`);
  if (hideFiled) {
    scope.effect(
      () => store.subscribe(() => hideFiled.update(store.filedIds())),
      `${key}:hide-filed-sync`,
    );
  }
  sidebar.start();
  await store.init();
  if (scope.isDisposed) return;
  view.refresh();
  hideFiled?.update(store.filedIds());
  sidebar.schedule();
}
