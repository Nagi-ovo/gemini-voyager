/**
 * The site's changelog pages, one per locale, built from the release notes the
 * extension shows after an update (`src/pages/content/changelog/notes/`). The
 * notes stay the single source: a version appears here once `package.json`
 * reaches it, so a note written ahead of its release stays off the site.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLATFORM_LOGOS, type PlatformLogo } from '../../src/core/icons/platformLogos';
import { extractLocalizedContent } from '../../src/pages/content/changelog/noteSections';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS_ROOT = join(REPO_ROOT, 'docs');
export const NOTES_DIR = join(REPO_ROOT, 'src/pages/content/changelog/notes');
const RELEASES_URL = 'https://github.com/voyager-crew/voyager/releases';
/** Note images point at the repo's copy of files the site already serves. */
const PROMOTION_IMAGE =
  /https:\/\/(?:github\.com\/voyager-crew\/voyager\/raw|raw\.githubusercontent\.com\/voyager-crew\/voyager)\/main\/docs\/public(\/assets\/promotion\/[^\s)]+)/g;
const DOC_LINK = /\]\((\/guide\/[^\s)#]+)(#[^\s)]*)?\)/g;
const LOGO_MARKER = new RegExp(`:(${Object.keys(PLATFORM_LOGOS).join('|')}): ?`, 'g');

interface ChangelogLocale {
  /** The note's `<!-- lang:xx -->` code. */
  note: string;
  /** Path prefix of the site locale; the root locale is Simplified Chinese. */
  prefix: string;
  dateLocale: string;
  title: string;
  intro: string;
  earlier: string;
}

export const CHANGELOG_LOCALES: readonly ChangelogLocale[] = [
  {
    note: 'zh',
    prefix: '',
    dateLocale: 'zh-CN',
    title: '更新日志',
    intro: 'Voyager 每个版本的新功能和修复。',
    earlier: '更早的版本见',
  },
  {
    note: 'zh_TW',
    prefix: 'zh_TW',
    dateLocale: 'zh-TW',
    title: '更新日誌',
    intro: 'Voyager 每個版本的新功能與修正。',
    earlier: '更早的版本請見',
  },
  {
    note: 'en',
    prefix: 'en',
    dateLocale: 'en-US',
    title: 'Changelog',
    intro: 'New features and fixes in every version of Voyager.',
    earlier: 'Earlier versions are on',
  },
  {
    note: 'ja',
    prefix: 'ja',
    dateLocale: 'ja-JP',
    title: '更新履歴',
    intro: 'Voyager の各バージョンの新機能と修正。',
    earlier: 'それ以前のバージョンはこちら：',
  },
  {
    note: 'ko',
    prefix: 'ko',
    dateLocale: 'ko-KR',
    title: '변경 로그',
    intro: 'Voyager 버전별 새로운 기능과 수정 사항.',
    earlier: '이전 버전은 여기에서 볼 수 있습니다:',
  },
  {
    note: 'fr',
    prefix: 'fr',
    dateLocale: 'fr-FR',
    title: 'Journal des modifications',
    intro: 'Les nouveautés et corrections de chaque version de Voyager.',
    earlier: 'Les versions antérieures sont sur',
  },
  {
    note: 'es',
    prefix: 'es',
    dateLocale: 'es-ES',
    title: 'Registro de cambios',
    intro: 'Novedades y correcciones de cada versión de Voyager.',
    earlier: 'Las versiones anteriores están en',
  },
  {
    note: 'pt',
    prefix: 'pt',
    dateLocale: 'pt-PT',
    title: 'Registo de alterações',
    intro: 'Novidades e correções de cada versão do Voyager.',
    earlier: 'As versões anteriores estão no',
  },
  {
    note: 'ar',
    prefix: 'ar',
    dateLocale: 'ar',
    title: 'سجل التغييرات',
    intro: 'الميزات الجديدة والإصلاحات في كل إصدار من Voyager.',
    earlier: 'الإصدارات الأقدم متاحة على',
  },
  {
    note: 'ru',
    prefix: 'ru',
    dateLocale: 'ru-RU',
    title: 'Список изменений',
    intro: 'Новое и исправления в каждой версии Voyager.',
    earlier: 'Более ранние версии — на',
  },
];

export interface ReleaseNote {
  version: string;
  raw: string;
  /** `YYYY-MM-DD` of the version's tag, when the checkout has it. */
  date?: string;
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Released notes only, newest first. */
export function releasedNotes(notes: ReleaseNote[], currentVersion: string): ReleaseNote[] {
  return notes
    .filter((note) => compareVersions(note.version, currentVersion) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

function logoSvg(logo: PlatformLogo): string {
  const paths = logo.paths.map((d) => `<path d="${d}"/>`).join('');
  return `<svg class="gv-changelog-logo" viewBox="${logo.viewBox}" fill="${logo.brand ?? 'currentColor'}" aria-hidden="true" focusable="false">${paths}</svg>`;
}

/**
 * `/guide/x` links go to the reader's own locale where that page exists, as the
 * extension's viewer does; otherwise to the Chinese original.
 */
function localizeDocLinks(markdown: string, prefix: string, pageExists: (path: string) => boolean) {
  if (!prefix) return markdown;
  return markdown.replace(DOC_LINK, (full, path: string, hash = '') =>
    pageExists(`${prefix}${path}`) ? `](/${prefix}${path}${hash})` : full,
  );
}

function formatDate(date: string, dateLocale: string): string {
  return new Intl.DateTimeFormat(dateLocale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** The page's Markdown for one locale. */
export function renderChangelog(
  locale: ChangelogLocale,
  notes: ReleaseNote[],
  pageExists: (path: string) => boolean,
): string {
  const sections = notes.map((note) => {
    const body = localizeDocLinks(
      extractLocalizedContent(note.raw, locale.note)
        .replace(PROMOTION_IMAGE, '$1')
        .replace(LOGO_MARKER, (_marker, id: keyof typeof PLATFORM_LOGOS) =>
          logoSvg(PLATFORM_LOGOS[id]),
        ),
      locale.prefix,
      pageExists,
    );
    const date = note.date
      ? `<p class="gv-changelog-date"><time datetime="${note.date}">${formatDate(note.date, locale.dateLocale)}</time></p>\n\n`
      : '';
    return `## v${note.version} {#v${note.version}}\n\n${date}${body}`;
  });
  return [
    `# ${locale.title}`,
    locale.intro,
    // Notes are text, not Vue templates: `{{主题}}` in a note must print as written.
    '<div v-pre>',
    ...sections,
    '</div>',
    `---\n\n${locale.earlier} [GitHub Releases](${RELEASES_URL})`,
  ].join('\n\n');
}

function tagDates(): Map<string, string> {
  try {
    const out = execFileSync(
      'git',
      ['for-each-ref', '--format=%(refname:short)%09%(creatordate:short)', 'refs/tags/v*'],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    return new Map(
      out
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [tag, date] = line.split('\t');
          return [tag.slice(1), date] as const;
        }),
    );
  } catch {
    return new Map();
  }
}

function readNotes(): ReleaseNote[] {
  const dates = tagDates();
  const { version } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  const notes = readdirSync(NOTES_DIR)
    .filter((file) => file.endsWith('.md'))
    .map((file) => {
      const noteVersion = file.slice(0, -'.md'.length);
      return {
        version: noteVersion,
        raw: readFileSync(join(NOTES_DIR, file), 'utf8'),
        date: dates.get(noteVersion),
      };
    });
  return releasedNotes(notes, version);
}

/** Dynamic-route entries for the locales whose pages live under `prefix`. */
export function changelogRoutes(rooted: boolean) {
  const notes = readNotes();
  const pageExists = (path: string) => existsSync(join(DOCS_ROOT, `${path}.md`));
  return CHANGELOG_LOCALES.filter((locale) => (locale.prefix === '') === rooted).map((locale) => ({
    params: rooted
      ? { page: 'changelog', description: locale.intro }
      : { lang: locale.prefix, description: locale.intro },
    content: renderChangelog(locale, notes, pageExists),
  }));
}
