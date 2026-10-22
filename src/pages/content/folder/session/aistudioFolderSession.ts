/**
 * AI Studio's folder data for one page: the repository on AI Studio's own
 * bucket, its account scope and switch, the sync → local migration, the popup's
 * cloud-sync answers and the commands that edit it. The content script's start
 * point holds it for the page's lifetime (`aistudioFolderSessions.ts`), so the
 * migration and the listeners run with folders switched off, as they always
 * have; the folders plugin attaches a view while it runs.
 *
 * Lifetimes: an account release keeps the view but drops the old account's
 * state; detaching (folders off) suspends edits and the account poll but keeps
 * the storage and message listeners, so attaching again rebinds and reloads;
 * `close` (the last lease) stops everything once accepted writes drained.
 */
import browser, { type Runtime, type Storage } from 'webextension-polyfill';

import {
  type AccountContext,
  type AccountScope,
  detectAccountContextFromDocument,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import type { PromptItem } from '@/core/types/sync';
import { createToaster } from '@/core/ui/toast/toaster';
import type { ToastTone } from '@/core/ui/toast/types';
import { type FolderCommands, isSaved } from '@/features/folder/commands/folderCommands';
import { createTranslator, initI18n } from '@/utils/i18n';

import { VALID_PATH } from '../../aistudioSidebarPaths';
import type { FolderDataSession } from '../FolderDataSession';
import { FolderRepository } from '../FolderRepository';
import { AIStudioAccountScope } from '../aistudioAccountScope';
import { migrateAIStudioLegacySync } from '../aistudioImport';
import { getFolderRecoveryNotice } from '../folderRecoveryNotice';
import { AISTUDIO_FOLDER_CONFIG } from '../platformFolderConfig';
import { AIStudioFolderStorageAdapter } from '../storage/AIStudioFolderStorageAdapter';
import { createSyncMessageListener } from '../syncMessageListener';
import type { FolderData } from '../types';
import { createAIStudioCommands } from './aistudioCommands';

/** Rebinds `attach` tries while the page keeps switching accounts; the poll takes over after. */
const MAX_BIND_ROUNDS = 3;

/** An account as `AIStudioAccountScope` tells accounts apart: `/u/<n>` and the signed-in email. */
function pageFingerprint(context: Pick<AccountContext, 'routeUserId' | 'email'> | null): string {
  return context ? `${context.routeUserId || ''}::${context.email || ''}` : '';
}

/** Errors and warnings stay longer than a confirmation. */
export const AISTUDIO_NOTICE_MS: Record<ToastTone, number> = {
  info: 3000,
  success: 3000,
  warning: 7000,
  error: 5000,
};

/** What the folders' view does when the data changes; set while folders are on. */
export interface AIStudioFolderView {
  /** The data changed, loaded, or became editable or not. */
  render(): void;
  notify(message: string, tone: ToastTone): void;
  /** Which /library rows hide as archived follows the data. */
  applyHideArchived(): void;
  syncNudge(): void;
  /** The previous account's data is gone: close everything that held it. */
  releaseAccount(): void;
}

export class AIStudioFolderSession {
  /** Resolves against the bundled messages on every call, so it is right before `initI18n` settles. */
  private t: (key: string) => string = createTranslator();
  private view: AIStudioFolderView | null = null;
  /** Shows notices while no view is attached; a view shows its own. */
  private readonly toaster = createToaster();
  private attachedBefore = false;
  /** Set once `init` bound the account and started listening. */
  private started = false;
  /** While `attach` binds the page's account: the popup may not edit yet. */
  private binding = false;
  /** The account the repository bound, as `pageFingerprint` reads it. */
  private boundFingerprint: string | null = null;
  private closed = false;
  private stopListening: (() => void) | null = null;

  readonly repository = new FolderRepository(
    AISTUDIO_FOLDER_CONFIG,
    new AIStudioFolderStorageAdapter(),
    {
      // loaded: a ready session bound or loaded. data/availability: a draft started or settled.
      onChange: (reason) => {
        if (reason === 'loaded' || reason === 'data' || reason === 'availability') {
          this.view?.render();
        }
      },
      onRecovery: (result) => {
        const { message, tone } = getFolderRecoveryNotice(result);
        this.notify(message, tone);
      },
      onExternalChange: () => {
        // Sidebar rendering leaves /library rows untouched; refresh their archive classes too.
        const view = this.view;
        if (view) void this.load().then(() => view.applyHideArchived());
      },
      onAccountReleased: () => this.view?.releaseAccount(),
      isEnabled: () => this.view !== null,
      onSaveFailed: () => this.notify(this.t('folder_save_error'), 'error'),
      // Membership decides which /library rows are archived, so every settled write re-syncs them.
      onPersistSettled: () => {
        this.view?.applyHideArchived();
        this.view?.syncNudge();
      },
      onAccountBound: (context) => {
        this.boundFingerprint = pageFingerprint(context);
        this.account.bound(context);
      },
    },
  );
  readonly commands: FolderCommands = createAIStudioCommands(this.repository, {
    commit: () => this.save().then(() => this.view?.render()),
    onDraftSettled: () => this.view?.applyHideArchived(),
  });
  readonly account = new AIStudioAccountScope(this.repository);

  get data(): FolderData {
    return this.repository.data;
  }
  set data(data: FolderData) {
    this.repository.data = data;
  }
  get canEdit(): boolean {
    return this.repository.canEdit;
  }
  get session(): FolderDataSession | null {
    return this.repository.session;
  }
  /** Changes on every account rebind, including a return to the same account. */
  get activation(): number {
    return this.repository.activation;
  }
  get accountScope(): AccountScope | null {
    return this.repository.accountScope;
  }
  get accountIsolationEnabled(): boolean {
    return this.repository.accountIsolationEnabled;
  }
  /** Active folder data key; empty while no account is bound. */
  get activeStorageKey(): string {
    return this.repository.storageKey;
  }
  get attached(): boolean {
    return this.view !== null;
  }
  /** The translator once the page's language loaded. */
  get translate(): (key: string) => string {
    return (key) => this.t(key);
  }

  /** The migration always; the rest only where AI Studio's folders ever ran. */
  async init(): Promise<void> {
    await initI18n();
    this.t = createTranslator();
    try {
      await migrateAIStudioLegacySync(
        AISTUDIO_FOLDER_CONFIG.storageKey,
        this.repository.writeFolder,
      );
    } catch (error) {
      // The source and marker stay untouched on failure; normal loading continues.
      console.warn('[AIStudioFolderManager] Migration from sync to local failed:', error);
    }
    // The playground (/), saved prompts and the library history.
    if (this.closed || !isFolderPath()) return;
    await this.account.loadIsolationSetting();
    if (this.closed) return;
    await this.account.refresh(true);
    if (this.closed) return;
    this.listen();
    this.repository.watchStorage(); // Else a stale tab's next save overwrites other writers.
    this.startAccountPolling();
    this.started = true;
  }

  /**
   * Shows the folders in `view` from now on, once the account they belong to
   * is the page's. Attaching again after a detach rebinds the account, which
   * the detach suspended, before the view loads.
   */
  async attach(view: AIStudioFolderView): Promise<void> {
    if (this.closed || this.view === view) return;
    this.view = view;
    // Before start-up finished, `init` binds the account itself.
    if (!this.started) return;
    const first = !this.attachedBefore;
    this.attachedBefore = true;
    // Re-enabling after a detach: restart the poller it stopped.
    if (!first && !this.account.polling) this.startAccountPolling();
    this.binding = true;
    try {
      // First attach: an account switched while folders were off, before the poll
      // saw it, would otherwise show and take edits into the previous account's
      // folders. A re-attach rebinds the account the detach suspended.
      await this.account.refresh(!first);
      // The page may switch again while that resolution is pending, and it still
      // binds the account it started for: rebind until the bound account is the
      // page's, or the folders went off meanwhile.
      for (let round = 0; round < MAX_BIND_ROUNDS && !this.boundToPage(); round++) {
        if (this.view !== view) return;
        await this.account.refresh(true);
      }
    } finally {
      this.binding = false;
    }
  }

  /** Whether the bound account is the one the page shows (always, with isolation off). */
  private boundToPage(): boolean {
    if (this.closed || this.view === null) return true;
    if (!this.accountIsolationEnabled) return true;
    if (!this.repository.session) return false;
    return (
      pageFingerprint(detectAccountContextFromDocument(location.href, document)) ===
      this.boundFingerprint
    );
  }

  /** Folders off: edits and the account poll stop; the data and listeners stay. */
  detach(view: AIStudioFolderView): void {
    if (this.view !== view) return;
    this.view = null;
    this.attachedBefore = true;
    this.repository.suspend();
    this.account.stop();
  }

  load(): Promise<void> {
    return this.repository.loadData();
  }

  async save(): Promise<boolean> {
    return isSaved(await this.commands.run({ kind: 'saveCurrentData' }));
  }

  /**
   * Keeps imported or synced drafts out of live data until storage accepts
   * them. Prompts share the folder write, so a merge lands whole or not at all.
   */
  async replaceData(data: FolderData, prompts?: PromptItem[]): Promise<boolean> {
    return isSaved(await this.commands.runBulk({ kind: 'commitPreparedData', data, prompts }));
  }

  /** Stops everything; resolves once the repository's accepted writes drained. */
  close(): Promise<void> {
    this.closed = true;
    this.view = null;
    this.stopListening?.();
    this.stopListening = null;
    this.account.stop();
    this.toaster.destroy();
    return this.repository.destroy();
  }

  private notify(message: string, tone: ToastTone): void {
    if (this.view) this.view.notify(message, tone);
    else this.toaster.show({ message, tone, durationMs: AISTUDIO_NOTICE_MS[tone] });
  }

  private listen(): void {
    const onStorage = (changes: Record<string, Storage.StorageChange>, areaName: string): void => {
      if (areaName !== 'sync') return;
      if (
        changes[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] ||
        changes[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_AISTUDIO]
      ) {
        void this.account
          .readIsolationSetting()
          .then((enabled) => this.handleAccountIsolationToggle(enabled));
      }
    };
    browser.storage.onChanged.addListener(onStorage);
    const syncListener = createSyncMessageListener({
      // With folders off nothing reloads, so the retained snapshot may be older than storage.
      canEdit: () => this.view !== null && !this.binding && this.canEdit,
      data: () => this.data,
      accountScope: () => this.accountScope,
      reload: () => this.load().then(() => this.view?.render()),
    });
    // The polyfill's typing cannot express "respond to some messages, ignore the rest".
    browser.runtime.onMessage.addListener(syncListener as Runtime.OnMessageListenerCallback);
    this.stopListening = () => {
      browser.storage.onChanged.removeListener(onStorage);
      browser.runtime.onMessage.removeListener(syncListener as Runtime.OnMessageListenerCallback);
    };
  }

  async handleAccountIsolationToggle(enabled: boolean): Promise<void> {
    if (enabled === this.accountIsolationEnabled) return;
    this.repository.setAccountIsolationFlag(enabled);
    await this.account.refresh(true);
    await this.load();
    this.view?.render();
  }

  /** `detach` and `close` stop it; a restart replaces the previous poll. */
  startAccountPolling(): void {
    this.account.startPolling(() => void this.refreshScopedDataOnAccountContextChange());
  }

  async refreshScopedDataOnAccountContextChange(): Promise<void> {
    if (!this.accountIsolationEnabled) return;
    if (!(await this.account.refresh(false))) return;
    await this.load();
    this.view?.render();
  }
}

/** The playground (/), saved prompts and the library: where AI Studio's folders run. */
export function isFolderPath(pathname: string = location.pathname): boolean {
  return VALID_PATH.test(pathname) || pathname === '/';
}
