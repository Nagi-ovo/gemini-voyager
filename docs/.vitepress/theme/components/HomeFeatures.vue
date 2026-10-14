<script setup lang="ts">
import { useData } from 'vitepress';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import HomeFeatureDemo from './homeFeatures/HomeFeatureDemo.vue';
import { homeFeaturesContent } from './homeFeatures/content';
import { featureIcons } from './homeFeatures/featureIcons';

const { lang } = useData();
const content = computed(() => homeFeaturesContent[lang.value] ?? homeFeaturesContent['en-US']);

// The visual-effects icon cycles through snow, rain and sakura.
const frame = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  timer = setInterval(() => frame.value++, 2200);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <section class="gvf-root">
    <HomeFeatureDemo :content="content" />
    <div class="gvf-groups">
      <div v-for="group in content.groups" :key="group.title" class="gvf-group">
        <h4>{{ group.title }}</h4>
        <ul>
          <li v-for="item in group.items" :key="item.name" class="gvf-feature">
            <span class="gvf-ic" aria-hidden="true">
              <span
                v-for="(key, i) in item.icon.split(',')"
                :key="key"
                :class="{ off: frame % item.icon.split(',').length !== i }"
                v-html="featureIcons[key]"
              />
            </span>
            <b>{{ item.name }}</b>
            <span>{{ item.detail }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
