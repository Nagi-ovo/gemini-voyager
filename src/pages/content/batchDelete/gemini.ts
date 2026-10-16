import { GeminiBatchDeleteSelection, type GeminiBatchDeleteOptions } from './geminiSelection';

type Registration = {
  options: GeminiBatchDeleteOptions;
  selection: GeminiBatchDeleteSelection | null;
};

/** Connects the admitted affordance to the existing folder/account owner without duplicating it. */
class GeminiBatchDeleteService {
  private enabled = false;
  private readonly registrations = new Set<Registration>();
  private readonly retired = new Set<Promise<void>>();

  register(options: GeminiBatchDeleteOptions) {
    const registration: Registration = { options, selection: null };
    this.registrations.add(registration);
    if (this.enabled) registration.selection = new GeminiBatchDeleteSelection(options);
    return {
      selection: () => registration.selection?.nativeRows ?? null,
      refresh: () => registration.selection?.refresh(),
      unmount: () => registration.selection?.unmount(),
      exit: () => registration.selection?.exit(),
      reset: () => registration.selection?.reset(),
      destroy: () => {
        this.registrations.delete(registration);
        const selection = registration.selection;
        selection?.reset();
        if (selection) {
          // Native folders can retire before PluginHost releases its claim; keep that drain in the barrier.
          const pending = selection.stop();
          this.retired.add(pending);
          void pending.then(
            () => this.retired.delete(pending),
            () => this.retired.delete(pending),
          );
        }
        registration.selection = null;
      },
    };
  }

  start(): () => Promise<void> {
    this.enabled = true;
    for (const registration of this.registrations) {
      registration.selection ??= new GeminiBatchDeleteSelection(registration.options);
    }
    return async () => {
      this.enabled = false;
      const pending = [...this.registrations].map(async (registration) => {
        const selection = registration.selection;
        // Keep the drag bridge to the draining run until release; no new selection can start.
        await selection?.stop();
        if (registration.selection === selection) registration.selection = null;
      });
      await Promise.all([...pending, ...this.retired]);
    };
  }
}

export const geminiBatchDeleteService = new GeminiBatchDeleteService();

export function startGeminiBatchDelete(): () => Promise<void> {
  return geminiBatchDeleteService.start();
}
