<script setup lang="ts">
import { useData } from 'vitepress';
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue';

import HomeFeatureDemo from './homeFeatures/HomeFeatureDemo.vue';
import { homeFeaturesContent } from './homeFeatures/content';
import { featureIcons } from './homeFeatures/featureIcons';
import { featureScenes } from './homeFeatures/scenes';
import { createStage, defaultView, stageKey } from './homeFeatures/stage';
import type { FeatureItem } from './homeFeatures/types';
import { uiIcons } from './homeFeatures/uiIcons';

const { lang } = useData();
const content = computed(() => homeFeaturesContent[lang.value] ?? homeFeaturesContent['en-US']);

// Clicking a feature plays its scene inside the demo above; one scene at a time.
const stage = createStage();
provide(stageKey, stage);
const sceneKey = (item: FeatureItem) => item.icon.split(',')[0];
// Shallow, so the item stays the same object as in the list and compares equal to it.
const active = shallowRef<FeatureItem | null>(null);
const run = ref(0);

// The scene bar steps through the list in its on-page order.
const items = computed(() => content.value.groups.flatMap((g) => g.items));
const index = computed(() => (active.value ? items.value.indexOf(active.value) : -1));
function step(by: number) {
  const n = items.value.length;
  if (index.value >= 0) play(items.value[(index.value + by + n) % n]);
}
// A list click brings the demo into view only when part of it is off screen; a demo that already
// fits stays put, so large screens never move.
const heroEl = ref<HTMLElement | null>(null);
function showDemo() {
  const el = heroEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const nav =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vp-nav-height')) ||
    64;
  const bottom = innerHeight - 60; // room for the scene bar
  if (r.top >= nav && r.bottom <= bottom) return;
  const room = bottom - nav;
  const top = r.height <= room ? r.top - nav - (room - r.height) / 2 : r.top - nav - 8;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  scrollBy({ top, behavior: smooth ? 'smooth' : 'auto' });
}
function pick(item: FeatureItem) {
  if (active.value === item) return stop();
  play(item);
  showDemo();
}

function play(item: FeatureItem) {
  // Replaying redoes the same sends, so only a different scene keeps what the last one sent.
  if (active.value && active.value !== item) stage.keep();
  Object.assign(stage.view, defaultView());
  active.value = item;
  run.value++;
}
function stop() {
  if (active.value) stage.keep();
  active.value = null;
  Object.assign(stage.view, defaultView());
}
function replay() {
  if (active.value) play(active.value);
}
stage.stop = stop;
stage.play = (key: string) => {
  const item = items.value.find((i) => sceneKey(i) === key);
  if (item) play(item);
};
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && active.value) stop();
};
watch(lang, () => {
  active.value = null;
  Object.assign(stage.view, defaultView());
});

// The visual-effects icon cycles through snow, rain and sakura.
const frame = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

const svg = (name: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${uiIcons[name] ?? ''}</svg>`;

onMounted(() => {
  document.addEventListener('keydown', onKey);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  timer = setInterval(() => frame.value++, 2200);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <section class="gvf-root">
    <div ref="heroEl">
      <HomeFeatureDemo :content="content" />
    </div>
    <div class="gvf-groups">
      <div v-for="group in content.groups" :key="group.title" class="gvf-group">
        <h4>{{ group.title }}</h4>
        <ul>
          <li v-for="item in group.items" :key="item.name">
            <button
              type="button"
              class="gvf-feature"
              :class="{ on: active === item }"
              :aria-pressed="active === item"
              @click="pick(item)"
            >
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
            </button>
          </li>
        </ul>
      </div>
    </div>

    <component
      :is="featureScenes[sceneKey(active)]"
      v-if="active"
      :key="run"
      :name="active.name"
      :detail="active.detail"
      :lang="lang"
    />

    <Transition name="gvf-bar">
      <div v-if="active" class="gvf-scene-bar" role="status">
        <span class="gvf-ic" aria-hidden="true" v-html="featureIcons[sceneKey(active)]" />
        <button
          type="button"
          class="gvf-scene-btn"
          :aria-label="content.demo.prev"
          :title="content.demo.prev"
          @click="step(-1)"
          v-html="svg('chevron-left')"
        />
        <b>{{ active.name }}</b>
        <span class="gvf-scene-count">{{ index + 1 }} / {{ items.length }}</span>
        <button
          type="button"
          class="gvf-scene-btn"
          :aria-label="content.demo.next"
          :title="content.demo.next"
          @click="step(1)"
          v-html="svg('chevron-right')"
        />
        <span class="gvf-scene-sep" aria-hidden="true" />
        <button
          type="button"
          class="gvf-scene-btn"
          :aria-label="content.demo.replay"
          :title="content.demo.replay"
          @click="replay"
          v-html="svg('rotate-ccw')"
        />
        <button
          type="button"
          class="gvf-scene-btn"
          :aria-label="content.demo.close"
          :title="content.demo.close"
          @click="stop"
          v-html="svg('x')"
        />
      </div>
    </Transition>
  </section>
</template>
