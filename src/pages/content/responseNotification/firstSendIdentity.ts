import { normalizePromptIdentity } from './pageSnapshot';

interface Turn {
  element: HTMLElement;
  text: string;
}
interface FirstSendStart {
  requestId: number;
  sourcePrompt: string;
  protocolPrompt?: string;
  previousPrompts: HTMLElement[];
  previousResponses: HTMLElement[];
}

/** One owner for first-send evidence; transport hints can veto, never authorize. */
export class FirstSendIdentity {
  private state:
    | (FirstSendStart & {
        prompt: string;
        conversationId: string | null;
        confirmed: boolean;
        completed: boolean;
      })
    | null = null;

  start(input: FirstSendStart): void {
    this.state = {
      ...input,
      prompt: input.sourcePrompt,
      protocolPrompt: normalizePromptIdentity(input.protocolPrompt ?? ''),
      conversationId: null,
      confirmed: false,
      completed: false,
    };
  }

  clear(): void {
    this.state = null;
  }

  get awaiting(): boolean {
    return !!this.state && !this.state.confirmed;
  }

  get prompt(): string | undefined {
    return this.state?.prompt;
  }

  isOldResponse(response: HTMLElement): boolean {
    return this.state?.previousResponses.includes(response) ?? false;
  }

  complete(requestId: number, conversationId?: string): void {
    if (this.state?.requestId !== requestId) return;
    this.state.completed = true;
    this.state.conversationId = conversationId || null;
  }

  inspect(
    conversationId: string | null,
    turn: Turn | null,
    subsequentEvent: boolean,
  ): 'pending' | 'confirmed' | 'switched' | 'expired' {
    const state = this.state;
    if (!state) return 'confirmed';
    const text = turn?.text ?? '';
    const fresh = !!turn && !state.previousPrompts.includes(turn.element);
    if (
      (state.conversationId && conversationId && state.conversationId !== conversationId) ||
      (state.protocolPrompt && text && state.protocolPrompt !== text) ||
      (state.prompt && text && state.prompt !== text) ||
      (state.confirmed && !text)
    )
      return 'switched';
    // Capture source-page text, or the first fresh addressed turn when source capture was missed.
    if (fresh && text && !state.prompt) state.prompt = text;
    if (conversationId && fresh && text && text === state.prompt) state.confirmed = true;
    if (state.confirmed) return 'confirmed';
    // Completion itself must leave time for the final DOM/route event; generation has no deadline.
    if (state.completed && subsequentEvent) return 'expired';
    return 'pending';
  }
}
