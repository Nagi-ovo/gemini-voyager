<script setup lang="ts">
/**
 * One small fact in a `<GuideFacts>` grid: a titled card. Its title is no
 * outline entry (the section's `##` is); a "read more" link goes last in the
 * slot as a markdown link, so the build still checks it.
 */
defineProps<{ title: string }>();
</script>

<template>
  <section class="gvg-fact">
    <h3 class="gvg-fact-title">{{ title }}</h3>
    <div class="gvg-fact-body"><slot /></div>
  </section>
</template>
