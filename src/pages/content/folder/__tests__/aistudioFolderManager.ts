/**
 * AI Studio's folders as one object, for the suites written against the
 * retired `AIStudioFolderManager`: the page's folder session
 * (`AIStudioFolderSession`, which the start point holds) and the folders
 * plugin's view of it (`AIStudioFoldersView`), composed as the page composes
 * them. Members resolve on the session first, then the view, so a suite reads
 * and stubs them under the manager's old names.
 *
 * The folders switch and the hide-archived setting reach the view as the
 * plugin's enable and value bindings deliver them: the switch (`geminiFolderEnabled`,
 * on unless false) attaches or destroys the view, the setting follows
 * `aistudioFolderHideArchivedConversations`. `PluginHost` itself is covered by
 * `verbs/folders/aistudio/__tests__/aistudioFoldersPlugin.test.ts`.
 *
 * Each instance has its own session, so two instances act as two tabs.
 */
import { vi } from 'vitest';
import browser, { type Storage } from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import aistudioSite from '@/features/plugins/catalog/sites/aistudio/site.json';
import { readSiteAdapterData } from '@/features/plugins/sites/siteAdapterData';
import {
  AIStudioFoldersView,
  aistudioPageDom,
} from '@/features/plugins/verbs/folders/aistudio/view';

import { AIStudioFolderSession } from '../session/aistudioFolderSession';

const HIDE_KEY = StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS_AISTUDIO;

function pageDom() {
  const read = readSiteAdapterData(aistudioSite);
  const section = read.result.success ? read.result.data.folders : undefined;
  const dom = section ? aistudioPageDom(section) : null;
  if (!dom) throw new Error('AI Studio site.json has no folders section');
  return dom;
}

export class AIStudioFolderManager {
  readonly session = new AIStudioFolderSession();
  view: AIStudioFoldersView | null;
  private readonly dom = pageDom();
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
    // Folders on until storage says otherwise, as the manager's own default was.
    this.view = new AIStudioFoldersView(this.session, this.dom, false);
    void this.session.attach(this.view);
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop in target) return Reflect.get(target, prop, receiver);
        const owner = prop in target.session ? target.session : target.view;
        if (!owner) return undefined;
        const value: unknown = Reflect.get(owner, prop);
        // A spy a suite installed stays itself, so its calls can be asserted.
        if (typeof value !== 'function' || vi.isMockFunction(value)) return value;
        return value.bind(owner);
      },
      set: (target, prop, value) => {
        if (prop in target) return Reflect.set(target, prop, value);
        const owner = prop in target.session ? target.session : target.view;
        return owner ? Reflect.set(owner, prop, value) : false;
      },
    });
  }

  /** The repository's data session, under the manager's old name. */
  get dataSession() {
    return this.session.session;
  }

  /** Starts as the page does: the session, then the folders if they are on. */
  async init(): Promise<void> {
    const stored = await browser.storage.sync.get({
      [StorageKeys.FOLDER_ENABLED]: true,
      [HIDE_KEY]: false,
    });
    this.hideArchived = stored[HIDE_KEY] === true;
    const enabled = stored[StorageKeys.FOLDER_ENABLED] !== false;
    if (!enabled && this.view) {
      this.view.destroy();
      this.view = null;
    }
    browser.storage.onChanged.addListener(this.onStorage);
    await this.session.init();
    if (this.view) {
      this.view.setHideArchived(this.hideArchived);
      await this.view.start();
    }
  }

  /** The folders plugin turning on (a new view attaches) or off (the view goes). */
  setFolders(enabled: boolean): void {
    if (!enabled) {
      this.view?.destroy();
      this.view = null;
      return;
    }
    if (this.view) return;
    this.view = new AIStudioFoldersView(this.session, this.dom, this.hideArchived);
    void this.view.start();
  }

  /** Removes everything, as closing the page would. */
  destroy(): Promise<void> {
    this.destroyed = true;
    browser.storage.onChanged.removeListener(this.onStorage);
    this.view?.destroy();
    this.view = null;
    return this.session.close();
  }
}
