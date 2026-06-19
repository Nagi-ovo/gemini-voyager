import React, { useEffect, useState } from 'react';

import { StorageKeys } from '@/core/types/common';

import { Card, CardTitle } from '../../../components/ui/card';
import { useLanguage } from '../../../contexts/LanguageContext';

/**
 * Gem picker for the sidebar Gems section.
 *
 * Lists every gem the extension knows about (the /gems/view scrape cache plus
 * the recently-used history) and lets the user pin specific gems. Pinned gems
 * always render first in the sidebar, in the order shown here; the up/down
 * arrows reorder them. The pinned ids persist to `chrome.storage.sync`
 * (`GV_GEMS_PINNED`) so the choice follows the user across devices — names
 * resolve from each device's local cache.
 */

interface KnownGem {
  id: string;
  name: string;
  iconLetter?: string;
}

/** Narrow a raw storage value into the displayable gem shape. */
function toKnownGems(raw: unknown): KnownGem[] {
  if (!Array.isArray(raw)) return [];
  const out: KnownGem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { id, name, iconLetter } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string' || !id || !name) continue;
    out.push({ id, name, iconLetter: typeof iconLetter === 'string' ? iconLetter : undefined });
  }
  return out;
}

function toPinnedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

const ICON_PIN = (
  <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
    <path d="m640-480 80 80v80H520v240l-40 40-40-40v-240H240v-80l80-80v-280h-40v-80h400v80h-40v280Zm-286 80h252l-46-46v-314H400v314l-46 46Zm126 0Z" />
  </svg>
);

const ICON_CLOSE = (
  <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
    <path d="M256-200 200-256l224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
  </svg>
);

const ICON_UP = (
  <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
    <path d="M480-528 296-344l-56-56 240-240 240 240-56 56-184-184Z" />
  </svg>
);

const ICON_DOWN = (
  <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
    <path d="M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z" />
  </svg>
);

function GemIconLetter({ gem }: { gem: KnownGem }) {
  return (
    <span className="bg-primary/10 text-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
      {(gem.iconLetter || gem.name.trim().charAt(0) || '?').toUpperCase()}
    </span>
  );
}

function RowButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground hover:bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-30 [&_svg]:h-4 [&_svg]:w-4"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function GemsPinSettings() {
  const { t } = useLanguage();
  const [knownGems, setKnownGems] = useState<KnownGem[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      chrome.storage?.local?.get(
        [StorageKeys.GV_GEMS_LIST_CACHE, StorageKeys.GV_GEMS_MRU],
        (local) => {
          const cache = local?.[StorageKeys.GV_GEMS_LIST_CACHE] as { items?: unknown } | undefined;
          const mru = local?.[StorageKeys.GV_GEMS_MRU] as { entries?: unknown } | undefined;
          // Recently-used first, padded with the scraped catalog — the same
          // ranking the sidebar fill uses, so the picker reads consistently.
          const merged: KnownGem[] = [];
          const seen = new Set<string>();
          for (const gem of [...toKnownGems(mru?.entries), ...toKnownGems(cache?.items)]) {
            if (seen.has(gem.id)) continue;
            seen.add(gem.id);
            merged.push(gem);
          }
          setKnownGems(merged);

          chrome.storage?.sync?.get({ [StorageKeys.GV_GEMS_PINNED]: [] }, (sync) => {
            setPinnedIds(toPinnedIds(sync?.[StorageKeys.GV_GEMS_PINNED]));
            setLoaded(true);
          });
        },
      );
    } catch {
      setLoaded(true);
    }
  }, []);

  const gemsById = new Map(knownGems.map((gem) => [gem.id, gem]));
  // Pinned ids without local metadata (synced from another device whose cache
  // we don't have) stay invisible here but are preserved on every write.
  const pinnedGems = pinnedIds
    .map((id) => gemsById.get(id))
    .filter((gem): gem is KnownGem => gem !== undefined);
  const unresolvedIds = pinnedIds.filter((id) => !gemsById.has(id));
  const availableGems = knownGems.filter((gem) => !pinnedIds.includes(gem.id));

  const persist = (orderedVisible: string[]) => {
    const next = [...orderedVisible, ...unresolvedIds];
    setPinnedIds(next);
    try {
      chrome.storage?.sync?.set({ [StorageKeys.GV_GEMS_PINNED]: next });
    } catch {}
  };

  const pin = (id: string) => persist([...pinnedGems.map((gem) => gem.id), id]);
  const unpin = (id: string) =>
    persist(pinnedGems.map((gem) => gem.id).filter((pinnedId) => pinnedId !== id));
  const move = (index: number, delta: -1 | 1) => {
    const ids = pinnedGems.map((gem) => gem.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    persist(ids);
  };

  if (!loaded) return null;

  return (
    <Card className="mt-3 p-4 transition-all hover:shadow-md">
      <CardTitle>{t('gemsPinnedTitle')}</CardTitle>
      <p className="text-muted-foreground mt-1 text-xs">{t('gemsPinnedDescription')}</p>

      {knownGems.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-xs italic">{t('gemsPinnedEmpty')}</p>
      ) : (
        <>
          {pinnedGems.length > 0 && (
            <div className="mt-3 space-y-1">
              {pinnedGems.map((gem, index) => (
                <div
                  key={gem.id}
                  className="bg-primary/5 flex items-center gap-2 rounded-lg px-2 py-1.5"
                >
                  <GemIconLetter gem={gem} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{gem.name}</span>
                  <RowButton
                    label={t('gemsPinnedMoveUp')}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    {ICON_UP}
                  </RowButton>
                  <RowButton
                    label={t('gemsPinnedMoveDown')}
                    disabled={index === pinnedGems.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    {ICON_DOWN}
                  </RowButton>
                  <RowButton label={t('gemsPinnedUnpin')} onClick={() => unpin(gem.id)}>
                    {ICON_CLOSE}
                  </RowButton>
                </div>
              ))}
            </div>
          )}

          {availableGems.length > 0 && (
            <>
              <p className="text-muted-foreground mt-3 text-[11px] font-medium tracking-wide uppercase">
                {t('gemsPinnedAvailable')}
              </p>
              <div className="mt-1 max-h-44 space-y-1 overflow-y-auto">
                {availableGems.map((gem) => (
                  <div key={gem.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                    <GemIconLetter gem={gem} />
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                      {gem.name}
                    </span>
                    <RowButton label={t('gemsPinnedPin')} onClick={() => pin(gem.id)}>
                      {ICON_PIN}
                    </RowButton>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}
