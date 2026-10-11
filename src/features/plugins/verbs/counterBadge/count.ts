/** The badge's metrics: plain counts over text, with no tokenizer. */
export const COUNTER_METRICS = ['chars', 'words', 'cjkChars', 'lines'] as const;

export type CounterMetric = (typeof COUNTER_METRICS)[number];

const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const LINE_BREAK = /\r\n|[\n\r\u2028\u2029]/;
const LINE_BREAK_CHAR = /[\n\r\u2028\u2029]/g;
// A run of punctuation or symbols alone (an em dash, a CJK full stop) is not a word.
const WORD_CONTENT = /[\p{L}\p{N}]/u;

export function isCounterMetric(value: unknown): value is CounterMetric {
  return typeof value === 'string' && (COUNTER_METRICS as readonly string[]).includes(value);
}

export function countText(text: string, metric: CounterMetric): number {
  switch (metric) {
    case 'chars':
      // Code points, not UTF-16 units: an astral emoji counts once.
      return Array.from(text.replace(LINE_BREAK_CHAR, '')).length;
    case 'cjkChars':
      return text.match(CJK_CHAR)?.length ?? 0;
    case 'words': {
      const cjk = text.match(CJK_CHAR)?.length ?? 0;
      const other = text
        .replace(CJK_CHAR, ' ')
        .split(/\s+/u)
        .filter((token) => WORD_CONTENT.test(token)).length;
      return cjk + other;
    }
    case 'lines':
      // A trailing break opens a visible empty line, so it counts.
      return text.length === 0 ? 0 : text.split(LINE_BREAK).length;
  }
}
