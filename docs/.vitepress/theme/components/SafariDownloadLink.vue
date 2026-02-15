<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

const latestVersion = ref('1.2.4'); // Default fallback version
const loading = ref(true);
const error = ref(false);

const CACHE_KEY = 'gemini-voyager-latest-version';
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

const downloadUrl = computed(() => {
  return `https://github.com/Nagi-ovo/gemini-voyager/releases/v${latestVersion.value}`;
});

onMounted(async () => {
  try {
    // Check cache first
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { version, timestamp } = JSON.parse(cached);
      const now = Date.now();

      // Use cache if it's less than 10 minutes old
      if (now - timestamp < CACHE_DURATION) {
        latestVersion.value = version;
        loading.value = false;
        return;
      }
    }

    // Fetch from API if cache is stale or missing
    const response = await fetch(
      'https://api.github.com/repos/Nagi-ovo/gemini-voyager/releases/latest',
    );
    if (!response.ok) throw new Error('Failed to fetch');

    const data = await response.json();
    // Extract version number from tag name (e.g., "v1.2.3" => "1.2.3")
    const version = data.tag_name.replace(/^v/, '');
    latestVersion.value = version;

    // Save to cache
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        version,
        timestamp: Date.now(),
      }),
    );
  } catch (err) {
    console.error('Failed to fetch latest version:', err);
    error.value = true;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <a :href="downloadUrl" target="_blank" rel="noopener noreferrer" class="safari-download-link">
    <slot :version="latestVersion" :loading="loading" :error="error">
      <span v-if="loading">Loading...</span>
      <span v-else>{{ `latest Safari version` }}</span>
    </slot>
  </a>
</template>

<style scoped>
.safari-download-link {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 4px;
}
</style>
