import { describe, expect, it } from 'vitest';

import { CHANGELOG_LOCALES, type ReleaseNote, releasedNotes, renderChangelog } from './changelog';

const locale = (note: string) => CHANGELOG_LOCALES.find((entry) => entry.note === note)!;

const note = (version: string, sections: Record<string, string>, date?: string): ReleaseNote => ({
  version,
  date,
  bodies: sections,
});

describe('site changelog', () => {
  it('leaves out a note written ahead of its release and lists the rest newest first', () => {
    const notes = ['1.9.0', '2.0.1', '1.10.0', '2.0.0'].map((v) => note(v, { en: v }));

    expect(releasedNotes(notes, '2.0.0').map((n) => n.version)).toEqual([
      '2.0.0',
      '1.10.0',
      '1.9.0',
    ]);
  });

  it("shows each version in the page's language, and in English where a note lacks it", () => {
    const page = renderChangelog(
      locale('ja'),
      [note('2.0.0', { en: 'Fixed it', ja: '直しました' }), note('1.9.0', { en: 'Older fix' })],
      () => false,
    );

    expect(page).toContain('## v2.0.0 {#v2.0.0}\n\n直しました');
    expect(page).toContain('## v1.9.0 {#v1.9.0}\n\nOlder fix');
    expect(page).not.toContain('Fixed it');
  });

  it('keeps note text out of Vue so template braces print as written', () => {
    const page = renderChangelog(locale('en'), [note('2.0.0', { en: '`{{topic}}`' })], () => false);

    expect(page.indexOf('<div v-pre>')).toBeLessThan(page.indexOf('`{{topic}}`'));
    expect(page.indexOf('`{{topic}}`')).toBeLessThan(page.indexOf('</div>'));
  });

  it('draws platform marks, serves promotion images from the site and dates each version', () => {
    const page = renderChangelog(
      locale('en'),
      [
        note(
          '2.0.0',
          {
            en: ':gemini: Gemini\n\n![Banner](https://github.com/voyager-crew/voyager/raw/main/docs/public/assets/promotion/Promo-Banner.png)',
          },
          '2026-10-14',
        ),
      ],
      () => false,
    );

    expect(page).toMatch(/<svg class="gv-site-mark" [^>]*>.*<\/svg>Gemini/);
    expect(page).toContain('![Banner](/assets/promotion/Promo-Banner.png)');
    expect(page).toContain('<time datetime="2026-10-14">October 14, 2026</time>');
  });

  it("sends guide links to the reader's locale only where that guide page exists", () => {
    const page = renderChangelog(
      locale('fr'),
      [note('2.0.0', { fr: '[A](/guide/timeline) [B](/guide/write-a-plugin#start)' })],
      (path) => path === 'fr/guide/timeline',
    );

    expect(page).toContain('[A](/fr/guide/timeline)');
    expect(page).toContain('[B](/guide/write-a-plugin#start)');
  });
});
