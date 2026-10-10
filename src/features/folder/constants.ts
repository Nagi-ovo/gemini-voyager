// Keep the serialized keys stable so existing pre-import snapshots remain readable.
export const SESSION_BACKUP_KEY = 'gvFolderBackup';
export const SESSION_BACKUP_TIMESTAMP_KEY = 'gvFolderBackupTimestamp';

/**
 * Gemini's root-level conversation bucket in `folderContents`. Serialized key:
 * never rename it. Other platforms own their own literal (AI Studio uses
 * `__uncategorized__`), so do not reuse this for them.
 */
export const ROOT_CONVERSATIONS_ID = '__root_conversations__';

/** AI Studio's root-level prompt bucket in `folderContents`. Serialized key: never rename it. */
export const AISTUDIO_ROOT_BUCKET_ID = '__uncategorized__';

/**
 * Cap nesting at 2 total layers: root (depth 0) plus one subfolder level
 * (depth 1). Deeper pre-existing data keeps rendering; only new creation
 * beyond this is blocked.
 */
export const MAX_FOLDER_DEPTH = 1;
