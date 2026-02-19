<script setup lang="ts">
import { useData } from 'vitepress';
import { computed } from 'vue';
import { Vue3Marquee } from 'vue3-marquee';

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
  source?: 'Chrome Web Store' | 'Edge Add-ons' | 'X';
}

const reviews: Review[] = [
  {
    name: 'Shuyun Yang',
    avatar:
      'https://lh3.googleusercontent.com/a/ACg8ocI4nd0KLo2Cgi8PSmkl9oUxy6Dm-fIMqepv-uR0hpGHt7Zw3A=s48-w48-h48',
    content: '非常好用，最全最顺滑的扩展！',
    source: 'Chrome Web Store',
  },
  {
    name: 'Aimee Chen',
    avatar:
      'https://lh3.googleusercontent.com/a-/ALV-UjUMiFlYAN-GdaQWqSepuvA_JuWDNWLTrx-VFrCjK0J2DeD4_QN5Ig=s48-w48-h48',
    content:
      '太好用了，helps a lot!! 解決很多對話框雜亂及一直上下捲找資料的困擾，安裝完馬上直覺操作，神器呀!!',
    source: 'Chrome Web Store',
  },
  {
    name: '@yug1224',
    avatar: 'https://pbs.twimg.com/profile_images/1600779910720520192/QKdZC5yr_400x400.jpg',
    content:
      'Geminiの操作性を高める拡張機能群らしい。チャット管理や機能追加で作業効率が上がりそうかな。',
    source: 'X',
  },
  {
    name: 'Hi Sanzee',
    avatar:
      'https://lh3.googleusercontent.com/a-/ALV-UjVKp0gzYvVWOcKVbXxpZqAwo8tZer5qv6isJoYeVfZet7C28aQh=s48-w48-h48',
    content:
      'This is a god send. Thank you so much. Someone who Designs and Develops. This is a gold mine I was searching for.',
    source: 'Chrome Web Store',
  },
  {
    name: 'Mars Wang',
    avatar:
      'https://lh3.googleusercontent.com/a-/ALV-UjX9WVnxeHbGZOkSMFxgtrFxUeCpqxKiGW213iWf-XIYuQBJ2KM=s48-w48-h48',
    content:
      'omg, this is exactly what I need. Looking forward for more functions! Thank you for open scourse!',
    source: 'Chrome Web Store',
  },
  {
    name: 'CCC',
    avatar:
      'https://lh3.googleusercontent.com/a/ACg8ocIYRaHTC91ZFa_QS3wyFxv97bgOgWiJxtwcxhXVn13XJIDNMVP7=s48-w48-h48',
    content: '必須大推！文件夾功能超好用，根本像原裝軟件，屌翻天。',
    source: 'Chrome Web Store',
  },
  {
    name: 'frequnet san',
    avatar:
      'https://lh3.googleusercontent.com/a/ACg8ocJ0vcIr0k64uGkLU7pJ1mXmSPm28uKfedjge0Jf7zvwdiDjaQ=s48-w48-h48',
    content:
      "It's helpful to use gemini with study / research for students like me, more details in readme of github help a lot!",
    source: 'Chrome Web Store',
  },
  {
    name: 'Kook Wu',
    avatar:
      'https://lh3.googleusercontent.com/a-/ALV-UjUf2aLVqTH5ji5yAq1-dRfmghfn0-Zik1Thg593VfEsIuLMpY5i=s48-w48-h48',
    content: '这个世界完美了',
    source: 'Chrome Web Store',
  },
  {
    name: 'LYNXUTE',
    avatar:
      'https://lh3.googleusercontent.com/a-/ALV-UjVQNBHXfgi56K3ekpxu7rsMKD0Iv5KJA5fmL31IcQM6oWHZMxw=s48-w48-h48',
    content: '爱音神了',
    source: 'Chrome Web Store',
  },
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

    <Vue3Marquee :pause-on-hover="true" :duration="40" class="marquee-wrapper">
      <div v-for="(review, index) in reviews" :key="index" class="review-card">
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
        <p class="content">"{{ review.content }}"</p>
      </div>
    </Vue3Marquee>
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

.marquee-wrapper {
  mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
}

.review-card {
  width: 320px;
  height: 180px; /* Fixed height for uniformity */
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-bg-soft-up);
  border-radius: 16px;
  padding: 24px;
  margin: 0 16px;
  display: flex;
  flex-direction: column;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease;
  text-align: left;
}

.review-card:hover {
  transform: translateY(-4px);
  border-color: var(--vp-c-brand-1);
}

.card-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  margin-right: 12px;
  background-color: var(--vp-c-bg-mute); /* Placeholder bg */
}

.user-info {
  display: flex;
  flex-direction: column;
}

.name {
  font-weight: 600;
  font-size: 15px;
  color: var(--vp-c-text-1);
  line-height: 1.2;
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
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-style: italic;
}
</style>
