import { TimelineEngine } from '@/features/timeline/TimelineEngine';

import { GeminiTimelineAdapter, type GeminiTimelineOptions } from './GeminiTimelineAdapter';

/** Native Gemini entry point; all timeline composition lives in the shared engine. */
export class TimelineManager extends TimelineEngine {
  constructor(options: GeminiTimelineOptions = {}) {
    super(new GeminiTimelineAdapter(options));
  }
}
