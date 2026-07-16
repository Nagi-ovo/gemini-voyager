export type OptionalHighlightSettingResolution = {
  enabled: boolean;
  shouldPersist: boolean;
};

/**
 * Explicit user choices always win. An unset legacy setting inherits whether
 * the user has any live saved highlights, then becomes explicit.
 */
export function resolveOptionalHighlightSetting(
  storedValue: unknown,
  hasExistingHighlights: boolean,
): OptionalHighlightSettingResolution {
  if (typeof storedValue === 'boolean') {
    return { enabled: storedValue, shouldPersist: false };
  }

  return {
    enabled: hasExistingHighlights,
    shouldPersist: true,
  };
}
