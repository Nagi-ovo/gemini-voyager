export interface ResponseCompletionSnapshot {
  conversationKey: string;
  hasCompletedResponse: boolean;
  isGenerating: boolean;
  responseFingerprint: string | null;
  now: number;
}

export type ResponseCompletionDecision =
  | { type: 'none' }
  | {
      type: 'notify';
      conversationKey: string;
      responseFingerprint: string;
    };

const DEFAULT_STABLE_WINDOW_MS = 1500;

export class ResponseCompletionDetector {
  private sawGeneration = false;
  private candidateFingerprint: string | null = null;
  private candidateSince = 0;
  private readonly notifiedKeys = new Set<string>();

  constructor(private readonly stableWindowMs: number = DEFAULT_STABLE_WINDOW_MS) {}

  reset(): void {
    this.sawGeneration = false;
    this.candidateFingerprint = null;
    this.candidateSince = 0;
  }

  notifyImmediately(snapshot: ResponseCompletionSnapshot): ResponseCompletionDecision {
    if (
      !this.sawGeneration ||
      snapshot.isGenerating ||
      !snapshot.hasCompletedResponse ||
      !snapshot.responseFingerprint
    ) {
      return { type: 'none' };
    }

    return this.notifyOnce(snapshot);
  }

  update(snapshot: ResponseCompletionSnapshot): ResponseCompletionDecision {
    if (snapshot.isGenerating) {
      this.sawGeneration = true;
      this.candidateFingerprint = null;
      this.candidateSince = 0;
      return { type: 'none' };
    }

    if (!this.sawGeneration) {
      return { type: 'none' };
    }

    if (!snapshot.hasCompletedResponse || !snapshot.responseFingerprint) {
      this.candidateFingerprint = null;
      this.candidateSince = 0;
      return { type: 'none' };
    }

    if (snapshot.responseFingerprint !== this.candidateFingerprint) {
      this.candidateFingerprint = snapshot.responseFingerprint;
      this.candidateSince = snapshot.now;
      return { type: 'none' };
    }

    if (snapshot.now - this.candidateSince < this.stableWindowMs) {
      return { type: 'none' };
    }

    return this.notifyOnce(snapshot);
  }

  private notifyOnce(snapshot: ResponseCompletionSnapshot): ResponseCompletionDecision {
    const responseFingerprint = snapshot.responseFingerprint;
    if (!responseFingerprint) return { type: 'none' };

    const notificationKey = `${snapshot.conversationKey}|${responseFingerprint}`;
    if (this.notifiedKeys.has(notificationKey)) {
      return { type: 'none' };
    }

    this.notifiedKeys.add(notificationKey);
    this.reset();
    return {
      type: 'notify',
      conversationKey: snapshot.conversationKey,
      responseFingerprint,
    };
  }
}
