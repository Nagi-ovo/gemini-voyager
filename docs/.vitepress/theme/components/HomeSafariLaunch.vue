<script setup lang="ts">
import { useData } from 'vitepress';

const { frontmatter } = useData();
</script>

<template>
  <section v-if="frontmatter.safariLaunch" class="home-safari-launch">
    <a
      class="home-safari-launch__link"
      :href="frontmatter.safariLaunch.link"
      :aria-label="frontmatter.safariLaunch.alt"
    >
      <img
        :src="frontmatter.safariLaunch.image"
        :alt="frontmatter.safariLaunch.alt"
        width="1672"
        height="944"
        loading="lazy"
        decoding="async"
      />
    </a>
  </section>
</template>

<style scoped>
.home-safari-launch {
  max-width: 1056px;
  margin: 64px auto 24px;
  padding: 0 24px;
}

.home-safari-launch__link {
  display: block;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  box-shadow: 0 18px 50px color-mix(in srgb, var(--vp-c-brand-1) 12%, transparent);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease;
}

.home-safari-launch__link:hover {
  transform: translateY(-2px);
  box-shadow: 0 22px 58px color-mix(in srgb, var(--vp-c-brand-1) 17%, transparent);
}

.home-safari-launch__link:focus-visible {
  outline: 3px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}

.home-safari-launch img {
  display: block;
  width: 100%;
  height: auto;
}

@media (max-width: 640px) {
  .home-safari-launch {
    margin: 40px auto 12px;
    padding: 0 16px;
  }

  .home-safari-launch__link {
    border-radius: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-safari-launch__link {
    transition: none;
  }

  .home-safari-launch__link:hover {
    transform: none;
  }
}
</style>
