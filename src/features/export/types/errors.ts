export const IMAGE_RENDER_EVENT_ERROR_CODE = 'image_render_event_error' as const;

export function isEventLikeImageRenderError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const maybeEvent = error as {
    type?: unknown;
    preventDefault?: unknown;
    stopPropagation?: unknown;
  };

  return (
    maybeEvent.type === 'error' &&
    typeof maybeEvent.preventDefault === 'function' &&
    typeof maybeEvent.stopPropagation === 'function'
  );
}
