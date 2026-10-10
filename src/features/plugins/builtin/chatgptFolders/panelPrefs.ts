import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

type Point = { x: number; y: number };

/** Where the ChatGPT folder panel and its button sit on this device. */
export type ChatGptFolderPanelPrefs = {
  open: boolean;
  pos: Point | null;
  size: { w: number; h: number } | null;
  fabPos: Point | null;
};

const DEFAULT_PREFS: ChatGptFolderPanelPrefs = { open: false, pos: null, size: null, fabPos: null };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function readPoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y } = value as Record<string, unknown>;
  return isFiniteNumber(x) && isFiniteNumber(y) ? { x, y } : null;
}

function readSize(value: unknown): { w: number; h: number } | null {
  if (!value || typeof value !== 'object') return null;
  const { w, h } = value as Record<string, unknown>;
  return isFiniteNumber(w) && isFiniteNumber(h) ? { w, h } : null;
}

export function parsePanelPrefs(value: unknown): ChatGptFolderPanelPrefs {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PREFS };
  const raw = value as Record<string, unknown>;
  return {
    open: raw.open === true,
    pos: readPoint(raw.pos),
    size: readSize(raw.size),
    fabPos: readPoint(raw.fabPos),
  };
}

export async function loadPanelPrefs(): Promise<ChatGptFolderPanelPrefs> {
  try {
    const stored = await browser.storage.local.get(StorageKeys.CHATGPT_FOLDER_PANEL);
    return parsePanelPrefs(stored[StorageKeys.CHATGPT_FOLDER_PANEL]);
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function savePanelPrefs(prefs: ChatGptFolderPanelPrefs): Promise<void> {
  try {
    await browser.storage.local.set({ [StorageKeys.CHATGPT_FOLDER_PANEL]: prefs });
  } catch {
    // Geometry is a convenience; an invalidated context or full quota loses only that.
  }
}
