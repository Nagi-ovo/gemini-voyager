export type ScrollHintState = {
  isOverflowing: boolean;
  showHint: boolean;
};

const DEFAULT_TOLERANCE_PX = 4;

export function getScrollHintState(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  tolerancePx = DEFAULT_TOLERANCE_PX,
): ScrollHintState {
  const safeTolerance = Number.isFinite(tolerancePx)
    ? Math.max(0, tolerancePx)
    : DEFAULT_TOLERANCE_PX;
  const safeClientHeight = Number.isFinite(clientHeight) ? Math.max(0, clientHeight) : 0;
  const safeScrollHeight = Number.isFinite(scrollHeight) ? Math.max(0, scrollHeight) : 0;
  const safeScrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;

  const maxScrollTop = Math.max(0, safeScrollHeight - safeClientHeight);
  const isOverflowing = maxScrollTop > safeTolerance;
  const showHint = isOverflowing && safeScrollTop < maxScrollTop - safeTolerance;

  return { isOverflowing, showHint };
}
