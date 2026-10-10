<script setup lang="ts">
import { useData, withBase } from 'vitepress';
import { computed, ref } from 'vue';

import PlatformMarks from './PlatformMarks.vue';
import { data as catalog } from './pluginCatalog.data';
import {
  CATEGORY_FALLBACKS,
  CONTRIBUTE,
  NATIVE_PLUGINS,
  type PlatformMark,
  describeForPlatforms,
  displayName,
  groupPluginsByFeature,
  localeKey,
  localePrefix,
  platformsFromMatches,
} from './pluginStore';

const { lang } = useData();

interface I18nData {
  title: string;
  subtitle: string;
  requires: string;
  official: string;
  source: string;
  hint: string;
  install: string;
  empty: string;
  disclaimer: string;
  howto?: string;
  howtoAlt?: string;
  categories: Record<string, string>;
}

const i18n: Record<string, I18nData> = {
  'zh-CN': {
    title: '插件市场',
    subtitle:
      '由 Voyager 官方维护的声明式插件，把顺手体验带到更多 AI 网站。全部免费，随扩展自动更新。',
    requires: '需要 Voyager 1.4.8 及以上版本',
    official: 'Voyager 官方',
    source: '查看源码',
    hint: '安装 Voyager 后，在 Claude、ChatGPT 或 DeepSeek 页面点开 Voyager 弹窗，开启插件并允许访问该网站即可使用，更新自动送达。',
    install: '如何安装 Voyager',
    empty: '暂无插件，敬请期待。',
    disclaimer:
      'Claude、ChatGPT、DeepSeek 等名称与标志为其各自所有者的商标。本插件市场由 Voyager 维护，与 Anthropic、OpenAI、DeepSeek 无关联，亦未获其背书。',
    howto: '🔎 怎么打开弹窗？',
    howtoAlt: '打开 Voyager 弹窗的两步：① 点击浏览器扩展（拼图）图标 ② 在列表里选择 Voyager。',
    categories: {
      readability: '阅读体验',
      'render-fix': '渲染修复',
      theme: '主题',
      layout: '布局',
      other: '其他',
    },
  },
  'zh-TW': {
    title: '外掛市集',
    subtitle:
      '由 Voyager 官方維護的宣告式外掛，把順手體驗帶到更多 AI 網站。全部免費，隨擴充功能自動更新。',
    requires: '需要 Voyager 1.4.8 或更新版本',
    official: 'Voyager 官方',
    source: '檢視原始碼',
    hint: '安裝 Voyager 後，在 Claude、ChatGPT 或 DeepSeek 頁面點開 Voyager 彈窗，開啟外掛並允許存取該網站即可使用，更新自動送達。',
    install: '如何安裝 Voyager',
    empty: '暫無外掛，敬請期待。',
    disclaimer:
      'Claude、ChatGPT、DeepSeek 等名稱與標誌為其各自所有者的商標。本外掛市集由 Voyager 維護，與 Anthropic、OpenAI、DeepSeek 無關聯，亦未獲其背書。',
    howto: '🔎 怎麼打開彈窗？',
    howtoAlt: '打開 Voyager 彈窗的兩步：① 點擊瀏覽器擴充功能（拼圖）圖示 ② 在清單中選擇 Voyager。',
    categories: {
      readability: '閱讀體驗',
      'render-fix': '渲染修復',
      theme: '主題',
      layout: '版面',
      other: '其他',
    },
  },
  'en-US': {
    title: 'Plugin Marketplace',
    subtitle:
      "Declarative plugins maintained by the Voyager team that bring Voyager's polish to more AI sites. All free, and they auto-update with the extension.",
    requires: 'Requires Voyager 1.4.8 or later',
    official: 'by Voyager',
    source: 'View source',
    hint: 'After installing Voyager, open its popup on a Claude, ChatGPT or DeepSeek page, enable the plugin and allow access to the site — that’s it. Updates arrive automatically.',
    install: 'How to install Voyager',
    empty: 'No plugins yet — stay tuned.',
    disclaimer:
      'Claude, ChatGPT, DeepSeek and other names and logos are trademarks of their respective owners. This marketplace is maintained by Voyager and is not affiliated with, or endorsed by, Anthropic, OpenAI or DeepSeek.',
    howto: '🔎 How to open the popup?',
    howtoAlt:
      'Two steps to open the Voyager popup: ① click the browser Extensions (puzzle) icon ② pick Voyager from the list.',
    categories: {
      readability: 'Readability',
      'render-fix': 'Render fix',
      theme: 'Theme',
      layout: 'Layout',
      other: 'Other',
    },
  },
  'ja-JP': {
    title: 'プラグインマーケット',
    subtitle:
      'Voyager 公式チームが維持する宣言型プラグイン。Voyager の使い心地をより多くの AI サイトへ。すべて無料で、拡張機能とともに自動更新されます。',
    requires: 'Voyager 1.4.8 以降が必要です',
    official: 'Voyager 公式',
    source: 'ソースを見る',
    hint: 'Voyager をインストールしたら、Claude、ChatGPT、DeepSeek のページで Voyager のポップアップを開き、プラグインを有効化してサイトへのアクセスを許可するだけ。更新は自動で届きます。',
    install: 'Voyager のインストール方法',
    empty: 'プラグインはまだありません。お楽しみに。',
    disclaimer:
      'Claude、ChatGPT、DeepSeek などの名称およびロゴは各所有者の商標です。本マーケットは Voyager が運営しており、Anthropic・OpenAI・DeepSeek とは関係なく、承認も受けていません。',
    howto: '🔎 ポップアップの開き方は？',
    howtoAlt:
      'Voyager のポップアップを開く 2 ステップ：① ブラウザの拡張機能（パズル）アイコンをクリック ② 一覧から Voyager を選択。',
    categories: {
      readability: '読みやすさ',
      'render-fix': '表示修正',
      theme: 'テーマ',
      layout: 'レイアウト',
      other: 'その他',
    },
  },
  'ko-KR': {
    title: '플러그인 마켓플레이스',
    subtitle:
      'Voyager 팀이 직접 관리하는 선언형 플러그인. Voyager의 편안한 경험을 더 많은 AI 사이트로. 모두 무료이며 확장 프로그램과 함께 자동 업데이트됩니다.',
    requires: 'Voyager 1.4.8 이상이 필요합니다',
    official: 'Voyager 공식',
    source: '소스 보기',
    hint: 'Voyager를 설치한 뒤 Claude, ChatGPT 또는 DeepSeek 페이지에서 Voyager 팝업을 열고 플러그인을 켠 다음 사이트 접근을 허용하면 됩니다. 업데이트는 자동으로 제공됩니다.',
    install: 'Voyager 설치 방법',
    empty: '아직 플러그인이 없습니다. 기대해 주세요.',
    disclaimer:
      'Claude, ChatGPT, DeepSeek 등의 이름과 로고는 각 소유자의 상표입니다. 본 마켓플레이스는 Voyager가 운영하며 Anthropic, OpenAI 또는 DeepSeek와 제휴하거나 보증받지 않았습니다.',
    howto: '🔎 팝업을 여는 방법은?',
    howtoAlt:
      'Voyager 팝업을 여는 두 단계: ① 브라우저 확장 프로그램(퍼즐) 아이콘 클릭 ② 목록에서 Voyager 선택.',
    categories: {
      readability: '가독성',
      'render-fix': '렌더링 수정',
      theme: '테마',
      layout: '레이아웃',
      other: '기타',
    },
  },
  'fr-FR': {
    title: 'Marketplace des plugins',
    subtitle:
      "Des plugins déclaratifs maintenus par l'équipe Voyager qui apportent la finesse de Voyager à davantage de sites d'IA. Tous gratuits et mis à jour automatiquement avec l'extension.",
    requires: 'Nécessite Voyager 1.4.8 ou version ultérieure',
    official: 'par Voyager',
    source: 'Voir le code',
    hint: 'Après avoir installé Voyager, ouvrez sa fenêtre sur une page Claude, ChatGPT ou DeepSeek, activez le plugin et autorisez l’accès au site — c’est tout. Les mises à jour arrivent automatiquement.',
    install: 'Comment installer Voyager',
    empty: 'Aucun plugin pour le moment — restez à l’écoute.',
    disclaimer:
      'Claude, ChatGPT, DeepSeek et les autres noms et logos sont des marques de leurs propriétaires respectifs. Cette marketplace est maintenue par Voyager et n’est ni affiliée à Anthropic, OpenAI ou DeepSeek, ni approuvée par eux.',
    howto: '🔎 Comment ouvrir la fenêtre ?',
    howtoAlt:
      'Deux étapes pour ouvrir la fenêtre Voyager : ① cliquez sur l’icône Extensions (puzzle) du navigateur ② choisissez Voyager dans la liste.',
    categories: {
      readability: 'Lisibilité',
      'render-fix': 'Correctif de rendu',
      theme: 'Thème',
      layout: 'Mise en page',
      other: 'Autre',
    },
  },
  'es-ES': {
    title: 'Mercado de plugins',
    subtitle:
      'Plugins declarativos mantenidos por el equipo de Voyager que llevan la comodidad de Voyager a más sitios de IA. Todos gratis y se actualizan automáticamente con la extensión.',
    requires: 'Requiere Voyager 1.4.8 o posterior',
    official: 'de Voyager',
    source: 'Ver código',
    hint: 'Tras instalar Voyager, abre su ventana en una página de Claude, ChatGPT o DeepSeek, activa el plugin y permite el acceso al sitio. Las actualizaciones llegan automáticamente.',
    install: 'Cómo instalar Voyager',
    empty: 'Aún no hay plugins, muy pronto.',
    disclaimer:
      'Claude, ChatGPT, DeepSeek y otros nombres y logotipos son marcas de sus respectivos propietarios. Este mercado lo mantiene Voyager y no está afiliado ni respaldado por Anthropic, OpenAI o DeepSeek.',
    howto: '🔎 ¿Cómo abrir la ventana?',
    howtoAlt:
      'Dos pasos para abrir la ventana de Voyager: ① haz clic en el icono de Extensiones (pieza de puzle) del navegador ② elige Voyager en la lista.',
    categories: {
      readability: 'Legibilidad',
      'render-fix': 'Corrección de renderizado',
      theme: 'Tema',
      layout: 'Diseño',
      other: 'Otro',
    },
  },
  'pt-PT': {
    title: 'Mercado de plugins',
    subtitle:
      'Plugins declarativos mantidos pela equipa do Voyager que levam a fluidez do Voyager a mais sites de IA. Todos gratuitos e atualizados automaticamente com a extensão.',
    requires: 'Requer o Voyager 1.4.8 ou posterior',
    official: 'da Voyager',
    source: 'Ver código',
    hint: 'Depois de instalar o Voyager, abra a sua janela numa página do Claude, ChatGPT ou DeepSeek, ative o plugin e permita o acesso ao site. As atualizações chegam automaticamente.',
    install: 'Como instalar o Voyager',
    empty: 'Ainda não há plugins — fique atento.',
    disclaimer:
      'Claude, ChatGPT, DeepSeek e outros nomes e logótipos são marcas dos respetivos proprietários. Este mercado é mantido pela Voyager e não tem qualquer afiliação ou aprovação da Anthropic, da OpenAI ou da DeepSeek.',
    howto: '🔎 Como abrir a janela?',
    howtoAlt:
      'Dois passos para abrir a janela do Voyager: ① clique no ícone de Extensões (peça de puzzle) do navegador ② escolha o Voyager na lista.',
    categories: {
      readability: 'Legibilidade',
      'render-fix': 'Correção de renderização',
      theme: 'Tema',
      layout: 'Disposição',
      other: 'Outro',
    },
  },
  'ar-SA': {
    title: 'سوق الإضافات',
    subtitle:
      'إضافات تعريفية يحافظ عليها فريق Voyager، تنقل سلاسة Voyager إلى مزيد من مواقع الذكاء الاصطناعي. جميعها مجانية وتُحدَّث تلقائيًا مع الامتداد.',
    requires: 'يتطلب الإصدار 1.4.8 من Voyager أو أحدث',
    official: 'من Voyager',
    source: 'عرض الكود',
    hint: 'بعد تثبيت Voyager، افتح نافذته على صفحة Claude أو ChatGPT أو DeepSeek، ثم فعّل الإضافة واسمح بالوصول إلى الموقع. تصل التحديثات تلقائيًا.',
    install: 'كيفية تثبيت Voyager',
    empty: 'لا توجد إضافات بعد — ترقّبوا المزيد.',
    disclaimer:
      'أسماء وشعارات Claude وChatGPT وDeepSeek وغيرها علامات تجارية لأصحابها. يحافظ Voyager على هذا السوق، وهو غير مرتبط بـ Anthropic أو OpenAI أو DeepSeek ولا يحظى بموافقتها.',
    howto: '🔎 كيف تفتح النافذة المنبثقة؟',
    howtoAlt:
      'خطوتان لفتح نافذة Voyager: ① انقر أيقونة الإضافات (قطعة الأحجية) في المتصفح ② اختر Voyager من القائمة.',
    categories: {
      readability: 'سهولة القراءة',
      'render-fix': 'إصلاح العرض',
      theme: 'السمة',
      layout: 'التخطيط',
      other: 'أخرى',
    },
  },
  'ru-RU': {
    title: 'Маркетплейс плагинов',
    subtitle:
      'Декларативные плагины, поддерживаемые командой Voyager, приносят удобство Voyager на другие сайты ИИ. Все бесплатны и обновляются автоматически вместе с расширением.',
    requires: 'Требуется Voyager 1.4.8 или новее',
    official: 'от Voyager',
    source: 'Исходный код',
    hint: 'После установки Voyager откройте его всплывающее окно на странице Claude, ChatGPT или DeepSeek, включите плагин и разрешите доступ к сайту. Обновления приходят автоматически.',
    install: 'Как установить Voyager',
    empty: 'Плагинов пока нет — следите за обновлениями.',
    disclaimer:
      'Claude, ChatGPT, DeepSeek и другие названия и логотипы являются товарными знаками их владельцев. Этот маркетплейс поддерживается Voyager и не связан с Anthropic, OpenAI или DeepSeek и не одобрен ими.',
    howto: '🔎 Как открыть всплывающее окно?',
    howtoAlt:
      'Два шага, чтобы открыть окно Voyager: ① нажмите значок расширений (пазл) в браузере ② выберите Voyager из списка.',
    categories: {
      readability: 'Читаемость',
      'render-fix': 'Исправление отображения',
      theme: 'Тема',
      layout: 'Макет',
      other: 'Другое',
    },
  },
};

const t = computed(() => i18n[lang.value as string] || i18n['en-US']);
const installLink = computed(() =>
  withBase(`${localePrefix(lang.value as string)}/guide/installation`),
);
const contributeLink = computed(() =>
  withBase(`${localePrefix(lang.value as string)}/guide/plugin-contribution`),
);
const contribute = computed(() => CONTRIBUTE[localeKey(lang.value as string)] ?? CONTRIBUTE.en);

interface PluginCard {
  id: string;
  name: string;
  description: string;
  category: string;
  homepage?: string;
  official: boolean;
  platforms: ReturnType<typeof platformsFromMatches>;
  /** Single fused colour for borders/glow: one platform's colour, or a blend. */
  accent: string;
  /** Brand tint for a single-platform tile; multi-platform tiles stay neutral. */
  tint?: string;
  /** Up to three platform marks for the icon tile. */
  marks: (PlatformMark & { color: string })[];
}

const cards = computed<PluginCard[]>(() => {
  const loc = localeKey(lang.value as string);
  // Native first-party plugins lead; catalog plugins (read at build time) follow.
  // Dedupe by id so a future overlap never renders twice.
  const seen = new Set<string>();
  const merged = [...NATIVE_PLUGINS, ...catalog].filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  // One card per feature: per-site variants of the same feature (e.g. the
  // Claude / ChatGPT / DeepSeek reading-width plugins) collapse into a single
  // card that carries the union of their platforms.
  return groupPluginsByFeature(merged).map((group) => {
    const primary = group[0];
    const localized = primary.i18n?.[loc];
    const platforms: PluginCard['platforms'] = [];
    const platformSeen = new Set<string>();
    for (const p of group) {
      for (const platform of platformsFromMatches(p.matches)) {
        if (platformSeen.has(platform.key)) continue;
        platformSeen.add(platform.key);
        platforms.push(platform);
      }
    }
    const colors = platforms.map((p) => p.color);
    const c1 = primary.theme?.brand || colors[0] || 'var(--vp-c-brand-1)';
    return {
      id: primary.id,
      name: displayName(localized?.name ?? primary.name),
      description: describeForPlatforms(
        localized?.description ?? primary.description,
        platformsFromMatches(primary.matches).map((p) => p.label),
        platforms.map((p) => p.label),
        lang.value as string,
      ),
      category: primary.category,
      homepage: primary.homepage,
      official: group.some((p) => p.official),
      platforms,
      accent: colors.length >= 2 ? `color-mix(in srgb, ${colors[0]}, ${colors[1]})` : c1,
      tint: platforms.length <= 1 ? c1 : undefined,
      marks: platforms.map((p) => ({ ...p.mark, color: p.color })),
    };
  });
});

// Every listed plugin is official today, so the badge only earns its place once
// community plugins sit beside them.
const showOfficialBadge = computed(() => cards.value.some((c) => !c.official));

// Category filter — "all" plus every category present in the cards, in
// first-seen order. The pill row hides itself when there is only one category.
const activeCat = ref('all');
const categories = computed<string[]>(() => {
  const found = ['all'];
  for (const c of cards.value) if (!found.includes(c.category)) found.push(c.category);
  return found;
});
const visibleCards = computed<PluginCard[]>(() =>
  activeCat.value === 'all'
    ? cards.value
    : cards.value.filter((c) => c.category === activeCat.value),
);
// Top two cards drive the hero preview stack.
const previewCards = computed<PluginCard[]>(() => cards.value.slice(0, 2));

function countFor(category: string): number {
  return category === 'all'
    ? cards.value.length
    : cards.value.filter((c) => c.category === category).length;
}

function categoryLabel(category: string): string {
  return (
    t.value.categories[category] ||
    CATEGORY_FALLBACKS[localeKey(lang.value as string)]?.[category] ||
    t.value.categories.other
  );
}
</script>

<template>
  <div class="gv-store">
    <!-- Split hero: message on the lead side, a live preview on the other -->
    <section class="gv-hero">
      <div class="gv-hero__copy">
        <h1 class="gv-hero__title">{{ t.title }}</h1>
        <p class="gv-hero__sub">{{ t.subtitle }}</p>
        <div class="gv-hero__actions">
          <a :href="installLink" class="gv-cta">
            {{ t.install }}
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
          <span class="gv-req">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
              <path
                d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linejoin="round"
              />
            </svg>
            {{ t.requires }}
          </span>
        </div>
        <p class="gv-hero__hint">
          {{ t.hint }}
          <span v-if="t.howto" class="gv-howto" tabindex="0">
            {{ t.howto }}
            <span class="gv-howto__pop" role="tooltip">
              <img
                :src="withBase('/assets/plugin-popup-guide.png')"
                :alt="t.howtoAlt"
                loading="lazy"
              />
            </span>
          </span>
        </p>
      </div>

      <div class="gv-showcase" aria-hidden="true">
        <span class="gv-showcase__glow" />
        <div class="gv-showcase__stack">
          <article
            v-for="(card, i) in previewCards"
            :key="card.id"
            class="gv-mini"
            :style="{ '--gv-accent': card.accent, '--gv-tint': card.tint, '--i': i }"
          >
            <span class="gv-mini__icon" :class="{ 'is-multi': !card.tint }">
              <PlatformMarks :marks="card.marks" />
            </span>
            <span class="gv-mini__text">
              <span class="gv-mini__name">{{ card.name }}</span>
              <span class="gv-mini__desc">{{ card.description }}</span>
            </span>
            <span class="gv-mini__switch"><span /></span>
          </article>
        </div>
      </div>
    </section>

    <!-- Category filter -->
    <nav v-if="categories.length > 1" class="gv-filter" :aria-label="t.title">
      <button
        v-for="cat in categories"
        :key="cat"
        type="button"
        class="gv-filter__pill"
        :class="{ 'is-active': activeCat === cat }"
        :aria-pressed="activeCat === cat"
        @click="activeCat = cat"
      >
        {{ categoryLabel(cat) }}
        <span class="gv-filter__n">{{ countFor(cat) }}</span>
      </button>
    </nav>

    <!-- Cards -->
    <div class="gv-grid">
      <article
        v-for="card in visibleCards"
        :key="card.id"
        class="gv-card"
        :style="{ '--gv-accent': card.accent, '--gv-tint': card.tint }"
      >
        <div class="gv-card__top">
          <span class="gv-card__icon" :class="{ 'is-multi': !card.tint }">
            <PlatformMarks v-if="card.marks.length" :marks="card.marks" />
            <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
              <path
                d="M10 3a2 2 0 0 1 2 2v1a1 1 0 0 0 2 0V5a2 2 0 1 1 4 0v2h2v3h-1a2 2 0 1 0 0 4h1v3h-3v-1a2 2 0 1 0-4 0v1h-3a2 2 0 0 1-2-2v-2H4a2 2 0 1 1 0-4h1V9a2 2 0 0 1 2-2h1"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="gv-card__head">
            <span class="gv-card__name">{{ card.name }}</span>
            <span class="gv-card__meta">{{ categoryLabel(card.category) }}</span>
          </span>
          <span class="gv-card__aside">
            <span v-if="showOfficialBadge && card.official" class="gv-card__badge">{{
              t.official
            }}</span>
            <a
              v-if="card.homepage"
              :href="card.homepage"
              target="_blank"
              rel="noopener noreferrer"
              class="gv-card__src"
              :title="t.source"
              :aria-label="`${t.source}: ${card.name}`"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                stroke-width="1.9"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13.5 7l-3 10" />
              </svg>
            </a>
          </span>
        </div>

        <p class="gv-card__desc">{{ card.description }}</p>

        <div class="gv-card__foot">
          <span class="gv-card__plats">
            <span
              v-for="p in card.platforms"
              :key="p.key"
              class="gv-plat"
              :style="{ '--gv-plat': p.color }"
            >
              <svg
                :viewBox="p.mark.viewBox"
                width="13"
                height="13"
                fill="currentColor"
                aria-hidden="true"
              >
                <path v-for="(d, j) in p.mark.paths" :key="j" :d="d" />
              </svg>
              {{ p.label }}
            </span>
          </span>
        </div>
      </article>

      <!-- Contribute tile: a quiet, elegant invite that lives in the grid -->
      <a :href="contributeLink" class="gv-contribute">
        <span class="gv-contribute__icon">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13.5 7l-3 10" />
          </svg>
        </span>
        <span class="gv-contribute__title">{{ contribute.title }}</span>
        <span class="gv-contribute__body">{{ contribute.body }}</span>
        <span class="gv-contribute__cta">
          {{ contribute.cta }}
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </a>
    </div>

    <!-- States only when nothing is showing -->
    <div v-if="visibleCards.length === 0" class="gv-state">
      <p class="gv-state__body">{{ t.empty }}</p>
    </div>

    <p class="gv-disclaimer">{{ t.disclaimer }}</p>
  </div>
</template>

<style scoped>
.gv-store {
  max-width: 1180px;
  margin: 0 auto;
  padding: 56px 24px 96px;
}

/* ---- Split hero ---------------------------------------------------------- */
.gv-hero {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  align-items: center;
  gap: 48px;
  padding: 24px 0 8px;
  animation: gv-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.gv-hero__copy {
  text-align: start;
}

.gv-hero__title {
  margin: 0;
  font-size: clamp(34px, 5vw, 52px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.08;
  color: var(--vp-c-text-1);
}

.gv-hero__sub {
  max-width: 46ch;
  margin: 18px 0 0;
  font-size: 17px;
  line-height: 1.65;
  color: var(--vp-c-text-2);
}

.gv-hero__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 26px;
}

.gv-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 650;
  color: #fff;
  background: var(--vp-c-brand-1);
  transition:
    transform 0.18s ease,
    background 0.18s ease;
}

.gv-cta:hover {
  transform: translateY(-1px);
  background: var(--vp-c-brand-2);
}

.gv-cta:active {
  transform: translateY(0);
}

.gv-cta--ghost {
  color: var(--vp-c-text-1);
  background: transparent;
  border: 1px solid var(--vp-c-divider);
}

.gv-cta--ghost:hover {
  background: var(--vp-c-bg-soft);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 50%, var(--vp-c-divider));
}

.gv-req {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}

.gv-hero__hint {
  max-width: 52ch;
  margin: 22px 0 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}

/* Hover-reveal "how to open the popup" preview */
.gv-howto {
  position: relative;
  margin-inline-start: 8px;
  color: var(--vp-c-brand-1);
  font-weight: 600;
  white-space: nowrap;
  cursor: help;
  border-bottom: 1px dashed currentColor;
  outline: none;
}

.gv-howto__pop {
  position: absolute;
  top: calc(100% + 12px);
  inset-inline-start: 0;
  width: 268px;
  padding: 8px;
  border-radius: 14px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  box-shadow: 0 18px 48px -18px rgba(0, 0, 0, 0.5);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-6px) scale(0.97);
  transform-origin: top center;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    visibility 0.18s;
  pointer-events: none;
  z-index: 30;
}

.gv-howto__pop img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
}

.gv-howto:hover .gv-howto__pop,
.gv-howto:focus .gv-howto__pop {
  opacity: 1;
  visibility: visible;
  transform: translateY(0) scale(1);
}

/* ---- Hero showcase (right) ----------------------------------------------- */
.gv-showcase {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 280px;
}

.gv-showcase__glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(
    60% 60% at 60% 40%,
    color-mix(in srgb, var(--vp-c-brand-1) 22%, transparent),
    transparent 72%
  );
  filter: blur(46px);
  opacity: 0.8;
}

.gv-showcase__stack {
  display: grid;
  gap: 14px;
  width: min(380px, 100%);
}

.gv-mini {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 13px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  box-shadow: 0 16px 40px -24px
    color-mix(in srgb, var(--gv-accent, var(--vp-c-brand-1)) 60%, transparent);
  transform: translateX(calc(var(--i, 0) * 18px));
  animation: gv-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--i, 0) * 90ms + 120ms);
}

.gv-mini__icon {
  --gv-tile: 42px;
  flex: none;
  width: var(--gv-tile);
  height: var(--gv-tile);
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--gv-tint) 15%, transparent);
}

.gv-mini__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gv-mini__name {
  font-size: 14px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.gv-mini__desc {
  font-size: 12px;
  color: var(--vp-c-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gv-mini__switch {
  flex: none;
  width: 32px;
  height: 18px;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 2px;
}

.gv-mini__switch span {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
}

/* ---- Category filter ----------------------------------------------------- */
.gv-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 36px 0 28px;
}

.gv-filter__pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  transition:
    color 0.18s ease,
    background 0.18s ease,
    border-color 0.18s ease;
}

.gv-filter__pill:hover {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 45%, var(--vp-c-divider));
}

.gv-filter__pill.is-active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 40%, transparent);
}

.gv-filter__n {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-3);
}

.gv-filter__pill.is-active .gv-filter__n {
  color: inherit;
}

/* ---- Cards --------------------------------------------------------------- */
.gv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 18px;
}

.gv-card {
  display: flex;
  flex-direction: column;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.gv-card:hover {
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--gv-accent) 60%, var(--vp-c-divider));
  box-shadow: 0 14px 36px -18px color-mix(in srgb, var(--gv-accent) 55%, transparent);
}

.gv-card__top {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.gv-card__icon {
  --gv-tile: 48px;
  flex: none;
  width: var(--gv-tile);
  height: var(--gv-tile);
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: var(--vp-c-text-3);
  background: color-mix(in srgb, var(--gv-tint) 15%, transparent);
}

/* Several platforms: a neutral tile so no single brand colour claims the card */
.gv-card__icon.is-multi,
.gv-mini__icon.is-multi {
  background: var(--vp-c-bg-mute);
  box-shadow: inset 0 0 0 1px var(--vp-c-divider);
}

.gv-card__head {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gv-card__name {
  font-size: 15.5px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--vp-c-text-1);
}

.gv-card__meta {
  font-size: 12px;
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}

.gv-card__badge {
  flex: none;
  align-self: center;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.gv-card__desc {
  margin: 0 0 16px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gv-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--vp-c-divider);
}

.gv-card__plats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.gv-plat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 7px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-mute);
  border: 1px solid var(--vp-c-divider);
}

.gv-plat svg {
  color: var(--gv-plat);
}

.gv-card__aside {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: start;
}

.gv-card__src {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: var(--vp-c-text-3);
  transition:
    color 0.18s ease,
    background 0.18s ease;
}

.gv-card__src:hover,
.gv-card__src:focus-visible {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-mute);
}

/* ---- Contribute tile ----------------------------------------------------- */
.gv-contribute {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  min-height: 168px;
  padding: 24px 22px;
  border: 1px dashed color-mix(in srgb, var(--vp-c-text-3) 32%, transparent);
  border-radius: 16px;
  background: transparent;
  text-decoration: none;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.2s ease;
}

.gv-contribute:hover {
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 55%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 6%, transparent);
}

.gv-contribute__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  margin-bottom: 2px;
  border-radius: 12px;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.gv-contribute__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.gv-contribute__body {
  max-width: 30ch;
  font-size: 13px;
  line-height: 1.55;
  color: var(--vp-c-text-3);
}

.gv-contribute__cta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}

/* ---- States -------------------------------------------------------------- */
.gv-state {
  text-align: center;
  padding: 64px 24px;
  color: var(--vp-c-text-2);
}

.gv-state__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--vp-c-text-1);
  margin: 0 0 6px;
}

.gv-state__body {
  margin: 0 0 18px;
}

.gv-disclaimer {
  max-width: 760px;
  margin: 48px auto 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
  text-align: center;
}

@keyframes gv-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ---- Responsive ---------------------------------------------------------- */
@media (max-width: 880px) {
  .gv-hero {
    grid-template-columns: 1fr;
    gap: 8px;
    padding-top: 8px;
  }

  .gv-showcase {
    display: none;
  }
}

/* Narrow screens: the popup guide opens as a bottom sheet. Fixed positioning
   keeps the hidden preview from widening the page. */
@media (max-width: 640px) {
  .gv-howto__pop {
    position: fixed;
    top: auto;
    bottom: 16px;
    inset-inline: 16px;
    width: auto;
    max-width: 360px;
    margin-inline: auto;
    transform: translateY(8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .gv-hero,
  .gv-mini,
  .gv-card,
  .gv-cta,
  .gv-filter__pill,
  .gv-contribute {
    transition: none;
    animation: none;
    transform: none;
  }
}
</style>
