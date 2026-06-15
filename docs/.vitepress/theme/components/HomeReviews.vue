<script setup lang="ts">
import { useData } from 'vitepress';
import { computed } from 'vue';
import { Vue3Marquee } from 'vue3-marquee';

import reviewPoolData from '../data/reviews.json';

const { lang } = useData();

interface I18nData {
  title: string;
  subtitle: string;
  highlightText: string;
  tryVoyagerText: string;
}

const i18n: Record<string, I18nData> = {
  'zh-CN': {
    title: '深受社区喜爱',
    subtitle: '与数万名 Voyager 同行，从容掌控 Gemini 工作流。',
    highlightText: '🎉 感谢知名科技圈大 V 与社区的强烈推荐！',
    tryVoyagerText:
      '在 2 月 18 号 Google Gemini App 导致部分用户历史对话无法访问的问题中，Voyager 的用户仍然能够在其文件夹中看到被保存下来的对话。',
  },
  'en-US': {
    title: 'Loved by the Community',
    subtitle: 'Join tens of thousands of users organizing their Gemini workspace.',
    highlightText: '🎉 Highly recommended by top tech KOLs and the community!',
    tryVoyagerText:
      "During the issue on February 18th where the Google Gemini App caused some users' historical conversations to become inaccessible, Voyager users were still able to see their saved conversations in their folders.",
  },
  'ja-JP': {
    title: 'コミュニティから愛されています',
    subtitle: '数万人のユーザーと一緒に、Gemini のワークフローを整理しましょう。',
    highlightText: '🎉 トップテックKOLやコミュニティから強く推奨されています！',
    tryVoyagerText:
      '2月18日にGoogle Gemini Appが一部のユーザーの履歴会話にアクセスできなくなる問題を引き起こした際、Voyagerのユーザーは引き続きフォルダ内に保存された会話を見ることができました。',
  },
  'fr-FR': {
    title: 'Aimé par la Communauté',
    subtitle:
      "Rejoignez des dizaines de milliers d'utilisateurs qui organisent leur espace de travail Gemini.",
    highlightText: '🎉 Fortement recommandé par les meilleurs influenceurs tech !',
    tryVoyagerText:
      "Lors du problème du 18 février où l'application Google Gemini a rendu inaccessibles les conversations historiques de certains utilisateurs, les utilisateurs de Voyager ont toujours pu voir leurs conversations enregistrées dans leurs dossiers.",
  },
  'es-ES': {
    title: 'Amado por la Comunidad',
    subtitle: 'Únete a decenas de miles de usuarios organizando su espacio de trabajo en Gemini.',
    highlightText: '🎉 ¡Altamente recomendado por los principales influencers tecnológicos!',
    tryVoyagerText:
      'Durante el problema del 18 de febrero en el que la aplicación Google Gemini hizo inaccesibles las conversaciones históricas de algunos usuarios, los usuarios de Voyager aún pudieron ver sus conversaciones guardadas en sus carpetas.',
  },
};

const t = computed(() => {
  return i18n[lang.value as string] || i18n['en-US'];
});

interface Review {
  name: string;
  username?: string;
  avatar: string;
  content: string;
  source?: string;
  lang?: string;
}

// Curated, maintainable review pool (docs/.vitepress/theme/data/reviews.json).
// Refresh it with `bun output/reviews/fetch-reviews.mjs` then re-curate.
const reviewPool = reviewPoolData as Review[];

// VitePress locale -> review language code.
const localeToReviewLang: Record<string, string> = {
  'zh-CN': 'zh',
  'zh-TW': 'zh',
  'en-US': 'en',
  'ja-JP': 'ja',
  'fr-FR': 'fr',
  'es-ES': 'es',
  'ko-KR': 'ko',
};

const TOTAL = 30; // cards rendered across all rows
const SPRINKLE = 6; // other-language cards mixed into the wall

function dedupeByName(list: Review[]): Review[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  });
}

// Build the display list: mostly the current locale's language, with a small,
// language-diverse sprinkle of others interleaved at even intervals. Locales
// without depth fall back to an English-majority wall but keep any native
// reviews up front. Fully deterministic (no randomness) so SSR === client.
function buildDisplay(primaryLang: string): Review[] {
  const primary = reviewPool.filter((r) => r.lang === primaryLang);
  const english = reviewPool.filter((r) => r.lang === 'en');
  const body = dedupeByName(
    primary.length >= TOTAL - SPRINKLE ? primary : [...primary, ...english],
  );

  const bodyNames = new Set(body.map((r) => r.name));
  const others = reviewPool.filter((r) => r.lang !== primaryLang && !bodyNames.has(r.name));
  const byLang = new Map<string, Review[]>();
  for (const r of others) {
    const key = r.lang ?? 'other';
    if (!byLang.has(key)) byLang.set(key, []);
    byLang.get(key)!.push(r);
  }
  // Round-robin one per language so the sprinkle spans as many languages as possible.
  const sprinkle: Review[] = [];
  const langs = [...byLang.keys()];
  let i = 0;
  while (sprinkle.length < SPRINKLE && langs.some((l) => byLang.get(l)!.length > 0)) {
    const bucket = byLang.get(langs[i % langs.length])!;
    if (bucket.length) sprinkle.push(bucket.shift()!);
    i++;
  }

  const main = body.slice(0, TOTAL - sprinkle.length);
  const out = [...main];
  const gap = Math.max(1, Math.floor(out.length / (sprinkle.length + 1)));
  sprinkle.forEach((s, idx) => {
    out.splice(Math.min((idx + 1) * gap + idx, out.length), 0, s);
  });
  return out.slice(0, TOTAL);
}

const displayReviews = computed<Review[]>(() =>
  buildDisplay(localeToReviewLang[lang.value as string] ?? 'en'),
);

// Split into 3 staggered rows; modulo keeps each row language-mixed.
const rows = computed<Review[][]>(() =>
  [0, 1, 2].map((r) => displayReviews.value.filter((_, i) => i % 3 === r)),
);

// Each row scrolls at a slightly different speed and alternating direction so
// the wall feels organic rather than a single synchronized block.
const rowConfig = [
  { direction: 'normal' as const, duration: 64 },
  { direction: 'reverse' as const, duration: 52 },
  { direction: 'normal' as const, duration: 72 },
];
</script>

<template>
  <div class="reviews-section">
    <h2 class="title">{{ t.title }}</h2>

    <div class="highlight-banner">
      <!-- Try Voyager Promo -->
      <a
        href="https://x.com/Nag1ovo/status/2024509398601597412?s=20"
        target="_blank"
        rel="noopener noreferrer"
        class="promo-card"
        style="text-decoration: none"
      >
        <img src="/assets/try-voyager.png" alt="Try Voyager" class="promo-image" />
        <div class="promo-text">{{ t.tryVoyagerText }}</div>
      </a>

      <!-- X Recommendation -->
      <div class="promo-card x-recommendation-card">
        <a
          href="https://x.com/Nag1ovo/status/2024509398601597412?s=20"
          target="_blank"
          rel="noopener noreferrer"
          class="highlight-text-card"
        >
          {{ t.highlightText }}
        </a>
        <a
          href="https://x.com/Nag1ovo/status/2024507762483277927?s=20"
          target="_blank"
          rel="noopener noreferrer"
          class="highlight-image-link"
        >
          <img
            src="/assets/x-recommendation.png"
            alt="Recommendation from @DataChaz"
            class="highlight-image"
          />
        </a>
      </div>
    </div>

    <p class="subtitle">{{ t.subtitle }}</p>

    <div class="marquee-stack">
      <Vue3Marquee
        v-for="(row, rowIndex) in rows"
        :key="rowIndex"
        :pause-on-hover="true"
        :duration="rowConfig[rowIndex].duration"
        :direction="rowConfig[rowIndex].direction"
        class="marquee-row"
      >
        <div v-for="(review, index) in row" :key="index" class="review-card">
          <div class="card-header">
            <img
              :src="review.avatar"
              :alt="review.name"
              class="avatar"
              loading="lazy"
              referrerpolicy="no-referrer"
            />
            <div class="user-info">
              <div class="name">{{ review.name }}</div>
              <div class="source" v-if="review.source">{{ review.source }}</div>
            </div>
          </div>
          <p class="content">{{ review.content }}</p>
        </div>
      </Vue3Marquee>
    </div>
  </div>
</template>

<style scoped>
.reviews-section {
  margin-top: 64px;
  margin-bottom: 64px;
  padding: 0 24px;
  text-align: center;
}

.title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 12px;
  background: var(--vp-home-hero-name-background);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: 18px;
  color: var(--vp-c-text-2);
  margin-bottom: 48px;
}

.highlight-banner {
  display: flex;
  justify-content: center;
  align-items: stretch;
  gap: 24px;
  margin-bottom: 32px;
  flex-wrap: wrap;
}

.promo-card {
  flex: 1;
  min-width: 300px;
  max-width: 500px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-bg-soft-up);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease;
}

.promo-card:hover {
  transform: translateY(-2px);
  border-color: var(--vp-c-brand-1);
}

.promo-image {
  width: 100%;
  max-width: 460px;
  height: auto;
  border-radius: 12px;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  object-fit: contain;
}

.promo-text {
  font-size: 14px;
  color: var(--vp-c-text-2);
  line-height: 1.5;
  font-style: italic;
  text-align: center;
}

.x-recommendation-card {
  gap: 16px;
}

.highlight-text-card {
  width: 100%;
  background: var(--vp-c-bg-mutate);
  border: 1px solid var(--vp-c-brand-soft);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vp-c-text-1);
  font-weight: 600;
  font-size: 16px;
  text-decoration: none;
  text-align: center;
  line-height: 1.5;
  transition: color 0.2s ease;
}

.highlight-text-card:hover {
  color: var(--vp-c-brand-1);
}

.highlight-image-link {
  display: block;
  width: 100%;
  transition: transform 0.2s ease;
}

.highlight-image-link:hover {
  transform: translateY(-2px);
}

.highlight-image {
  width: 100%;
  height: auto;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  object-fit: contain;
}

.marquee-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* Fade both horizontal edges so cards slide in/out softly. */
  mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
}

.marquee-row {
  width: 100%;
}

.review-card {
  box-sizing: border-box;
  width: 340px;
  height: 172px; /* Fits header + 3 full lines; keeps each row aligned */
  overflow: hidden; /* Clean rounded clipping, no mid-glyph spill */
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-bg-soft-up);
  border-radius: 16px;
  padding: 20px 22px;
  margin: 0 10px;
  display: flex;
  flex-direction: column;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
  text-align: left;
}

.review-card:hover {
  transform: translateY(-4px);
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.card-header {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  margin-right: 12px;
  flex-shrink: 0;
  object-fit: cover;
  background-color: var(--vp-c-bg-mute); /* Placeholder bg */
}

.user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.name {
  font-weight: 600;
  font-size: 15px;
  color: var(--vp-c-text-1);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.source {
  font-size: 12px;
  color: var(--vp-c-text-3);
  margin-top: 2px;
}

.content {
  font-size: 14px;
  color: var(--vp-c-text-2);
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Tablet */
@media (max-width: 768px) {
  .review-card {
    width: 300px;
    height: 168px;
    padding: 18px 20px;
  }
}

/* Mobile */
@media (max-width: 480px) {
  .reviews-section {
    padding: 0 12px;
  }

  .marquee-stack {
    gap: 12px;
    mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
    -webkit-mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
  }

  .review-card {
    width: 258px;
    height: 156px;
    padding: 16px 16px;
    margin: 0 7px;
    border-radius: 14px;
  }

  .avatar {
    width: 34px;
    height: 34px;
    margin-right: 10px;
  }

  .card-header {
    margin-bottom: 10px;
  }

  .name {
    font-size: 14px;
  }

  .content {
    font-size: 13px;
  }
}

/* Respect reduced-motion preference: stop the scroll. */
@media (prefers-reduced-motion: reduce) {
  .marquee-row :deep(.marquee) {
    animation: none !important;
  }
}
</style>
