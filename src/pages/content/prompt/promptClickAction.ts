type PromptActivationResult = 'inserted' | 'copied';

interface PromptActivationDeps {
  copyText: (text: string) => Promise<void>;
  expandInputCollapseIfNeeded: () => void;
  insertTextIntoChatInput: (text: string) => boolean;
}

export async function activatePromptText(
  text: string,
  insertOnClickEnabled: boolean,
  deps: PromptActivationDeps,
): Promise<PromptActivationResult> {
  if (insertOnClickEnabled) {
    deps.expandInputCollapseIfNeeded();

    if (deps.insertTextIntoChatInput(text)) {
      return 'inserted';
    }
  }

  await deps.copyText(text);
  return 'copied';
}
