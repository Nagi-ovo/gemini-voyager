/**
 * IndexedDB store for folder attachment files (Folder-as-Project feature).
 *
 * Files are stored as ArrayBuffers keyed by their attachment ID (UUID string).
 * The metadata (name, size, mimeType, storedAt) lives in the Folder object
 * inside chrome.storage; only the binary payload is kept here.
 *
 * Pattern mirrors src/core/utils/idb.ts.
 */

const DB_NAME = 'gv-folder-files';
const STORE_NAME = 'files';
const DB_VERSION = 1;

export interface StoredFile {
  id: string;
  folderId: string;
  name: string;
  mimeType: string;
  data: ArrayBuffer;
}

/**
 * Opens (or creates) the IndexedDB database, creating the object store on
 * first run.
 *
 * @returns Promise resolving to the open IDBDatabase instance
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persist a file's binary content in IndexedDB.
 *
 * @param file - Complete file record including the ArrayBuffer payload
 */
export async function saveFile(file: StoredFile): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(file);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch {
    // IndexedDB unavailable — silently ignore
  }
}

/**
 * Load a stored file by its ID.
 *
 * @param id - The attachment ID (UUID) used as the store key
 * @returns The stored file record, or null if not found / unavailable
 */
export async function loadFile(id: string): Promise<StoredFile | null> {
  try {
    const db = await openDB();
    return new Promise<StoredFile | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => {
        const result: unknown = request.result;
        resolve(isStoredFile(result) ? result : null);
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch {
    return null;
  }
}

/**
 * Delete a stored file by its ID.
 *
 * @param id - The attachment ID to remove
 */
export async function removeFile(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch {
    // Silently ignore
  }
}

/**
 * Return all stored files belonging to a given folder.
 *
 * @param folderId - Filter results to this folder
 * @returns Array of matching stored files (may be empty)
 */
export async function listFilesForFolder(folderId: string): Promise<StoredFile[]> {
  try {
    const db = await openDB();
    return new Promise<StoredFile[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const all: unknown[] = Array.isArray(request.result) ? request.result : [];
        resolve(all.filter(isStoredFile).filter((f) => f.folderId === folderId));
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch {
    return [];
  }
}

// ============================================================================
// Type guard
// ============================================================================

function isStoredFile(value: unknown): value is StoredFile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  // Use duck-typing for the data field: real ArrayBuffer and fake-indexeddb's
  // serialized equivalent both expose a numeric byteLength property.
  const data = v.data;
  const hasDataField =
    data != null &&
    typeof data === 'object' &&
    typeof (data as Record<string, unknown>).byteLength === 'number';
  return (
    typeof v.id === 'string' &&
    typeof v.folderId === 'string' &&
    typeof v.name === 'string' &&
    typeof v.mimeType === 'string' &&
    hasDataField
  );
}
