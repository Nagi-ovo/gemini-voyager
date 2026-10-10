import { DRIVE_API_BASE } from './GoogleDriveFiles';
import { logger } from './LoggerService';

const BACKUP_FOLDER_NAME = 'Voyager Data';
const LEGACY_BACKUP_FOLDER_NAME = 'Gemini Voyager Data';
const BACKUP_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const BACKUP_FOLDER_MARKER_KEY = 'voyagerDataFolder';
const BACKUP_FOLDER_MARKER_VALUE = '1';

interface DriveFolderMetadata {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  trashed?: boolean;
}

interface DriveSyncFileMetadata {
  id: string;
  name: string;
  parents?: string[];
}

/** Owns stable Drive backup-folder identity, discovery and conservative metadata migration. */
export class GoogleDriveBackupFolder {
  private backupFolderId: string | null = null;
  private backupFolderResolutionPromise: Promise<string | null> | null = null;

  constructor(private readonly recoveryFileNames: readonly string[]) {}

  get id(): string | null {
    return this.backupFolderId;
  }

  reset(): void {
    this.backupFolderId = null;
    this.backupFolderResolutionPromise = null;
  }

  /**
   * Resolve without relying on names; serialize discovery to prevent duplicate first-upload folders.
   *
   * Resolution order is deliberately conservative:
   * 1. A folder carrying Voyager's private appProperties marker.
   * 2. The folder containing the largest set of known Voyager sync files.
   * 3. A folder with the canonical or legacy display name.
   *
   * The legacy folder is renamed in place only when no canonical-name conflict
   * exists. We never delete or merge ambiguous folders automatically.
   */
  async resolve(token: string, createIfMissing: boolean): Promise<string | null> {
    if (this.backupFolderResolutionPromise) {
      const activeResult = await this.backupFolderResolutionPromise;
      if (activeResult || !createIfMissing) return activeResult;
    }

    const resolution = this.resolveBackupFolderUncached(token, createIfMissing);
    this.backupFolderResolutionPromise = resolution;
    try {
      return await resolution;
    } finally {
      if (this.backupFolderResolutionPromise === resolution) {
        this.backupFolderResolutionPromise = null;
      }
    }
  }

  private async resolveBackupFolderUncached(
    token: string,
    createIfMissing: boolean,
  ): Promise<string | null> {
    if (this.backupFolderId) {
      const cachedFolder = await this.getDriveFolderMetadata(token, this.backupFolderId);
      if (cachedFolder) return cachedFolder.id;
      this.backupFolderId = null;
    }

    const [markedFolders, namedFolders, syncFileParentScores] = await Promise.all([
      this.listDriveFolders(
        token,
        `appProperties has { key='${BACKUP_FOLDER_MARKER_KEY}' and value='${BACKUP_FOLDER_MARKER_VALUE}' }`,
      ),
      this.listDriveFolders(
        token,
        `(name='${this.escapeDriveQueryValue(BACKUP_FOLDER_NAME)}' or name='${this.escapeDriveQueryValue(LEGACY_BACKUP_FOLDER_NAME)}')`,
      ),
      this.getSyncFileParentScores(token).catch((error) => {
        // Content-parent recovery is only a fallback for folders renamed before
        // this marker existed. A transient failure here must not block normal
        // name/marker discovery or create a duplicate folder.
        console.warn('[GoogleDriveSyncService] Could not inspect sync-file parents:', error);
        return new Map<string, number>();
      }),
    ]);

    const candidatesById = new Map<string, DriveFolderMetadata>();
    [...markedFolders, ...namedFolders].forEach((folder) => candidatesById.set(folder.id, folder));

    const recoveredParentIds = [...syncFileParentScores.entries()]
      .sort(([, leftScore], [, rightScore]) => rightScore - leftScore)
      .slice(0, 5)
      .map(([parentId]) => parentId)
      .filter((parentId) => !candidatesById.has(parentId));

    const recoveredFolders = await Promise.all(
      recoveredParentIds.map((parentId) => this.getDriveFolderMetadata(token, parentId)),
    );
    recoveredFolders.forEach((folder) => {
      if (folder) candidatesById.set(folder.id, folder);
    });

    const candidates = [...candidatesById.values()];
    const selected = this.selectBackupFolderCandidate(candidates, syncFileParentScores);
    if (selected) {
      const hasCanonicalConflict = candidates.some(
        (folder) => folder.id !== selected.id && folder.name === BACKUP_FOLDER_NAME,
      );
      const prepared = await this.prepareBackupFolder(
        token,
        selected,
        selected.name === LEGACY_BACKUP_FOLDER_NAME && !hasCanonicalConflict,
      );
      this.backupFolderId = prepared.id;
      return prepared.id;
    }

    if (!createIfMissing) return null;

    const metadata = {
      name: BACKUP_FOLDER_NAME,
      mimeType: BACKUP_FOLDER_MIME_TYPE,
      appProperties: {
        [BACKUP_FOLDER_MARKER_KEY]: BACKUP_FOLDER_MARKER_VALUE,
      },
    };
    const createResponse = await fetch(`${DRIVE_API_BASE}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!createResponse.ok) throw new Error('Failed to create backup folder');
    const folderData = (await createResponse.json()) as { id?: unknown };
    if (typeof folderData.id !== 'string' || !folderData.id) {
      throw new Error('Drive returned an invalid backup folder');
    }
    this.backupFolderId = folderData.id;
    logger.info('[GoogleDriveSyncService] Created backup folder', {
      folderId: this.backupFolderId,
    });
    return folderData.id;
  }

  private async listDriveFolders(
    token: string,
    identityClause: string,
  ): Promise<DriveFolderMetadata[]> {
    const query = `${identityClause} and mimeType='${BACKUP_FOLDER_MIME_TYPE}' and trashed=false`;
    const url = new URL(`${DRIVE_API_BASE}/files`);
    url.searchParams.set('q', query);
    url.searchParams.set('fields', 'files(id,name,mimeType,parents,appProperties,trashed)');
    url.searchParams.set('pageSize', '100');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Failed to search for backup folder');
    const data = (await response.json()) as { files?: unknown };
    return this.parseDriveFolders(data.files);
  }

  private async getSyncFileParentScores(token: string): Promise<Map<string, number>> {
    const nameClauses = this.recoveryFileNames.map(
      (name) => `name='${this.escapeDriveQueryValue(name)}'`,
    );
    const query = `(${nameClauses.join(' or ')}) and trashed=false`;
    const url = new URL(`${DRIVE_API_BASE}/files`);
    url.searchParams.set('q', query);
    url.searchParams.set('fields', 'files(id,name,parents)');
    url.searchParams.set('pageSize', '1000');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Failed to inspect backup files');
    const data = (await response.json()) as { files?: unknown };
    const files = Array.isArray(data.files)
      ? data.files.filter((file): file is DriveSyncFileMetadata =>
          this.isDriveSyncFileMetadata(file),
        )
      : [];
    const namesByParent = new Map<string, Set<string>>();
    files.forEach((file) => {
      file.parents?.forEach((parentId) => {
        const names = namesByParent.get(parentId) ?? new Set<string>();
        names.add(file.name);
        namesByParent.set(parentId, names);
      });
    });
    return new Map([...namesByParent.entries()].map(([parentId, names]) => [parentId, names.size]));
  }

  private selectBackupFolderCandidate(
    candidates: DriveFolderMetadata[],
    syncFileParentScores: Map<string, number>,
  ): DriveFolderMetadata | null {
    const rank = (folder: DriveFolderMetadata): [number, number, number, string] => [
      folder.appProperties?.[BACKUP_FOLDER_MARKER_KEY] === BACKUP_FOLDER_MARKER_VALUE ? 1 : 0,
      syncFileParentScores.get(folder.id) ?? 0,
      folder.name === BACKUP_FOLDER_NAME ? 2 : folder.name === LEGACY_BACKUP_FOLDER_NAME ? 1 : 0,
      folder.id,
    ];

    return (
      [...candidates].sort((left, right) => {
        const leftRank = rank(left);
        const rightRank = rank(right);
        return (
          rightRank[0] - leftRank[0] ||
          rightRank[1] - leftRank[1] ||
          rightRank[2] - leftRank[2] ||
          leftRank[3].localeCompare(rightRank[3])
        );
      })[0] ?? null
    );
  }

  private async prepareBackupFolder(
    token: string,
    folder: DriveFolderMetadata,
    renameLegacyFolder: boolean,
  ): Promise<DriveFolderMetadata> {
    const needsMarker =
      folder.appProperties?.[BACKUP_FOLDER_MARKER_KEY] !== BACKUP_FOLDER_MARKER_VALUE;
    if (!needsMarker && !renameLegacyFolder) return folder;

    const metadata: {
      name?: string;
      appProperties?: Record<string, string>;
    } = {};
    if (renameLegacyFolder) metadata.name = BACKUP_FOLDER_NAME;
    if (needsMarker) {
      metadata.appProperties = {
        ...folder.appProperties,
        [BACKUP_FOLDER_MARKER_KEY]: BACKUP_FOLDER_MARKER_VALUE,
      };
    }

    const url = new URL(`${DRIVE_API_BASE}/files/${folder.id}`);
    url.searchParams.set('fields', 'id,name,mimeType,parents,appProperties,trashed');
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });
    if (!response.ok) {
      console.warn(
        '[GoogleDriveSyncService] Could not rename or mark the existing backup folder; continuing with its stable Drive ID',
      );
      return folder;
    }

    const updated = (await response.json()) as unknown;
    return this.isDriveFolderMetadata(updated)
      ? updated
      : {
          ...folder,
          ...metadata,
        };
  }

  private async getDriveFolderMetadata(
    token: string,
    folderId: string,
  ): Promise<DriveFolderMetadata | null> {
    const url = new URL(`${DRIVE_API_BASE}/files/${folderId}`);
    url.searchParams.set('fields', 'id,name,mimeType,parents,appProperties,trashed');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Failed to inspect backup folder: ${response.status}`);
    const data = (await response.json()) as unknown;
    if (!this.isDriveFolderMetadata(data) || data.trashed) return null;
    if (data.mimeType && data.mimeType !== BACKUP_FOLDER_MIME_TYPE) return null;
    return data;
  }

  private parseDriveFolders(value: unknown): DriveFolderMetadata[] {
    return Array.isArray(value)
      ? value.filter(
          (folder): folder is DriveFolderMetadata =>
            this.isDriveFolderMetadata(folder) && !folder.trashed,
        )
      : [];
  }

  private isDriveFolderMetadata(value: unknown): value is DriveFolderMetadata {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<DriveFolderMetadata>;
    return typeof candidate.id === 'string' && typeof candidate.name === 'string';
  }

  private isDriveSyncFileMetadata(value: unknown): value is DriveSyncFileMetadata {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<DriveSyncFileMetadata>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.name === 'string' &&
      (candidate.parents === undefined ||
        (Array.isArray(candidate.parents) &&
          candidate.parents.every((parent) => typeof parent === 'string')))
    );
  }

  private escapeDriveQueryValue(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
  }
}
