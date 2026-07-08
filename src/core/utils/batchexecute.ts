/**
 * Decoder for Google `batchexecute` RPC response envelopes.
 *
 * A batchexecute response body is an anti-JSON-hijacking prefix (`)]}'`)
 * followed by length-prefixed chunks, each containing a JSON array of rows.
 * Data rows look like `["wrb.fr", "<rpcid>", "<payload JSON string>", ...]`.
 * The decoder is length-agnostic: it scans for `[["wrb.fr"` anchors and
 * bracket-matches each chunk, so it tolerates chunk-size markers and
 * interleaved bookkeeping rows.
 *
 * Shared by usageStatus (usage metrics RPC) and timeline message timestamps
 * (conversation-load RPC).
 */

/** Index of the `]` that closes the `[` at `start`, respecting JSON strings. */
function matchBracket(s: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Decode a batchexecute envelope into its `wrb.fr` payloads (length-agnostic). */
export function decodeBatchExecute(text: string): Array<{ rpcid: string; payload: unknown }> {
  const out: Array<{ rpcid: string; payload: unknown }> = [];
  let idx = 0;
  while (idx < text.length) {
    const at = text.indexOf('[["wrb.fr"', idx);
    if (at < 0) break;
    const end = matchBracket(text, at);
    if (end < 0) break;
    try {
      const rows = JSON.parse(text.slice(at, end + 1)) as unknown[];
      for (const row of rows) {
        if (
          Array.isArray(row) &&
          row[0] === 'wrb.fr' &&
          typeof row[1] === 'string' &&
          typeof row[2] === 'string'
        ) {
          try {
            out.push({ rpcid: row[1], payload: JSON.parse(row[2]) });
          } catch {
            // not JSON — skip
          }
        }
      }
    } catch {
      // malformed chunk — skip past it
    }
    idx = end + 1;
  }
  return out;
}
