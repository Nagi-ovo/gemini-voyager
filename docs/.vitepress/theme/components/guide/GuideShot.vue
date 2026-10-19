<script setup lang="ts">
/**
 * One screenshot on a guide page. `crop` (a Voyager element on its own) sits on
 * a soft backdrop so a light crop does not glare in dark mode; `panel` (a popup
 * or window region) takes the card frame. `width` is the CSS width, half the
 * 2x asset's pixels. The default slot is the caption.
 */
import { withBase } from 'vitepress';
import { computed, useSlots } from 'vue';

const props = withDefaults(
  defineProps<{ src: string; alt: string; width: number; kind?: 'crop' | 'panel' }>(),
  { kind: 'crop' },
);

const slots = useSlots();
const style = computed(() => ({ '--gvg-shot-w': `${props.width}px` }));
</script>

<template>
  <figure class="gvg-shot" :class="`gvg-shot--${kind}`" :style="style">
    <div class="gvg-shot-frame">
      <img :src="withBase(src)" :alt="alt" :width="width" loading="lazy" decoding="async" />
    </div>
    <figcaption v-if="slots.default" class="gvg-caption"><slot /></figcaption>
  </figure>
</template>
