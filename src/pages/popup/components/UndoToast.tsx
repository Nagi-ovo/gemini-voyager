import React, { type Ref } from 'react';

import type { ShownUndoOffer } from '../hooks/useUndoToast';

export interface UndoToastProps {
  readonly offer: ShownUndoOffer | null;
  readonly undoLabel: string;
  readonly onUndo: () => void;
  /** Whether the pointer rests on the toast; it stays up meanwhile. */
  readonly onHover: (hovered: boolean) => void;
  /** Whether focus is inside the toast; it stays up meanwhile. */
  readonly onFocusInside: (focused: boolean) => void;
  readonly containerRef: Ref<HTMLDivElement>;
  readonly dir?: 'rtl';
}

/**
 * The popup's undo offer, pinned to the bottom of whatever scrolls the popup
 * (the toolbar popup or the options page tab). The page toaster is not used
 * here: it sits where a host page's controls leave room and follows the host
 * page's theme, not the popup's. The status region stays mounted so a screen
 * reader hears each new offer.
 */
export function UndoToast({
  offer,
  undoLabel,
  onUndo,
  onHover,
  onFocusInside,
  containerRef,
  dir,
}: UndoToastProps) {
  return (
    <div className="pointer-events-none sticky bottom-0 z-30 h-0">
      <div ref={containerRef} role="status" dir={dir} className="absolute inset-x-5 bottom-4">
        {offer && (
          <div
            key={offer.id}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
            onFocus={() => onFocusInside(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) onFocusInside(false);
            }}
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
