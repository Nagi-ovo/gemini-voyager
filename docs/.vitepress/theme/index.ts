import { type Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';

import HomeReviews from './components/HomeReviews.vue';
import HomeTeaser from './components/HomeTeaser.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      'home-hero-after': () => h(HomeTeaser),
      'home-features-after': () => h(HomeReviews),
    });
  },
  enhanceApp({ app }) {
    app.component('HomeReviews', HomeReviews);
    app.component('HomeTeaser', HomeTeaser);
  },
} satisfies Theme;
