/**
 * Local health signal for the Gemini DOM anchors Voyager's native features depend on.
 *
 * When Gemini changes its page, a feature can silently stop finding what it needs. Each owner
 * reports whether its anchor was found; the content-script reporter (`pages/content/nativeHealth`)
 * turns a sustained miss into an entry, and the popup reads the entries of the active tab.
 *
 * Nothing leaves the browser and nothing is persisted: entries live in the content script for the
 * lifetime of the page, so they can never describe a document that is gone. They hold only closed
 * identifiers, a route kind, timestamps and the extension version: no page text, no URL, no
 * conversation id.
 */
import { extractConversationIdFromUrl } from '@/core/utils/conversationIdentity';

/** Popup → content script request for the active page's entries. */
export const NATIVE_HEALTH_STATUS_MESSAGE = 'gv.nativeHealth.status';

/** How long a miss must persist on the page before it becomes an entry. */
export const NATIVE_HEALTH_GRACE_MS = 8_000;

/** The anchor each feature probes. Keys are stable identifiers: they appear in issue reports. */
export const NATIVE_HEALTH_ANCHORS = {
  timeline: 'turn.user',
  'chat-width': 'chatWidth.userTurn',
  folders: 'folder.sidebarAnchor',
  export: 'turn.user',
  composer: 'chatInput.composer',
} as const satisfies Record<string, string>;

export type NativeHealthFeature = keyof typeof NATIVE_HEALTH_ANCHORS;

/**
 * A feature without an entry is healthy. `degraded` means the feature still works through a
 * fallback (folders opening as a floating panel); `broken` means it cannot do its job.
 */
export type NativeHealthStatus = 'degraded' | 'broken';

/** Route kind only. The path itself would carry the conversation id. */
export type NativeHealthRoute = 'conversation' | 'new-chat' | 'other';

export interface NativeHealthEntry {
  readonly feature: NativeHealthFeature;
  readonly anchor: string;
  readonly status: NativeHealthStatus;
  readonly route: NativeHealthRoute;
  /** Epoch milliseconds of the first verdict and of the latest one that confirmed it. */
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
  readonly extensionVersion: string;
}

export interface NativeHealthStatusResponse {
  readonly ok: true;
  readonly entries: readonly NativeHealthEntry[];
}

const FEATURES = Object.keys(NATIVE_HEALTH_ANCHORS) as NativeHealthFeature[];

export function isNativeHealthFeature(value: unknown): value is NativeHealthFeature {
  return typeof value === 'string' && (FEATURES as string[]).includes(value);
}

/** Classify a Gemini pathname, including `/u/<index>/` account routes. */
export function classifyGeminiRoute(pathname: string): NativeHealthRoute {
  if (extractConversationIdFromUrl(pathname)) return 'conversation';
  const path = pathname.replace(/^\/u\/\d+(?=\/)/, '').replace(/\/+$/, '');
  return path === '/app' || /^\/gem\/[^/]+$/.test(path) ? 'new-chat' : 'other';
}

function isTimestamp(value: unknown): value is number {
  // Bounded so a conversion with `new Date(value).toISOString()` cannot throw.
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 8.64e15;
}

/**
 * Narrow entries received from another context. Anything outside the closed vocabulary is
 * dropped, so a malformed or unexpected answer can never put free text into a report.
 */
export function parseNativeHealthEntries(value: unknown): NativeHealthEntry[] {
  if (!Array.isArray(value)) return [];
  const entries = new Map<NativeHealthFeature, NativeHealthEntry>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const feature = raw.feature;
    if (!isNativeHealthFeature(feature) || raw.anchor !== NATIVE_HEALTH_ANCHORS[feature]) continue;
    if (raw.status !== 'degraded' && raw.status !== 'broken') continue;
    if (raw.route !== 'conversation' && raw.route !== 'new-chat' && raw.route !== 'other') continue;
    if (!isTimestamp(raw.firstSeenAt) || !isTimestamp(raw.lastSeenAt)) continue;
    const version =
      typeof raw.extensionVersion === 'string' &&
      /^[0-9][0-9A-Za-z.+-]{0,31}$/.test(raw.extensionVersion)
        ? raw.extensionVersion
        : 'unknown';
    entries.set(feature, {
      feature,
      anchor: NATIVE_HEALTH_ANCHORS[feature],
      status: raw.status,
      route: raw.route,
      firstSeenAt: raw.firstSeenAt,
      lastSeenAt: raw.lastSeenAt,
      extensionVersion: version,
    });
  }
  return FEATURES.flatMap((feature) => {
    const entry = entries.get(feature);
    return entry ? [entry] : [];
  });
}

/** Identifies a dismissal: the same failure on a newer version is worth showing again. */
export function nativeHealthDismissKey(entry: NativeHealthEntry): string {
  return `${entry.feature}:${entry.anchor}@${entry.extensionVersion}`;
}

const ISSUE_URL = 'https://github.com/voyager-crew/voyager/issues/new';

export interface NativeHealthIssueContext {
  readonly extensionVersion: string;
  /** Browser name and version, e.g. "chrome 140.0.7339.81". */
  readonly browser: string;
}

/**
 * Prefilled bug report for the given entries. Only closed identifiers go into the link; the
 * title alone identifies the failure, and the form fields fill in where the template exposes
 * their ids.
 */
export function buildNativeHealthIssueUrl(
  entries: readonly NativeHealthEntry[],
  context: NativeHealthIssueContext,
): string {
  const safeEntries = parseNativeHealthEntries(entries);
  const version = /^[0-9][0-9A-Za-z.+-]{0,31}$/.test(context.extensionVersion)
    ? context.extensionVersion
    : 'unknown';
  const browser = /^[a-z]+(?: [0-9][0-9.]{0,31})?$/i.test(context.browser)
    ? context.browser
    : 'unknown';
  const probes = safeEntries.map((entry) => `${entry.feature}/${entry.anchor}`).join(', ');
  const lines = [
    "Voyager's local health check could not find Gemini page elements it depends on.",
    '',
    ...safeEntries.map(
      (entry) =>
        `- \`${entry.feature}\` → \`${entry.anchor}\`: ${entry.status} (${entry.route} page)`,
    ),
    '',
    `Extension: ${version}`,
    `Browser: ${browser}`,
  ];
  const params = new URLSearchParams({
    template: 'bug_report.yml',
    title: `[Bug] Gemini page change: ${probes} (v${version}, ${browser})`,
    'extension-version': version,
    'browser-version': browser,
    description: lines.join('\n'),
  });
  return `${ISSUE_URL}?${params.toString()}`;
}
