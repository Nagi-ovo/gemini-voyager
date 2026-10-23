/**
 * Gemini's folders as one object, for the suites written against the retired
 * `FolderManager`: the page's folder session (`GeminiFolderSession`, which the
 * start point holds) and the folders plugin's view of it (`GeminiFoldersView`),
 * composed as the page composes them. Members resolve on the view first, then
 * the session, so a suite reads and stubs them under the manager's old names.
 *
 * The folders switch and the hide-archived setting reach the view as the
 * plugin's enable and value bindings deliver them: the switch
 * (`geminiFolderEnabled`, on unless false) starts the view or destroys it, the
 * setting follows `geminiFolderHideArchivedConversations`. With the folders
 * off a view stays attached but unstarted, as the manager's owners stayed, so a
 * suite can still drive its sidebar runtime or transfers directly. `PluginHost`
 * itself is covered by `verbs/folders/gemini/__tests__/geminiFoldersPlugin.test.ts`.
 *
 * Each instance has its own session, so two instances act as two tabs.
 */
import { vi } from 'vitest';
import browser, { type Storage } from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { GeminiFoldersView } from '@/features/plugins/verbs/folders/gemini/view';

import { GeminiFolderSession, type GeminiFolderView } from '../session/geminiFolderSession';
import type { Folder } from '../types';

const HIDE_KEY = StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS;

export class FolderManager {
  readonly session = new GeminiFolderSession();
  view: GeminiFoldersView;
  /** Whether `view` started: the folders are on. */
  private started = false;
  private hideArchived = false;
  private destroyed = false;
  private readonly onStorage = (
    changes: Record<string, Storage.StorageChange>,
    area: string,
  ): void => {
    if (area !== 'sync' || this.destroyed) return;
    if (changes[HIDE_KEY]) {
      this.hideArchived = changes[HIDE_KEY].newValue === true;
      this.view?.setHideArchived(this.hideArchived);
    }
    if (changes[StorageKeys.FOLDER_ENABLED]) {
      this.setFolders(changes[StorageKeys.FOLDER_ENABLED].newValue !== false);
    }
  };

  constructor() {
    this.view = this.dormantView();
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop in target) return Reflect.get(target, prop, receiver);
        const owner = prop in target.view ? target.view : target.session;
        const value: unknown = Reflect.get(owner, prop);
        // A spy a suite installed stays itself, so its calls can be asserted.
        if (typeof value !== 'function' || vi.isMockFunction(value)) return value;
        return value.bind(owner);
      },
      set: (target, prop, value) => {
        if (prop in target) return Reflect.set(target, prop, value);
        const owner = prop in target.view ? target.view : target.session;
        return Reflect.set(owner, prop, value);
      },
    });
  }

  /** Starts as the page does: the session, then the folders if they are on. */
  async init(): Promise<void> {
    let stored: Record<string, unknown> | undefined;
    try {
      stored = await browser.storage.sync.get({
        [StorageKeys.FOLDER_ENABLED]: true,
        [HIDE_KEY]: false,
      });
    } catch {
      stored = undefined;
    }
    this.hideArchived = stored?.[HIDE_KEY] === true;
    browser.storage.onChanged.addListener(this.onStorage);
    await this.session.init();
    // Folders on until storage says otherwise, as the manager's own default was.
    if (this.destroyed || stored?.[StorageKeys.FOLDER_ENABLED] === false) return;
    await this.startView();
  }

  /** The folders plugin turning on (the view starts) or off (it goes; a dormant one stays). */
  setFolders(enabled: boolean): void {
    if (this.destroyed || enabled === this.started) return;
    if (enabled) {
      void this.startView();
      return;
    }
    this.view.destroy();
    this.started = false;
    this.view = this.dormantView();
  }

  private startView(): Promise<void> {
    this.started = true;
    this.view.setHideArchived(this.hideArchived);
    return this.view.start();
  }

  /** A view attached to the session but not started, as a manager with folders off was. */
  private dormantView(): GeminiFoldersView {
    const view = new GeminiFoldersView(this.session, this.hideArchived);
    void this.session.attach((view as unknown as { view: GeminiFolderView }).view);
    return view;
  }

  getFolders(): Folder[] {
    return this.session.getFolders();
  }

  ensureDataLoaded(): Promise<void> {
    return this.session.ensureDataLoaded();
  }

  addConversationToFolderFromNative(
    ...args: Parameters<GeminiFolderSession['addConversationToFolderFromNative']>
  ): void {
    this.session.addConversationToFolderFromNative(...args);
  }

  /** Removes everything, as closing the page would. */
  destroy(): Promise<void> {
    this.destroyed = true;
    browser.storage.onChanged.removeListener(this.onStorage);
    this.view.destroy();
    return this.session.close();
  }
}
