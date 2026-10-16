import React from 'react';

import type { ShownUndoOffer } from '../hooks/useUndoToast';

export interface UndoToastProps {
  readonly offer: ShownUndoOffer | null;
  readonly undoLabel: string;
  readonly onUndo: () => void;
  /** The pointer or focus rests on the toast: keep it up. */
  readonly onHold: () => void;
  readonly onRelease: () => void;
  readonly dir?: 'rtl';
}

/**
 * The popup's undo offer, pinned to the bottom of whatever scrolls the popup
 * (the toolbar popup or the options page tab). The page toaster is not used
 * here: it sits where a host page's controls leave room and follows the host
 * page's theme, not the popup's. The status region stays mounted so a screen
 * reader hears each new offer.
 */
export function UndoToast({ offer, undoLabel, onUndo, onHold, onRelease, dir }: UndoToastProps) {
  return (
    <div className="pointer-events-none sticky bottom-0 z-30 h-0">
      <div role="status" dir={dir} className="absolute inset-x-5 bottom-4">
        {offer && (
          <div
            key={offer.id}
            onMouseEnter={onHold}
            onMouseLeave={onRelease}
            onFocus={onHold}
            onBlur={onRelease}
            className="bg-foreground text-background pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 text-[13px] leading-snug shadow-lg"
          >
            <span className="min-w-0 flex-1">{offer.message}</span>
            <button
              type="button"
              onClick={onUndo}
              className="focus-visible:ring-background/70 -mx-1 shrink-0 rounded-md px-1 py-0.5 font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              {undoLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
