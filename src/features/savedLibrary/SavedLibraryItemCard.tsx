import { useId, useState } from 'react';

import { Star, Trash2 } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { getHighlightColorHex } from '@/core/types/highlight';
import { cn } from '@/lib/utils';
import type { TranslationKey } from '@/utils/translations';

import { type SavedLibraryItem, savedLibraryItemKey } from './model';

interface SavedLibraryItemCardProps {
  item: SavedLibraryItem;
  onOpen: (item: SavedLibraryItem) => void;
  onDelete: (item: SavedLibraryItem) => void;
  t: (key: TranslationKey) => string;
  language: string;
  expanded?: boolean;
}

export function SavedLibraryItemCard({
  item,
  onOpen,
  onDelete,
  t,
  language,
  expanded = false,
}: SavedLibraryItemCardProps) {
  const [textExpanded, setTextExpanded] = useState(false);
  const textId = useId();
  const hasFullText = item.kind === 'starred' && (item.text?.length ?? 0) > item.content.length;
  const removeLabel = item.kind === 'starred' ? t('removeFromStarred') : t('pm_delete');
  return (
    <Card
      className={cn(
        'group flex items-start gap-1 p-2 shadow-none',
        !expanded && 'border-transparent bg-transparent',
      )}
      data-library-item-id={savedLibraryItemKey(item)}
    >
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onOpen(item)}
          title={t('pm_starred_open')}
          data-library-open
          className="hover:bg-muted focus-visible:ring-ring flex w-full min-w-0 items-start gap-2.5 rounded-lg p-2 text-start focus-visible:ring-2"
        >
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center"
            aria-hidden="true"
          >
            {item.kind === 'starred' ? (
              <Star className="text-primary h-4 w-4 fill-current" />
            ) : (
              <span
                className="h-3.5 w-3.5 rounded-sm"
                style={{ backgroundColor: getHighlightColorHex(item.color ?? 'yellow') }}
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span
              id={textId}
              className={cn(
                'block text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap',
                textExpanded ? 'font-normal' : 'font-medium',
                !expanded && !textExpanded && 'line-clamp-2',
              )}
              dir="auto"
            >
              {textExpanded ? item.text : item.content}
            </span>
            {item.note && (
              <span
                className={cn(
                  'text-muted-foreground mt-1 block text-xs leading-relaxed break-words whitespace-pre-wrap',
                  !expanded && 'line-clamp-2',
                )}
                dir="auto"
              >
                {item.note}
              </span>
            )}
            <span className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="truncate" dir="auto">
                {item.conversationTitle || t('pm_starred_untitled')}
              </span>
              <span aria-hidden="true">·</span>
              <time dateTime={new Date(item.savedAt).toISOString()}>
                {new Intl.DateTimeFormat(language.replace('_', '-'), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(item.savedAt)}
              </time>
            </span>
          </span>
        </button>
        {hasFullText && (
          <div className="ms-7.5 px-2 pb-2">
            <button
              type="button"
              aria-expanded={textExpanded}
              aria-controls={textId}
              onClick={() => setTextExpanded(!textExpanded)}
              className="text-primary hover:bg-muted focus-visible:ring-ring -ms-2 min-h-8 w-fit rounded-md px-2 text-start text-xs font-medium focus-visible:ring-2"
            >
              {t(textExpanded ? 'savedLibraryCollapseText' : 'savedLibraryExpandText')}
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDelete(item)}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg focus-visible:ring-2"
        title={removeLabel}
        aria-label={removeLabel}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </Card>
  );
}
