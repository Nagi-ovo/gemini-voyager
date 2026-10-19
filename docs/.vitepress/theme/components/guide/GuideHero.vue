<script setup lang="ts">
/**
 * The page's one "where is it" screenshot, full column width. With a `dark`
 * asset both images render and CSS shows the one for the theme (no SSR flash);
 * without one the light image serves both themes. The default slot is the caption.
 */
import { withBase } from 'vitepress';
import { useSlots } from 'vue';

defineProps<{ src: string; dark?: string; alt: string }>();

const slots = useSlots();
</script>

<template>
  <figure class="gvg-hero" :class="{ 'gvg-hero--paired': dark }">
    <div class="gvg-hero-frame">
      <img class="gvg-hero-light" :src="withBase(src)" :alt="alt" decoding="async" />
      <img
        v-if="dark"
        class="gvg-hero-dark"
        :src="withBase(dark)"
        :alt="alt"
        loading="lazy"
        decoding="async"
      />
    </div>
    <figcaption v-if="slots.default" class="gvg-caption"><slot /></figcaption>
  </figure>
</template>
