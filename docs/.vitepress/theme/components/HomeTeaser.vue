<script setup lang="ts">
import { useData } from 'vitepress';

const { frontmatter } = useData();
</script>

<template>
  <div v-if="frontmatter.teaser" class="vp-doc" style="margin-top: 4rem; text-align: center">
    <h2 v-if="frontmatter.teaser.title" style="border-top: none">{{ frontmatter.teaser.title }}</h2>
    <div
      v-if="frontmatter.teaser.description"
      style="margin: 1.5rem 0; font-size: 1.1em; opacity: 0.9"
      v-html="frontmatter.teaser.description"
    ></div>

    <img
      v-if="frontmatter.teaser.image"
      :src="frontmatter.teaser.image"
      :alt="frontmatter.teaser.title || 'Teaser'"
      style="
        margin: 40px auto;
        border-radius: 12px;
        box-shadow: 0 20px 60px -20px rgba(0, 0, 0, 0.3);
        max-width: 100%;
      "
    />

    <div
      v-if="frontmatter.teaser.features"
      style="display: flex; gap: 20px; justify-content: center; margin: 60px 0; flex-wrap: wrap"
    >
      <div
        v-for="feature in frontmatter.teaser.features"
        :key="feature.title"
        style="flex: 1; min-width: 250px; max-width: 300px"
      >
        <h3 style="margin-top: 0">{{ feature.title }}</h3>
        <p style="font-size: 0.9em; opacity: 0.8" v-html="feature.details"></p>
      </div>
    </div>
  </div>
</template>

<style scoped>
h2 {
  font-size: 2.25rem;
  font-weight: 700;
  margin-bottom: 1rem;
}

@media (max-width: 768px) {
  h2 {
    font-size: 1.75rem;
  }
}
</style>
