import { type Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';

import './style.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // register global components if needed
  },
} satisfies Theme;
