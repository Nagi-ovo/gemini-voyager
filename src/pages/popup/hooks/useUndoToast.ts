import { useCallback, useEffect, useRef, useState } from 'react';

/** How long an undo offer stays up unless the pointer or focus rests on it. */
export const UNDO_TOAST_MS = 4000;

export interface UndoOffer {
  readonly message: string;
  /** Puts back what the change replaced, through the same write the change used. */
  readonly undo: () => void;
}

export interface ShownUndoOffer extends UndoOffer {
  /** New for every offer, so a repeated message is announced again. */
  readonly id: number;
}

/**
 * One undo offer at a time: a newer one replaces it, it closes by itself after
 * `durationMs`, and it waits while the user hovers or focuses it.
 */
export function useUndoToast(durationMs: number = UNDO_TOAST_MS) {
  const [offer, setOffer] = useState<ShownUndoOffer | null>(null);
  const offerRef = useRef<ShownUndoOffer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const stopTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const dismiss = useCallback(() => {
    stopTimer();
    offerRef.current = null;
    setOffer(null);
  }, [stopTimer]);

  const startTimer = useCallback(() => {
    stopTimer();
    timer.current = setTimeout(dismiss, durationMs);
  }, [dismiss, durationMs, stopTimer]);

  const show = useCallback(
    (next: UndoOffer) => {
      const shown = { ...next, id: ++nextId.current };
      offerRef.current = shown;
      setOffer(shown);
      startTimer();
    },
    [startTimer],
  );

  const undo = useCallback(() => {
    const current = offerRef.current;
    dismiss();
    current?.undo();
  }, [dismiss]);

  const hold = useCallback(() => stopTimer(), [stopTimer]);
  const release = useCallback(() => {
    if (offerRef.current) startTimer();
  }, [startTimer]);

  useEffect(() => stopTimer, [stopTimer]);

  return { offer, show, dismiss, undo, hold, release };
}
