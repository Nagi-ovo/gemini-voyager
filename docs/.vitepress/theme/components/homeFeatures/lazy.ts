import { useData } from 'vitepress';
import { defineAsyncComponent, defineComponent, h } from 'vue';

import HomeFeatures from '../HomeFeatures.vue';
import { homeFeaturesContent, loadHomeFeaturesContent } from './content';

/**
 * Renders `HomeFeatures` once the page language's copy has loaded. SSR waits for the async
 * component, and client hydration leaves the server HTML in place until it resolves, so the
 * section never renders empty or mismatched. Later language switches load inside HomeFeatures.
 */
export const HomeFeaturesLazy = defineComponent(
  function HomeFeaturesLazy() {
    const { lang } = useData();
    // Chosen once: swapping the async wrapper for HomeFeatures mid-hydration would remount it.
    const Inner = homeFeaturesContent[lang.value]
      ? HomeFeatures
      : defineAsyncComponent(() => loadHomeFeaturesContent(lang.value).then(() => HomeFeatures));
    return () => h(Inner);
  },
  { name: 'HomeFeaturesLazy' },
);
