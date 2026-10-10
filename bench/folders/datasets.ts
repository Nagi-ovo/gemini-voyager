/**
 * Seeded, deterministic folder datasets for the folder performance baseline.
 *
 * Every generator returns valid `FolderData`: unique folder ids, a bucket for
 * every folder, parents that exist, no inherited object keys. The same seed
 * always yields byte-identical JSON, so a run before and after a rewrite
 * measures the same library.
 */
import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';

/** Gemini's and ChatGPT's root bucket; a serialized key, kept literal here. */
export const ROOT_BUCKET_ID = '__root_conversations__';

export type IdStyle = 'gemini' | 'chatgpt';

export interface DatasetSpec {
  readonly name: DatasetName;
  readonly description: string;
  readonly seed: number;
  readonly folders: number;
  /** Stored references across all buckets, root bucket included. */
  readonly refs: number;
  /** Share of `refs` filed in the root bucket. */
  readonly rootShare: number;
  /** Deepest folder depth (root = 0). Current UI creates at most depth 1. */
  readonly maxDepth: number;
  /** Chance that a new folder nests under the folder created just before it. */
  readonly chainBias: number;
  /** Distinct conversations; fewer than `refs` files the same one in several folders. */
  readonly uniqueConversations: number;
  /** Distinct titles and folder names; small pools create many duplicates. */
  readonly titlePool: number;
  readonly folderNamePool: number;
  /** Legacy data: no `sortIndex` on folders or references, as stored before manual order. */
  readonly legacy: boolean;
}

export type DatasetName = 'normal' | 'large' | 'deepLegacy' | 'duplicates';

export const DATASETS: Readonly<Record<DatasetName, DatasetSpec>> = {
  normal: {
    name: 'normal',
    description: '50 folders, 500 refs, two levels, a typical library',
    seed: 0x5eed_0001,
    folders: 50,
    refs: 500,
    rootShare: 0.04,
    maxDepth: 1,
    chainBias: 0,
    uniqueConversations: 500,
    titlePool: 400,
    folderNamePool: 50,
    legacy: false,
  },
  large: {
    name: 'large',
    description: '1,000 folders, 10,000 refs, two levels',
    seed: 0x5eed_0002,
    folders: 1000,
    refs: 10_000,
    rootShare: 0.02,
    maxDepth: 1,
    chainBias: 0,
    uniqueConversations: 10_000,
    titlePool: 6000,
    folderNamePool: 1000,
    legacy: false,
  },
  deepLegacy: {
    name: 'deepLegacy',
    description: '300 folders nested up to 24 levels, 3,000 refs, no sortIndex anywhere',
    seed: 0x5eed_0003,
    folders: 300,
    refs: 3000,
    rootShare: 0.03,
    maxDepth: 24,
    chainBias: 0.85,
    uniqueConversations: 3000,
    titlePool: 2000,
    folderNamePool: 300,
    legacy: true,
  },
  duplicates: {
    name: 'duplicates',
    description: '300 folders, 5,000 refs of 1,000 conversations, 25 titles, 20 folder names',
    seed: 0x5eed_0004,
    folders: 300,
    refs: 5000,
    rootShare: 0.02,
    maxDepth: 1,
    chainBias: 0,
    uniqueConversations: 1000,
    titlePool: 25,
    folderNamePool: 20,
    legacy: false,
  },
};

export const DATASET_NAMES = Object.keys(DATASETS) as DatasetName[];

/** mulberry32: tiny, fast and stable across engines. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const WORDS = [
  'plan',
  'project',
  'notes',
  'draft',
  'review',
  'meeting',
  'research',
  'budget',
  'design',
  'travel',
  'recipe',
  'python',
  'rust',
  'essay',
  'thesis',
  'paper',
  'summary',
  'ideas',
  'launch',
  'bug',
  'deploy',
  'invoice',
  'workout',
  'lecture',
  'translation',
  'interview',
  'roadmap',
  'question',
  'chart',
  'grant',
] as const;

const BASE_TIME = 1_700_000_000_000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function hex(random: () => number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += Math.floor(random() * 16).toString(16);
  return out;
}

function phrase(random: () => number, index: number, words: number): string {
  const parts: string[] = [];
  let n = index;
  for (let i = 0; i < words; i++) {
    parts.push(WORDS[(n + Math.floor(random() * 3)) % WORDS.length]);
    n = Math.floor(n / WORDS.length) + i * 7 + 3;
  }
  return parts.join(' ');
}

interface ConversationSeed {
  readonly conversationId: string;
  readonly url: string;
  readonly title: string;
  readonly addedAt: number;
  readonly lastOpenedAt: number;
}

function conversationIdentity(
  random: () => number,
  style: IdStyle,
): { conversationId: string; url: string } {
  if (style === 'chatgpt') {
    const uuid = `${hex(random, 8)}-${hex(random, 4)}-${hex(random, 4)}-${hex(random, 4)}-${hex(random, 12)}`;
    return { conversationId: `chatgpt:conv:${uuid}`, url: `https://chatgpt.com/c/${uuid}` };
  }
  const id = hex(random, 16);
  return { conversationId: `c_${id}`, url: `https://gemini.google.com/app/${id}` };
}

/** Builds one dataset. `idStyle` only changes conversation ids and URLs. */
export function generateFolderData(spec: DatasetSpec, idStyle: IdStyle = 'gemini'): FolderData {
  const random = createRandom(spec.seed);

  const titles = Array.from({ length: spec.titlePool }, (_, i) => {
    const text = phrase(random, i, 2 + (i % 3));
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
  });
  const folderNames = Array.from({ length: spec.folderNamePool }, (_, i) => {
    const text = phrase(random, i * 13 + 5, 1 + (i % 2));
    return spec.folderNamePool >= spec.folders ? `${text} ${i + 1}` : text;
  });

  const conversations: ConversationSeed[] = Array.from({ length: spec.uniqueConversations }, () => {
    const addedAt = BASE_TIME + Math.floor(random() * YEAR_MS);
    return {
      ...conversationIdentity(random, idStyle),
      title: titles[Math.floor(random() * titles.length)],
      addedAt,
      lastOpenedAt: addedAt + Math.floor(random() * 30 * 24 * 60 * 60 * 1000),
    };
  });

  // Folders: each one either chains under the previous folder (deep trees) or
  // picks a random parent that still has room under maxDepth.
  const folders: Folder[] = [];
  const depthOf = new Map<string, number>();
  const sortCounters = new Map<string, number>();
  for (let i = 0; i < spec.folders; i++) {
    const id = `folder-${i.toString(36)}-${hex(random, 6)}`;
    let parentId: string | null = null;
    const previous = folders[folders.length - 1];
    if (
      previous &&
      spec.chainBias > 0 &&
      random() < spec.chainBias &&
      (depthOf.get(previous.id) ?? 0) < spec.maxDepth
    ) {
      parentId = previous.id;
    } else if (folders.length > 0 && random() < 0.6) {
      const candidate = folders[Math.floor(random() * folders.length)];
      if ((depthOf.get(candidate.id) ?? 0) < spec.maxDepth) parentId = candidate.id;
    }
    depthOf.set(id, parentId ? (depthOf.get(parentId) ?? 0) + 1 : 0);
    const siblingKey = parentId ?? '';
    const sortIndex = sortCounters.get(siblingKey) ?? 0;
    sortCounters.set(siblingKey, sortIndex + 1);
    const createdAt = BASE_TIME + Math.floor(random() * YEAR_MS);
    const folder: Folder = {
      id,
      name: folderNames[i % folderNames.length],
      parentId,
      isExpanded: random() < 0.5,
      createdAt,
      updatedAt: createdAt + Math.floor(random() * 1000 * 60 * 60),
    };
    if (random() < 0.05) folder.pinned = true;
    if (random() < 0.3) folder.color = ['blue', 'green', 'red', 'purple'][Math.floor(random() * 4)];
    if (!spec.legacy) folder.sortIndex = sortIndex;
    folders.push(folder);
  }

  const folderContents: Record<string, ConversationReference[]> = {};
  for (const folder of folders) folderContents[folder.id] = [];
  folderContents[ROOT_BUCKET_ID] = [];

  // References: the first pass files each unique conversation once; later
  // passes file it again in other folders, which is what duplicates means here.
  const rootRefs = Math.round(spec.refs * spec.rootShare);
  const bucketIds = folders.map((folder) => folder.id);
  for (let r = 0; r < spec.refs; r++) {
    const conversation = conversations[r % conversations.length];
    const bucketId =
      r < rootRefs || bucketIds.length === 0
        ? ROOT_BUCKET_ID
        : bucketIds[Math.floor(random() * bucketIds.length)];
    const bucket = folderContents[bucketId];
    if (bucket.some((ref) => ref.conversationId === conversation.conversationId)) continue;
    const ref: ConversationReference = {
      conversationId: conversation.conversationId,
      title: conversation.title,
      url: conversation.url,
      addedAt: conversation.addedAt,
      lastOpenedAt: conversation.lastOpenedAt,
    };
    if (random() < 0.08) ref.starred = true;
    if (random() < 0.05) ref.customTitle = true;
    if (!spec.legacy) ref.sortIndex = bucket.length;
    bucket.push(ref);
  }

  return { folders, folderContents };
}

/** Same data with every folder expanded or collapsed. Shares conversation records. */
export function withExpansion(data: FolderData, expanded: boolean): FolderData {
  return {
    folders: data.folders.map((folder) => ({ ...folder, isExpanded: expanded })),
    folderContents: data.folderContents,
  };
}

/** Same data with one folder renamed, as an immutable update. */
export function withRenamedFolder(data: FolderData, folderId: string, name: string): FolderData {
  return {
    folders: data.folders.map((folder) =>
      folder.id === folderId ? { ...folder, name, updatedAt: folder.updatedAt + 1 } : folder,
    ),
    folderContents: data.folderContents,
  };
}

export interface DatasetSummary {
  readonly name: DatasetName;
  readonly folders: number;
  readonly buckets: number;
  readonly refs: number;
  readonly uniqueConversations: number;
  readonly maxDepth: number;
  readonly jsonBytes: number;
}

export function summarize(name: DatasetName, data: FolderData): DatasetSummary {
  const byId = new Map(data.folders.map((folder) => [folder.id, folder]));
  let maxDepth = 0;
  for (const folder of data.folders) {
    let depth = 0;
    let current = folder;
    while (current.parentId && byId.has(current.parentId)) {
      depth++;
      current = byId.get(current.parentId)!;
    }
    maxDepth = Math.max(maxDepth, depth);
  }
  const ids = new Set<string>();
  let refs = 0;
  for (const bucket of Object.values(data.folderContents)) {
    refs += bucket.length;
    for (const ref of bucket) ids.add(ref.conversationId);
  }
  return {
    name,
    folders: data.folders.length,
    buckets: Object.keys(data.folderContents).length,
    refs,
    uniqueConversations: ids.size,
    maxDepth,
    jsonBytes: JSON.stringify(data).length,
  };
}

/** The folder holding the most references. */
export function pickBusiestFolder(data: FolderData): string {
  let best = data.folders[0]?.id ?? ROOT_BUCKET_ID;
  let bestSize = -1;
  for (const folder of data.folders) {
    const size = data.folderContents[folder.id]?.length ?? 0;
    if (size > bestSize) {
      best = folder.id;
      bestSize = size;
    }
  }
  return best;
}
