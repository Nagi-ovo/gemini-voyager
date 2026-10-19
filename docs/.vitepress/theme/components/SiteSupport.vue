<script setup lang="ts">
/**
 * A guide page's "supported platforms" table: `<SiteSupport feature="folders"
 * :labels="{ folders: '…', activity: '…' }" />`. Rows and ticks come from the
 * shipped code (`docs/.vitepress/siteSupport.ts`); the page only names the rows.
 * A row the page has no label for shows its id, so a new capability is noticed.
 */
import { useData } from 'vitepress';
import { computed } from 'vue';

import { data } from '../siteSupport.data';

const props = defineProps<{ feature: string; labels?: Record<string, string> }>();

const { localeIndex } = useData();
const words = computed(() => data.locales[localeIndex.value] ?? data.locales.root);
const rows = computed(() => data.features[props.feature] ?? []);
const anyOn = computed(() => rows.value.some((row) => row.cells.includes('on')));
</script>

<template>
  <div class="gv-plugins-table gv-site-support">
    <table>
      <thead>
        <tr>
          <th>{{ words.feature }}</th>
          <th v-for="site in data.sites" :key="site.id">
            <span v-html="site.mark" />{{ site.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>{{ labels?.[row.id] ?? row.id }}</td>
          <td v-for="(cell, index) in row.cells" :key="data.sites[index].id">
            <span
              v-if="cell === 'on'"
              class="gv-plugins-tick gv-plugins-on"
              :title="words.defaultOn"
              >✓</span
            >
            <span v-else-if="cell === 'yes'" class="gv-plugins-tick">✓</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="anyOn" class="gv-plugins-legend">
      <span class="gv-plugins-tick gv-plugins-on">✓</span> {{ words.defaultOn }}
    </p>
  </div>
</template>

<style scoped>
.gv-site-support td:not(:first-child),
.gv-site-support th:not(:first-child) {
  text-align: center;
}
</style>
