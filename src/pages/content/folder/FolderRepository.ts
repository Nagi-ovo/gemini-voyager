import browser, { type Storage } from 'webextension-polyfill';

import {
  type AccountContext,
  type AccountScope,
  accountIsolationService,
  buildScopedStorageKey,
  detectAccountContextFromDocument,
} from '@/core/services/AccountIsolationService';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { cloneFolderData, validateFolderData } from '@/features/folder/model/folderData';
import { AUTHORITY_FENCE_KEY } from '@/features/folder/owner/authorityFence';
import {
  LegacyFolderFence,
  LegacyFolderWriteRefusedError,
} from '@/features/folder/owner/legacyFolderFence';

import { FolderDataSession } from './FolderDataSession';
import { mergeDebouncedEdits } from './debouncedEditMerge';
import { GEMINI_FOLDER_CONFIG, type PlatformFolderConfig } from './platformFolderConfig';
import type { IFolderStorageAdapter } from './storage/FolderStorageAdapter';
import {
  type StorageEcho,
  StorageEchoTracker,
  serializeStoredValue,
} from './storage/StorageEchoTracker';
import type { FolderWriter } from './storage/folderWriter';
import type { FolderData } from './types';

/** Growing gaps between account-scope retries, in ms. Length caps the attempts. */
const ACCOUNT_SCOPE_RETRY_DELAYS = [400, 1200, 3000] as const;
/** Growing gaps between reads after a failed one, in ms. The last gap repeats until a read lands. */
const READ_RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000] as const;
const IS_DEBUG = false;
const SAVE_DEBOUNCE_MS = 300;

export type FolderStoreChange =
  | 'account'
  | 'data'
  | 'title'
  | 'activity'
  | 'loaded'
  | 'saved'
  | 'availability';

export interface FolderRepositoryHooks {
  onChange: (reason: FolderStoreChange) => void;
  /**
   * A failed load restored backup data, kept in-memory data, or reset to empty;
   * or storage could not be read before any load, which leaves editing disabled.
   */
  onRecovery: (result: 'recovered' | 'kept' | 'lost' | 'unreadable') => void;
  /**
   * Reload the active bucket: another context wrote it, or a failed read is retried.
   * Resolved at call time by the owner.
   */
  onExternalChange: () => void;
  /** The active account was released; runs before the `account` change. */
  onAccountReleased: () => void;
  /** Whether the folder feature is enabled, which gates the isolation-switch repaint. */
  isEnabled: () => boolean;
  /** The final write of a save chain failed while its session is current. */
  onSaveFailed?: () => void;
  /** A write settled, either way, for the current session outside a draft replacement. */
  onPersistSettled?: () => void;
  /** A session was bound for `context`, which is `null` while isolation is off. */
  onAccountBound?: (context: AccountContext | null) => void;
}

function isDebugEnabled(flag: string): boolean {
  try {
    // Enable by setting localStorage.<debugFlag> = '1'
    return IS_DEBUG || localStorage.getItem(flag) === '1';
  } catch {
    // Ignore - localStorage may not be available in some contexts (e.g. incognito mode)
    return IS_DEBUG;
  }
}

function createDebugLog(config: PlatformFolderConfig, write: 'log' | 'warn') {
  return (...args: unknown[]): void => {
    if (isDebugEnabled(config.debugFlag)) {
      console[write](config.logPrefix, ...args);
    }
  };
}

export const folderDebug = createDebugLog(GEMINI_FOLDER_CONFIG, 'log');
export const folderDebugWarn = createDebugLog(GEMINI_FOLDER_CONFIG, 'warn');

/** Owns platform sessions, load/recovery, serialized writes, echoes and scope retry. */
export class FolderRepository {
  private readonly fence: LegacyFolderFence;
  private readonly storage: IFolderStorageAdapter;
  readonly writeFolder: FolderWriter;
  private readonly initializations = new Map<string, Promise<void>>();
  private dataSession: FolderDataSession | null;
  private readonly dataSessions = new Map<string, FolderDataSession>();
  private unresolvedData: FolderData = { folders: [], folderContents: {} };
  private accountScopeRequest = 0;
  private scopeRefreshPending = false;
  private accountScopeRetry: number | null = null;
  private accountScopeRetryAttempt = 0;
  private accountScopeRetrying = false;
  private readRetry: number | null = null;
  private readRetryAttempt = 0;
  private isolationEnabled = false;
  private resolvedAccountScope: AccountScope | null = null;
  private activeStorageKey: string;
  private destroyed = false;
  private readonly storageEchoes = new StorageEchoTracker();
  /** The session a scope refresh released, still told about writes until it rebinds. */
  private releasingSession: FolderDataSession | null = null;
  private beforeUnloadFlushHandler: (() => void) | null = null;
  private readonly tag: string;
  private readonly debug: (...args: unknown[]) => void;
  private readonly debugWarn: (...args: unknown[]) => void;
  private readonly storageChangeHandler = (
    changes: Record<string, Storage.StorageChange>,
    area: string,
  ): void => {
    if (this.destroyed) return;
    if (area === 'local') {
      if (changes[AUTHORITY_FENCE_KEY]) this.fence.observe(changes[AUTHORITY_FENCE_KEY].newValue);
      this.markExternalChanges(changes);
    }
    if (area === 'sync' && this.config.isolationSettingKeys.some((key) => changes[key])) {
      void accountIsolationService
        .isIsolationEnabled({
          platform: this.config.platform,
          pageUrl: window.location.href,
        })
        .then((enabled) => this.setAccountIsolationEnabled(enabled));
    }
  };

  constructor(
    private readonly config: PlatformFolderConfig,
    storage: IFolderStorageAdapter,
    private readonly hooks: FolderRepositoryHooks,
  ) {
    this.fence = new LegacyFolderFence(config.storageKey, () => this.fenceChanged());
    this.storage = storage;
    this.writeFolder = (_key, operation) => this.fence.write(operation);
    storage.setWriteGate?.(this.writeFolder);
    this.dataSession = new FolderDataSession(
      config.storageKey,
      config.backupNamespace,
      null,
      validateFolderData,
      () => this.fence.canWrite,
      (operation) => this.fence.write(operation),
    );
    this.activeStorageKey = config.storageKey;
    this.tag = config.logPrefix;
    this.debug = createDebugLog(config, 'log');
    this.debugWarn = createDebugLog(config, 'warn');
  }

  get data(): FolderData {
    return this.dataSession?.data ?? this.unresolvedData;
  }
  set data(value: FolderData) {
    if (this.dataSession) this.dataSession.data = value;
    else this.unresolvedData = value;
  }
  get session(): FolderDataSession | null {
    return this.dataSession;
  }
  get canEdit(): boolean {
    const session = this.dataSession;
    return (
      !this.destroyed &&
      this.fence.canWrite &&
      !!session?.ready &&
      !session.replacingData &&
      !session.readFailed
    );
  }
  get activation(): number {
    return this.accountScopeRequest;
  }
  get storageKey(): string {
    return this.activeStorageKey;
  }
  get accountScope(): AccountScope | null {
    return this.resolvedAccountScope;
  }
  get accountIsolationEnabled(): boolean {
    return this.isolationEnabled;
  }
  get isDestroyed(): boolean {
    return this.destroyed;
  }

  async init(): Promise<void> {
    this.watchStorage();
    // A refused migration must still allow account binding to use its normal retry path.
    await this.initializeStorage(this.config.storageKey).catch((error) => {
      if (this.fence.canWrite) throw error;
    });
    if (this.destroyed) return;
    this.beforeUnloadFlushHandler = () => this.flushPendingSaveData();
    window.addEventListener('beforeunload', this.beforeUnloadFlushHandler);
    await this.loadAccountIsolationSetting();
    if (this.destroyed) return;
    await this.refreshAccountScope();
    await this.loadData();
  }

  /** Reload on writes to the active bucket from other contexts. */
  watchStorage(): void {
    if (!this.destroyed) browser.storage.onChanged.addListener(this.storageChangeHandler);
  }

  /** Suspend edits and invalidate in-flight reads; account refresh resumes the session. */
  suspend(): void {
    this.flushPendingSaveData();
    // Cached memory is not an authoritative snapshot until the resumed session loads again.
    if (this.dataSession) {
      this.dataSession.ready = false;
      this.dataSession.reconcilePending = true;
    }
    this.clearAccountScopeRetry();
    this.clearReadRetry();
    this.dataSession?.deactivate();
    this.accountScopeRequest += 1;
  }

  destroy(): void {
    // Accept the final debounce before disabling edits and cancelling retry timers.
    this.flushPendingSaveData();
    this.destroyed = true;
    this.clearAccountScopeRetry();
    this.clearReadRetry();
    this.dataSession?.deactivate();
    this.accountScopeRequest += 1;
    browser.storage.onChanged.removeListener(this.storageChangeHandler);
    if (this.beforeUnloadFlushHandler)
      window.removeEventListener('beforeunload', this.beforeUnloadFlushHandler);
    this.beforeUnloadFlushHandler = null;
    this.fence.close();
    // Teardown stops new edits; already accepted writes still need their fresh authority checks.
    const sessions = new Set(this.dataSessions.values());
    if (this.dataSession) sessions.add(this.dataSession);
    void Promise.all(
      [...sessions].map(async (session) => {
        // Parked work has no drain once teardown stops authority retries.
        if (!session.saveInProgress || !this.fence.canWrite) session.cancelPendingSave();
        await (session.pendingSaveCompletion?.promise ?? session.activeSave);
        await session.backup.finishPendingWrites();
      }),
    ).finally(() => this.fence.destroy());
  }

  /** Record the isolation switch without rebinding; the caller refreshes the scope. */
  setAccountIsolationFlag(enabled: boolean): void {
    this.isolationEnabled = enabled;
  }

  async setAccountIsolationEnabled(enabled: boolean): Promise<void> {
    if (this.destroyed || enabled === this.isolationEnabled) return;
    this.isolationEnabled = enabled;
    await this.refreshAccountScope();
    await this.loadData();
    if (this.hooks.isEnabled()) this.hooks.onChange('data');
  }

  async loadData(): Promise<void> {
    const session = this.dataSession;
    if (!session?.isActive || !this.fence.canWrite || this.destroyed) return;
    if (session.pendingSave) {
      this.drainPendingSave(session);
      return;
    }
    if (session.saveInProgress || session.replacingData) {
      // Accepted writes must drain before a resumed read; their settlement triggers the reload.
      if (!session.ready) session.reconcilePending = true;
      return;
    }
    const version = ++session.loadVersion;
    // A fenced reload must not replace the unsaved memory retained for the reload notice.
    const isCurrent = () =>
      this.fence.canWrite &&
      this.dataSession === session &&
      session.isActive &&
      session.loadVersion === version &&
      !this.destroyed;
    session.loadsInFlight += 1;
    session.storageChangedDuringRead = false;
    session.reconcileAttempted = true;
    const writesBefore = session.writeGen;
    let applied = false; // a valid read or recovery applied
    let recovering = false; // recovery's own write supersedes this read; it is not discarded
    try {
      let loadedData: FolderData | null;
      try {
        loadedData = await this.storage.loadData(session.storageKey);
        if (!(await this.fence.check()) || !isCurrent()) return;
        // A resumed snapshot stays unavailable until a read unaffected by bucket events lands.
        if (!session.ready && session.storageChangedDuringRead) {
          // Reuse read backoff so continuous external writes cannot cause an immediate reload loop.
          this.scheduleReadRetry(session);
          return;
        }
        if (!loadedData && session.accountScope) {
          loadedData = await this.migrateLegacyFolderDataToScopedStorage(session, version);
          if (!isCurrent()) return;
        }
      } catch (error) {
        // Unreadable storage may hold newer data: leave it untouched, show memory read-only and retry.
        if (!isCurrent()) return;
        console.error(`${this.tag} Failed to read folder data; storage left untouched:`, error);
        const firstReadFailure = !session.readFailed;
        session.readFailed = true;
        this.hooks.onChange('availability');
        // Report the first failure only, not each retry.
        if (firstReadFailure) this.hooks.onRecovery('unreadable');
        if (!isExtensionContextInvalidatedError(error)) this.scheduleReadRetry(session);
        return;
      }
      session.readFailed = false;

      if (loadedData && validateFolderData(loadedData)) {
        // Validate and repair data integrity
        const fresh = this.config.normalize(loadedData);
        const base = session.baseline;
        session.baseline = cloneFolderData(fresh);
        // Edits still waiting on the debounce were made after `base`; keep them.
        if (session.debouncePending && base) mergeDebouncedEdits(fresh, this.data, base);
        // Readable storage wins on resumption; failed edits are retained only for recovery.
        this.data = fresh;

        // Clean up orphaned folderContents (folders that no longer exist)
        if (this.config.pruneOrphanBuckets) {
          const validFolderIds = new Set(this.data.folders.map((f) => f.id));
          validFolderIds.add(this.config.rootBucketId); // Keep root conversations
          Object.keys(this.data.folderContents).forEach((folderId) => {
            if (!validFolderIds.has(folderId)) {
              this.debugWarn(`Removing orphaned folderContents for: ${folderId}`);
              delete this.data.folderContents[folderId];
            }
          });
        }

        // Create primary backup on successful load
        void session.backup.createPrimaryBackup(this.data);
        await session.backup.finishLocalWrites();
        // Suspension or a newer load during backup authorization cannot restore readiness.
        if (!isCurrent()) return;
        session.markReady();
        if (session.debouncePending) this.armDebounce(session);
        applied = true;

        this.debug('Data loaded and validated successfully');
      } else if (loadedData) {
        // Data exists but validation failed - this is a real corruption case
        console.warn(
          `${this.tag} Storage returned invalid data structure, attempting recovery from backup`,
        );
        recovering = true;
        applied = await this.attemptDataRecovery(
          { reason: 'corrupted', originalData: loadedData },
          session,
        );
      } else if (session.failedEditGen !== null || this.config.recoverMissingData) {
        console.warn(`${this.tag} Storage returned no data, attempting recovery from backup`);
        recovering = true;
        applied = await this.attemptDataRecovery(null, session);
      } else {
        // No data found - likely a first-time user
        console.log(
          `${this.tag} No folder data found, initializing empty state (likely first-time user)`,
        );
        this.data = { folders: [], folderContents: {} };
        session.markReady();
        applied = true;
        // No notification needed - this is expected for new users
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.error(`${this.tag} Load data error:`, error);

      // CRITICAL: Do NOT clear data on error - this causes data loss!
      // Instead, try to recover from backup or keep existing data
      recovering = true;
      applied = await this.attemptDataRecovery(error, session);
    } finally {
      session.loadsInFlight -= 1;
      if (applied && isCurrent()) this.clearReadRetry();
      // A bucket event during this read still needs a fresh answer.
      if (applied && isCurrent() && !session.storageChangedDuringRead)
        session.reconcilePending = false;
      // Only the current load settles older failed edits; recovery writes settle their own generation.
      if (applied && isCurrent()) session.settleFailedEdit(writesBefore);
      if (isCurrent() && session.ready) {
        this.hooks.onChange('loaded');
      }
      // Failed recovery waits for a bucket event or settled write; a suspended load stays parked.
      if (
        this.dataSession === session &&
        session.isActive &&
        (applied || (!isCurrent() && !recovering))
      ) {
        this.tryReconcile();
      }
    }
  }

  private async migrateLegacyFolderDataToScopedStorage(
    session: FolderDataSession,
    version: number,
  ): Promise<FolderData | null> {
    // A failed read rejects: binding an empty account bucket would end this migration for good.
    const legacyData = await this.storage.loadData(this.config.storageKey);
    try {
      if (
        this.dataSession !== session ||
        session.loadVersion !== version ||
        !legacyData ||
        !validateFolderData(legacyData)
      ) {
        return null;
      }

      const migratedData = this.config.normalize(
        this.config.migrateLegacyData(legacyData, session.accountScope),
      );
      session.data = migratedData;
      session.markReady();
      // Migrated legacy data is no local edit: a failed write must not outrank a newer backup.
      session.activeSave = this.persistDataSession(
        session,
        cloneFolderData(session.data),
        undefined,
        false,
      );
      const saved = await session.activeSave;
      if (!saved) {
        console.warn(`${this.tag} Failed to persist scoped migration data`);
      }
      this.debug(
        'Migrated legacy folder data to scoped storage:',
        session.storageKey,
        migratedData.folders.length,
      );
      return migratedData;
    } catch (error) {
      console.error(`${this.tag} Failed to migrate legacy folder data:`, error);
      return null;
    }
  }

  /** Returns whether storage now holds the recovered data. */
  private async attemptDataRecovery(error: unknown, session: FolderDataSession): Promise<boolean> {
    if (this.dataSession !== session) return false;
    const version = session.loadVersion;
    console.warn(`${this.tag} Attempting data recovery after load failure`);

    // Failed local edits outrank backups when storage is corrupt.
    if (session.failedEditGen !== null && validateFolderData(this.data)) {
      this.data = this.config.normalize(this.data);
      session.markReady();
      this.hooks.onRecovery('kept');
      return this.saveMemory(true, version);
    }

    // Step 1: Read both stores, including durable copies that cannot fit in localStorage.
    await session.backup.ensureHydrated();
    if (this.dataSession !== session || session.loadVersion !== version || this.destroyed)
      return false;
    // Hydration may outlast another tab's write; read again before restoring an older backup.
    if (session.storageChangedDuringRead) {
      this.scheduleReadRetry(session);
      return false;
    }
    const recovered = session.backup.recoverFromBackup();
    if (recovered && validateFolderData(recovered)) {
      this.data = this.config.normalize(recovered);
      session.markReady();
      console.warn(`${this.tag} Data recovered from backup`);
      this.hooks.onRecovery('recovered');
      // Save recovered data to persistent storage. It is the backup, not a local edit:
      // its failure must not outrank a newer backup another tab may write meanwhile.
      return this.saveMemory(false, version);
    }

    // Step 2: If current this.data already has valid structure, keep it
    if (validateFolderData(this.data) && this.data.folders.length > 0) {
      console.warn(`${this.tag} Keeping existing in-memory data after load error`);
      this.data = this.config.normalize(this.data);
      session.markReady();
      this.hooks.onRecovery('kept');
      return false;
    }

    // Step 3: Last resort - initialize empty data and log critical error
    console.error(`${this.tag} CRITICAL: Unable to recover data, initializing empty state`);
    console.error(`${this.tag} Original error:`, error);
    this.data = { folders: [], folderContents: {} };
    session.markReady();

    // Show user notification about data loss
    this.hooks.onRecovery('lost');
    return false;
  }

  /**
   * Debounce a save. Only for edits that `mergeDebouncedEdits` can carry onto a
   * reload: expand/collapse and conversation timestamps.
   */
  scheduleSaveData(): void {
    if (this.canEdit && this.dataSession) this.armDebounce(this.dataSession);
  }

  private armDebounce(session: FolderDataSession): void {
    session.scheduleDebounce(() => this.fireDebouncedSave(session), SAVE_DEBOUNCE_MS);
  }

  private fireDebouncedSave(session: FolderDataSession): void {
    // An account's accepted edit stays parked until that account is active and freshly loaded.
    if (this.destroyed || this.dataSession !== session || !session.isActive) return;
    if (!this.canEdit || session.loadsInFlight) {
      if (this.fence.canWrite) this.armDebounce(session);
      return;
    }
    this.flushPendingSaveData();
  }

  /** Flag external writes for their captured bucket, including retained account sessions. */
  private markExternalChanges(changes: Record<string, Storage.StorageChange>): void {
    const sessions = new Set(this.dataSessions.values());
    if (this.dataSession) sessions.add(this.dataSession);
    if (this.releasingSession) sessions.add(this.releasingSession);
    for (const session of sessions) {
      const change = changes[session.storageKey];
      if (!change) continue;
      session.storageChangedDuringRead = true;
      if (!this.storageEchoes.consume(session.storageKey, change.newValue)) {
        session.reconcilePending = true;
        session.reconcileAttempted = false;
      }
    }
    this.tryReconcile();
  }

  /** Reconcile external writes once this session is idle; merge pending debounced edits. */
  private tryReconcile(): void {
    const session = this.dataSession;
    if (!session?.reconcilePending || this.destroyed || !this.fence.canWrite) return;
    if (session.pendingSave) {
      this.drainPendingSave(session);
      return;
    }
    // Only skips a reload that could not apply yet; the flag survives it, and
    // persist, `replaceData` and `loadData` call back once they settle.
    if (session.saveInProgress || session.replacingData || session.loadsInFlight > 0) return;
    session.reconcileAttempted = true;
    this.hooks.onExternalChange();
  }

  /** Unready sessions need a fresh read; failed recovery waits for a new bucket event. */
  private reconcileAfterWrite(session: FolderDataSession, saved: boolean): void {
    if (!session.ready || saved || !session.reconcileAttempted) this.tryReconcile();
  }

  flushPendingSaveData(): void {
    if (!this.canEdit || !this.dataSession?.takeDebounce()) return;
    void this.saveData();
  }

  /** Publish a draft only after its atomic folder/companion write succeeds. */
  async replaceData(data: FolderData, companions?: Record<string, unknown>): Promise<boolean> {
    const session = this.dataSession;
    const activation = this.accountScopeRequest;
    if (!session || !this.canEdit) return false;
    const snapshot = this.config.normalize(cloneFolderData(data));

    this.flushPendingSaveData();
    session.replacingData = true;
    session.loadVersion += 1;
    this.hooks.onChange('availability');
    let saved = false;
    try {
      // Finish accepted edits first. A draft must not replace their coalesced tail.
      const pending = session.pendingSaveCompletion?.promise ?? session.activeSave;
      if (pending) await pending;
      if (this.destroyed || this.dataSession !== session || this.accountScopeRequest !== activation)
        return false;

      session.activeSave = this.persistDataSession(session, snapshot, companions, false);
      saved = await session.activeSave;
      // An issued write still belongs to this session if the user has since left it.
      if (saved) session.data = snapshot;
      if (saved) session.baseline = cloneFolderData(snapshot);
      return saved;
    } finally {
      session.replacingData = false;
      if (this.dataSession === session && !this.destroyed) {
        this.hooks.onChange(saved ? 'data' : 'availability');
        this.reconcileAfterWrite(session, saved);
      } else if (!session.saveInProgress && !session.debouncePending) {
        this.dataSessions.delete(session.storageKey);
      }
    }
  }

  saveData(): Promise<boolean> {
    return this.saveMemory(true);
  }

  private async saveMemory(carriesEdit: boolean, recoveryVersion?: number): Promise<boolean> {
    const session = this.dataSession;
    if (
      !session ||
      !this.canEdit ||
      (recoveryVersion !== undefined && session.loadVersion !== recoveryVersion)
    )
      return false;
    try {
      this.data = this.config.normalize(this.data);
      const snapshot = cloneFolderData(session.data);
      // Recovery belongs to its current load; user mutations supersede an in-flight read.
      if (recoveryVersion === undefined) session.loadVersion += 1;
      session.markReady();
      // Backups stay off the save chain: a slow or failed copy never delays or fails a save.
      void session.backup.createEmergencyBackup(snapshot);
      if (session.saveInProgress || session.pendingSave) {
        session.pendingSave = snapshot;
        // Calls coalesced into this trailing snapshot share its storage result.
        if (!session.pendingSaveCompletion) {
          let resolve!: (saved: boolean) => void;
          const promise = new Promise<boolean>((complete) => {
            resolve = complete;
          });
          session.pendingSaveCompletion = { promise, resolve };
        }
        this.debug('Save already in progress, queueing one trailing save');
        return session.pendingSaveCompletion.promise;
      }

      session.activeSave = this.persistDataSession(session, snapshot, undefined, carriesEdit);
      return session.activeSave;
    } catch (error) {
      console.error(`${this.tag} Save data error:`, error);
      this.hooks.onSaveFailed?.();
      return false;
    }
  }

  private writeSnapshot(
    key: string,
    snapshot: FolderData,
    companions: Record<string, unknown> | undefined,
  ): Promise<boolean | void> {
    return companions
      ? this.storage.saveData(key, snapshot, companions)
      : this.storage.saveData(key, snapshot);
  }

  private async persistDataSession(
    session: FolderDataSession,
    snapshot: FolderData,
    companions?: Record<string, unknown>,
    /** False for a draft or recovered backup: its failure leaves no local edit unsaved. */
    carriesEdit = true,
  ): Promise<boolean> {
    this.dataSessions.set(session.storageKey, session);
    session.saveInProgress = true;
    const gen = ++session.writeGen;
    let success = false;
    let refused = false;
    const serialized = serializeStoredValue(snapshot);
    let echo: StorageEcho | null = null;

    try {
      if (
        this.config.checkEmptyOverwrite &&
        snapshot.folders.length === 0 &&
        Object.keys(snapshot.folderContents).length === 0
      ) {
        // Check if we're about to overwrite non-empty data
        // Diagnostic only: unreadable or malformed buckets must not block a recovery save.
        const existingData = await this.storage.loadData(session.storageKey).catch(() => null);
        if (
          existingData &&
          validateFolderData(existingData) &&
          (existingData.folders.length > 0 || Object.keys(existingData.folderContents).length > 0)
        ) {
          console.warn(
            `${this.tag} WARNING: Attempting to save empty data over existing non-empty data`,
          );
          console.warn(`${this.tag} This may indicate a bug.`);
          // Still proceed, but log it prominently
        }
      }

      // Suppress this exact own-write echo, avoiding a redundant reload.
      echo = this.storageEchoes.arm(session.storageKey, serialized);
      success = (await this.writeSnapshot(session.storageKey, snapshot, companions)) !== false;
      if (!success) this.storageEchoes.disarm(echo);

      if (!success && this.config.retryFailedSave) {
        console.warn(`${this.tag} Save failed, retrying once...`);
        echo = this.storageEchoes.arm(session.storageKey, serialized);
        success = (await this.writeSnapshot(session.storageKey, snapshot, companions)) !== false;
        if (!success) this.storageEchoes.disarm(echo);
      }

      if (success) {
        session.baseline = cloneFolderData(snapshot);
        // Create primary backup AFTER successful save, without holding the save chain.
        void session.backup.createPrimaryBackup(snapshot);
        this.debug('Data saved successfully');
        // Every persistence path refreshes the floating panel through this hook.
        if (this.dataSession === session && !this.destroyed) {
          this.hooks.onChange('saved');
        }
      } else {
        console.error(`${this.tag} Save failed after retry`);
      }
    } catch (error) {
      refused = error instanceof LegacyFolderWriteRefusedError;
      if (!refused) console.error(`${this.tag} Save data error:`, error);
      this.storageEchoes.disarm(echo);
      success = false;
    } finally {
      if (success) session.settleFailedEdit(gen);
      else if (carriesEdit && !refused) session.failedEditGen = gen;
      // A temporary authority failure parks accepted edits; owner mismatch cancels them.
      if (refused && carriesEdit && !this.fence.reloadRequired && !this.destroyed) {
        session.pendingSave ??= snapshot;
      }
      // A newer queued snapshot can still persist this edit; report only a final failure.
      // A refused write already has a fence notice; do not cover it with a save-failed notice.
      if (!success && this.fence.canWrite && this.dataSession === session && !session.pendingSave) {
        this.hooks.onSaveFailed?.();
      }
      session.saveInProgress = false;
      if (this.destroyed && !this.fence.canWrite) {
        session.cancelPendingSave();
      }
      session.activeSave = null;
      if (this.fence.canWrite) this.drainPendingSave(session);
      // A later accepted debounce still belongs to this session after its older write settles.
      if (
        !session.pendingSave &&
        !session.saveInProgress &&
        !session.debouncePending &&
        this.dataSession !== session &&
        this.releasingSession !== session &&
        !session.replacingData
      ) {
        this.dataSessions.delete(session.storageKey);
      }
    }
    if (this.dataSession === session && !session.replacingData) {
      this.hooks.onPersistSettled?.();
      if (!session.saveInProgress) this.reconcileAfterWrite(session, success);
    }

    return success;
  }

  private drainPendingSave(session: FolderDataSession): void {
    if (!this.fence.canWrite || session.saveInProgress || !session.pendingSave) return;
    const snapshot = session.pendingSave;
    const completion = session.pendingSaveCompletion;
    session.pendingSave = null;
    session.pendingSaveCompletion = null;
    void session.backup.createEmergencyBackup(snapshot);
    session.activeSave = this.persistDataSession(session, snapshot);
    void session.activeSave.then((saved) => {
      if (!completion) return;
      if (
        !saved &&
        session.pendingSave &&
        !this.fence.canWrite &&
        !this.fence.reloadRequired &&
        !this.destroyed
      ) {
        if (session.pendingSaveCompletion)
          void session.pendingSaveCompletion.promise.then(completion.resolve);
        else session.pendingSaveCompletion = completion;
      } else completion.resolve(saved);
    });
  }

  private async initializeStorage(key: string): Promise<void> {
    if (!(await this.fence.check())) throw new LegacyFolderWriteRefusedError();
    let initialization = this.initializations.get(key);
    if (!initialization) {
      initialization = this.storage.init(key).catch((error) => {
        this.initializations.delete(key);
        throw error;
      });
      this.initializations.set(key, initialization);
    }
    await initialization;
  }

  private async loadAccountIsolationSetting(): Promise<void> {
    try {
      this.isolationEnabled = await accountIsolationService.isIsolationEnabled({
        platform: this.config.platform,
        pageUrl: window.location.href,
      });
      this.debug('Loaded account isolation setting:', this.isolationEnabled);
    } catch (error) {
      console.error(`${this.tag} Failed to load account isolation setting:`, error);
      this.isolationEnabled = false;
    }
  }

  async refreshAccountScope(): Promise<void> {
    // A reload-required tab must keep the unsaved session rather than release it for rebinding.
    if (this.fence.reloadRequired || this.destroyed) return;
    this.scopeRefreshPending = true;
    const request = ++this.accountScopeRequest;
    this.clearAccountScopeRetry();
    this.clearReadRetry();
    if (!this.accountScopeRetrying) this.accountScopeRetryAttempt = 0;
    const previous = this.dataSession ?? this.releasingSession;
    // Flush the old account's pending debounce before releasing its data owner.
    this.flushPendingSaveData();
    previous?.deactivate();
    this.releasingSession = previous;
    if (
      previous &&
      this.dataSession === previous &&
      this.fence.canWrite &&
      !previous.saveInProgress &&
      !previous.pendingSave &&
      !previous.debouncePending &&
      !previous.replacingData
    ) {
      this.dataSessions.delete(previous.storageKey);
    }
    this.dataSession = null;
    this.unresolvedData = { folders: [], folderContents: {} };
    this.resolvedAccountScope = null;
    this.activeStorageKey = '';
    this.hooks.onAccountReleased();
    this.hooks.onChange('account');
    let storageKey: string | null = null;
    try {
      let resolvedScope: AccountScope | null = null;
      let context: AccountContext | null = null;
      if (this.isolationEnabled) {
        context = detectAccountContextFromDocument(window.location.href, document);
        resolvedScope = await accountIsolationService.resolveAccountScope({
          pageUrl: window.location.href,
          routeUserId: context.routeUserId,
          email: context.email,
        });
      }
      if (request !== this.accountScopeRequest || this.destroyed) return;
      storageKey = resolvedScope
        ? buildScopedStorageKey(this.config.storageKey, resolvedScope.accountKey)
        : this.config.storageKey;
      // Resolve visibility even while authority is unavailable; binding waits for its timer.
      if (!this.fence.canWrite) throw new LegacyFolderWriteRefusedError();
      await this.initializeStorage(storageKey);
      if (request !== this.accountScopeRequest || this.destroyed) return;
      const session =
        this.dataSessions.get(storageKey) ??
        (previous?.storageKey === storageKey
          ? previous
          : new FolderDataSession(
              storageKey,
              this.config.backupNamespace,
              resolvedScope,
              validateFolderData,
              () => this.fence.canWrite,
              (operation) => this.fence.write(operation),
            ));
      this.dataSessions.set(storageKey, session);
      session.accountScope = resolvedScope;
      this.dataSession = session;
      this.releasingSession = null;
      this.scopeRefreshPending = false;
      this.resolvedAccountScope = resolvedScope;
      this.activeStorageKey = storageKey;
      this.hooks.onAccountBound?.(context);
      // A disabled rebind may have loaded before another context wrote this cached session.
      if (session.reconcilePending || session.debouncePending) session.ready = false;
      session.activate();
      this.accountScopeRetryAttempt = 0;
      if (session.ready) {
        this.hooks.onChange('title');
        this.hooks.onChange('loaded');
      }
      // A rebound session may hold a write observed before or during the switch.
      this.tryReconcile();
      if (session.readFailed) this.scheduleReadRetry(session);
    } catch (error) {
      if (request !== this.accountScopeRequest || this.destroyed) return;
      if (previous) {
        previous.ready = false;
        previous.reconcilePending = true;
        // Show retained edits only for the resolved bucket; persistence stays unbound until retry.
        if (storageKey === previous.storageKey) {
          this.unresolvedData = previous.data;
          this.hooks.onChange('availability');
        }
      }
      console.error(`${this.tag} Failed to resolve account scope:`, error);
      // Keep persistence unbound on failure. A global fallback has no known owner.
      if (this.fence.canWrite) this.scheduleAccountScopeRetry(request);
    }
  }

  /** Retry background scope resolution; an ownerless global fallback could overwrite another account. */
  private scheduleAccountScopeRetry(request: number): void {
    if (this.destroyed || request !== this.accountScopeRequest) return;
    const delay = ACCOUNT_SCOPE_RETRY_DELAYS[this.accountScopeRetryAttempt];
    if (delay === undefined) return;
    this.accountScopeRetryAttempt += 1;
    this.accountScopeRetry = window.setTimeout(() => {
      this.accountScopeRetry = null;
      if (this.destroyed || request !== this.accountScopeRequest) return;
      void this.retryAccountScope();
    }, delay);
  }

  private async retryAccountScope(): Promise<void> {
    this.accountScopeRetrying = true;
    try {
      await this.refreshAccountScope();
    } finally {
      this.accountScopeRetrying = false;
    }
    if (this.destroyed || !this.dataSession) return;
    await this.loadData();
    if (this.destroyed) return;
    this.hooks.onChange('title');
    this.hooks.onChange('data');
  }

  private clearAccountScopeRetry(): void {
    if (this.accountScopeRetry === null) return;
    window.clearTimeout(this.accountScopeRetry);
    this.accountScopeRetry = null;
  }

  /** Read `session`'s bucket again through the owner's reload, so a recovered read repaints. */
  private scheduleReadRetry(session: FolderDataSession): void {
    if (this.destroyed || this.readRetry !== null) return;
    const delay = READ_RETRY_DELAYS[Math.min(this.readRetryAttempt, READ_RETRY_DELAYS.length - 1)];
    this.readRetryAttempt += 1;
    this.readRetry = window.setTimeout(() => {
      this.readRetry = null;
      if (!this.destroyed && this.dataSession === session) this.hooks.onExternalChange();
    }, delay);
  }

  private clearReadRetry(): void {
    this.readRetryAttempt = 0;
    if (this.readRetry === null) return;
    window.clearTimeout(this.readRetry);
    this.readRetry = null;
  }

  private fenceChanged(): void {
    const sessions = new Set(this.dataSessions.values());
    if (this.dataSession) sessions.add(this.dataSession);
    if (this.releasingSession) sessions.add(this.releasingSession);
    if (!this.fence.canWrite) {
      this.clearAccountScopeRetry();
      this.clearReadRetry();
      for (const session of sessions) {
        session.loadVersion += 1;
        session.backup.destroy();
        session.pauseDebounce();
      }
      if (this.fence.reloadRequired) {
        this.accountScopeRequest += 1;
        if (this.releasingSession) {
          this.dataSession = this.releasingSession;
          this.releasingSession = null;
          this.activeStorageKey = this.dataSession.storageKey;
          this.resolvedAccountScope = this.dataSession.accountScope;
        }
        for (const session of sessions) {
          session.cancelPendingSave();
        }
      } else this.hooks.onRecovery('unreadable');
    } else {
      // Run after the authority check settles; accepted writes drain before any fresh read.
      void Promise.resolve().then(async () => {
        if (this.destroyed || !this.fence.canWrite) return;
        for (const session of sessions) this.drainPendingSave(session);
        if (!this.dataSession || this.scopeRefreshPending) await this.refreshAccountScope();
        if (this.dataSession?.ready) this.dataSession.markReady();
        await this.loadData();
      });
    }
    this.hooks.onChange('availability');
  }
}
