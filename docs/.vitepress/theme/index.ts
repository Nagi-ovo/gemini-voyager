import { NolebaseGitChangelogPlugin } from '@nolebase/vitepress-plugin-git-changelog/client';
import '@nolebase/vitepress-plugin-git-changelog/client/style.css';
import { type Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { defineAsyncComponent, h } from 'vue';

import AnnouncementModal from './components/AnnouncementModal.vue';
import HomeAskAI from './components/HomeAskAI.vue';
import HomeReviews from './components/HomeReviews.vue';
import HomeTeaser from './components/HomeTeaser.vue';
import SafariDownloadLink from './components/SafariDownloadLink.vue';
import SiteSupport from './components/SiteSupport.vue';
import { HomeFeaturesLazy } from './components/homeFeatures/lazy';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      'layout-top': () => h(AnnouncementModal),
      'home-hero-after': () => h(HomeTeaser),
      'home-features-before': () => h(HomeFeaturesLazy),
      'home-features-after': () => [h(HomeAskAI), h(HomeReviews)],
    });
  },
  enhanceApp({ app }) {
    app.use(NolebaseGitChangelogPlugin);
    app.component('HomeReviews', HomeReviews);
    app.component('HomeTeaser', HomeTeaser);
    app.component('HomeAskAI', HomeAskAI);
    app.component('SafariDownloadLink', SafariDownloadLink);
    app.component('SiteSupport', SiteSupport);
    // Only data-viewer.md uses it; loading it on demand keeps it out of every other page.
    // SSR still renders it in place.
    app.component(
      'FolderViewer',
      defineAsyncComponent(() => import('./components/FolderViewer.vue')),
    );
  },
} satisfies Theme;
