import { type Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';

import HomeReviews from './components/HomeReviews.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      'home-features-after': () => h(HomeReviews),
    });
  },
  enhanceApp({ app }) {
    app.component('HomeReviews', HomeReviews);
  },
} satisfies Theme;
