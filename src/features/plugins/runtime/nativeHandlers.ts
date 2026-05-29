/**
 * Native handler registry for first-party "builtin function plugins".
 *
 * A declarative plugin ships only CSS+JSON and cannot run JS. Some first-party
 * features (e.g. formula copy) genuinely need JS but should still be managed by
 * the plugin lifecycle — visible + toggleable in the plugin list, scoped by the
 * manifest's `matches`. For such a builtin plugin the manifest carries no
 * executable code; instead the content script registers a native handler under
 * the SAME plugin id, and the declarative engine runs its `start`/`stop` in
 * lockstep with mount/unmount.
 *
 * The handler is ALWAYS first-party code bundled in the extension — never
 * plugin-authored or remotely fetched. Marketplace manifests cannot reach this:
 * only code we ship calls `registerNativeHandler`.
 */
export interface NativeHandler {
  /** Run when the plugin mounts (URL matches + enabled). Should be idempotent. */
  readonly start?: () => void;
  /** Run when the plugin unmounts (disabled, or navigated away). */
  readonly stop?: () => void;
}

const registry = new Map<string, NativeHandler>();

/** Bind a first-party start/stop pair to a builtin plugin id. */
export function registerNativeHandler(pluginId: string, handler: NativeHandler): void {
  registry.set(pluginId, handler);
}

/** Look up the native handler for a plugin id, if one was registered. */
export function getNativeHandler(pluginId: string): NativeHandler | undefined {
  return registry.get(pluginId);
}
