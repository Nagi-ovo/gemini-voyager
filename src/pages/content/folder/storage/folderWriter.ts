import { LegacyFolderFence } from '@/features/folder/owner/legacyFolderFence';

export type FolderWriter = <T>(key: string, operation: () => T | Promise<T>) => Promise<T>;

/** Standalone adapters share the same fresh physical-write gate as repositories. */
export function createFolderWriter(): FolderWriter {
  let fence: LegacyFolderFence | undefined;
  return (key, operation) => {
    fence ??= new LegacyFolderFence(key, () => {}, false);
    return fence.write(operation);
  };
}
