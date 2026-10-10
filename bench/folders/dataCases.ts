/**
 * Data-side folder benchmarks. Runs anywhere with `window`, `localStorage` and
 * the extension API stub installed: node (with shims) and the browser page.
 *
 * To re-run after a rewrite, keep the dataset and metric names and point the
 * imports below at the new owners of the same work.
 */
import type { FolderData } from '@/core/types/folder';
import { reorderConversations, normalizeFolderData } from '@/features/folder/model/folderData';
import { FolderRepository } from '@/pages/content/folder/FolderRepository';
import { createConversationMembershipLookup } from '@/pages/content/folder/conversationMembership';
import { GEMINI_FOLDER_CONFIG } from '@/pages/content/folder/platformFolderConfig';
import { LocalStorageFolderAdapter } from '@/pages/content/folder/storage/FolderStorageAdapter';

import {
  DATASETS,
  type DatasetName,
  createRandom,
  generateFolderData,
  withRenamedFolder,
} from './datasets';
import { type BenchResult, computeStats, countOver } from './stats';
import { installExtensionApiStub } from './stubs/extensionApi';

export interface DataBenchOptions {
  readonly datasets: readonly DatasetName[];
  /** Multiplies every run count; 1 is the recorded baseline. */
  readonly runScale: number;
  /** Long tasks reported by the host while `run` was awaited, when it can count them. */
  readonly countLongTasks?: <T>(run: () => Promise<T>) => Promise<{ value: T; longTasks: number }>;
}

interface SampleOptions {
  readonly runs: number;
  readonly warmup: number;
  /** Calls per sample, for operations far below the timer resolution. */
  readonly inner?: number;
}

async function sample(
  options: SampleOptions,
  op: (iteration: number) => unknown,
  setup?: (iteration: number) => void | Promise<void>,
): Promise<number[]> {
  const inner = options.inner ?? 1;
  const samples: number[] = [];
  for (let i = 0; i < options.warmup + options.runs; i++) {
    await setup?.(i);
    const start = performance.now();
    for (let j = 0; j < inner; j++) await op(i * inner + j);
    const elapsed = (performance.now() - start) / inner;
    if (i >= options.warmup) samples.push(elapsed);
  }
  return samples;
}

function runs(dataset: DatasetName, scale: number, small: number, big: number): number {
  return Math.max(3, Math.round((dataset === 'large' ? big : small) * scale));
}

function busiestBuckets(data: FolderData): string[] {
  return data.folders
    .map((folder) => folder.id)
    .sort(
      (a, b) =>
        (data.folderContents[b]?.length ?? 0) - (data.folderContents[a]?.length ?? 0) ||
        a.localeCompare(b),
    );
}

/** A sidebar's worth of native row ids: filed ones (some without `c_`) and unfiled ones. */
function nativeRowIds(data: FolderData, count: number, seed: number): string[] {
  const random = createRandom(seed);
  const filed = Object.values(data.folderContents).flatMap((bucket) =>
    bucket.map((ref) => ref.conversationId),
  );
  return Array.from({ length: count }, (_, index) => {
    if (index % 2 === 0 && filed.length) {
      const id = filed[Math.floor(random() * filed.length)];
      return index % 4 === 0 ? id.replace(/^c_/, '') : id;
    }
    let hex = '';
    for (let i = 0; i < 16; i++) hex += Math.floor(random() * 16).toString(16);
    return `c_${hex}`;
  });
}

export async function runDataBenchmarks(options: DataBenchOptions): Promise<BenchResult[]> {
  const stub = installExtensionApiStub();
  const results: BenchResult[] = [];
  const record = async (
    dataset: DatasetName,
    metric: string,
    measure: () => Promise<number[]>,
    note?: () => string | undefined,
  ): Promise<void> => {
    const counted = options.countLongTasks
      ? await options.countLongTasks(measure)
      : { value: await measure(), longTasks: null };
    results.push({
      surface: 'data',
      dataset,
      metric,
      stats: computeStats(counted.value),
      longTasks: counted.longTasks,
      samplesOver50ms: countOver(counted.value),
      ...(note?.() ? { note: note() } : {}),
    });
  };

  for (const dataset of options.datasets) {
    const spec = DATASETS[dataset];
    const data = generateFolderData(spec);
    const scale = options.runScale;

    // 1. normalizeFolderData: every load and every save runs it on the whole library.
    await record(dataset, 'normalizeFolderData', () =>
      sample({ runs: runs(dataset, scale, 40, 20), warmup: 3, inner: 5 }, () =>
        normalizeFolderData(data),
      ),
    );

    // 2. One save through FolderRepository with Chrome's adapter: normalize, clone,
    //    emergency backup, echo serialization, the adapter's JSON + localStorage
    //    write and verify, chrome.storage.local.set (stubbed), primary backup.
    localStorage.clear();
    await stub.storage.local.clear();
    const key = GEMINI_FOLDER_CONFIG.storageKey;
    await stub.storage.local.set({ [key]: data });
    let saveFailures = 0;
    const repository = new FolderRepository(GEMINI_FOLDER_CONFIG, new LocalStorageFolderAdapter(), {
      onChange: () => {},
      onRecovery: () => {},
      onExternalChange: () => {},
      onAccountReleased: () => {},
      isEnabled: () => true,
      onSaveFailed: () => {
        saveFailures++;
      },
    });
    await repository.init();
    const target = busiestBuckets(data)[0];
    await new Promise((resolve) => setTimeout(resolve, 5));
    const saveRuns = runs(dataset, scale, 30, 10);
    const rename = async (iteration: number) => {
      repository.data = withRenamedFolder(repository.data, target, `Renamed ${iteration}`);
      // Let the previous write's storage echo arrive outside the timed window.
      await new Promise((resolve) => setTimeout(resolve, 2));
    };
    // Backups write to localStorage too and swallow quota errors, so the
    // footprint after the runs shows whether every copy still fits.
    const footprint = () => {
      let chars = 0;
      const names: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const name = localStorage.key(i) ?? '';
        names.push(name.replace(/^gvBackup_[^_]+_/, 'backup:'));
        chars += name.length + (localStorage.getItem(name)?.length ?? 0);
      }
      return `localStorage after: ${(chars / 1e6).toFixed(2)}M chars, keys ${names.sort().join(', ')}`;
    };
    const saveNote = () =>
      saveFailures > 0
        ? `${saveFailures} saves reported failure (localStorage quota); ${footprint()}`
        : footprint();
    saveFailures = 0;
    await record(
      dataset,
      'FolderRepository save (await saveData)',
      () => sample({ runs: saveRuns, warmup: 2 }, () => repository.saveData(), rename),
      saveNote,
    );
    // The same save, through to the storage.onChanged echo the repository consumes.
    saveFailures = 0;
    const saveWithEcho = () =>
      sample(
        { runs: saveRuns, warmup: 2 },
        async () => {
          const echoed = new Promise<void>((resolve) => {
            const listener = () => {
              stub.storage.onChanged.removeListener(listener);
              resolve();
            };
            stub.storage.onChanged.addListener(listener);
          });
          await repository.saveData();
          await echoed;
        },
        rename,
      );
    await record(dataset, 'FolderRepository save + storage echo', saveWithEcho, saveNote);
    repository.destroy();
    localStorage.clear();

    // 3. Batch reorder: move up to 50 selected references, within the busiest
    //    bucket and from it into the next busiest.
    const [source, destination] = busiestBuckets(data);
    const bucket = data.folderContents[source];
    const k = Math.min(50, Math.max(1, Math.floor(bucket.length / 2)));
    const ids = bucket.filter((_, index) => index % 2 === 0).map((ref) => ref.conversationId);
    const selected = ids.slice(0, k);
    await record(
      dataset,
      `reorderConversations (${selected.length} of ${bucket.length}, same folder)`,
      () =>
        sample({ runs: runs(dataset, scale, 40, 30), warmup: 3, inner: 10 }, () =>
          reorderConversations(data, selected, source, source, 0),
        ),
    );
    await record(
      dataset,
      `reorderConversations (${selected.length} of ${bucket.length}, into another folder)`,
      () =>
        sample({ runs: runs(dataset, scale, 40, 30), warmup: 3, inner: 10 }, () =>
          reorderConversations(data, selected, source, destination, 0),
        ),
    );

    // 4. conversationMembership: one lookup per native sidebar row in one task,
    //    as the sidebar observer does; the index is built once per batch.
    const rows = nativeRowIds(data, 500, spec.seed);
    await record(dataset, 'conversationMembership (500 rows, one batch)', () =>
      sample({ runs: runs(dataset, scale, 40, 20), warmup: 3 }, () => {
        const lookup = createConversationMembershipLookup();
        let filed = 0;
        for (const id of rows) if (lookup(data.folderContents).has(id)) filed++;
        return filed;
      }),
    );
  }
  return results;
}
