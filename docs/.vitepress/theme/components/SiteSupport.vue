<script setup lang="ts">
/**
 * A guide page's "supported platforms" table: `<SiteSupport feature="folders"
 * :labels="{ folders: '…', activity: '…' }" />`. Rows and ticks come from the
 * shipped code (`docs/.vitepress/siteSupport.ts`); the page only names the rows.
 * A row the page has no label for shows its id, so a new capability is noticed.
 *
 * `:only="[{ id: 'move-menu', sites: ['gemini', 'claude'] }]"` adds footer rows
 * for site differences no code data describes; their labels come from `labels`.
 */
import { useData } from 'vitepress';
import { computed } from 'vue';

import type { PluginSite } from '../../pluginsPage';
import type { SupportCell } from '../../siteSupport';
import { data } from '../siteSupport.data';

const props = defineProps<{
  feature: string;
  labels?: Record<string, string>;
  only?: { id: string; sites: PluginSite[] }[];
}>();

const { localeIndex } = useData();
const words = computed(() => data.locales[localeIndex.value] ?? data.locales.root);
const rows = computed(() => data.features[props.feature] ?? []);
const onlyRows = computed(() =>
  (props.only ?? []).map((row) => ({
    id: row.id,
    cells: data.sites.map((site): SupportCell => (row.sites.includes(site.id) ? 'yes' : '')),
  })),
);

/** `**Plugins**` in a label or the legend is a popup label, shown bold. */
function parts(text: string): { text: string; bold: boolean }[] {
  return text.split('**').map((part, index) => ({ text: part, bold: index % 2 === 1 }));
}

const label = (id: string): string => props.labels?.[id] ?? id;
</script>

<template>
  <div class="gvg-support">
    <div class="gvg-support-scroll">
      <table>
        <colgroup>
          <col class="gvg-support-name" />
          <col v-for="site in data.sites" :key="site.id" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{{ words.feature }}</th>
            <th v-for="site in data.sites" :key="site.id" scope="col">
              <span class="gvg-support-mark" aria-hidden="true" v-html="site.mark" />
              <span class="gvg-support-site">{{ site.label }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <th scope="row">{{ label(row.id) }}</th>
            <td v-for="(cell, index) in row.cells" :key="data.sites[index].id">
              <span v-if="cell === 'on'" class="gvg-tick-on" :title="words.ready">✓</span>
              <span v-else-if="cell === 'yes'" class="gvg-tick">✓</span>
              <span v-else class="gvg-tick-no" aria-hidden="true">·</span>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="gvg-support-legend">
            <td :colspan="data.sites.length + 1">
              <div class="gvg-support-keys">
                <span class="gvg-support-key">
                  <span class="gvg-tick-on" aria-hidden="true">✓</span>{{ words.ready }}
                </span>
                <span class="gvg-support-key">
                  <span class="gvg-tick" aria-hidden="true">✓</span>
                  <span>
                    <template v-for="(part, index) in parts(words.toggle)" :key="index">
                      <strong v-if="part.bold">{{ part.text }}</strong>
                      <template v-else>{{ part.text }}</template>
                    </template>
                  </span>
                </span>
              </div>
            </td>
          </tr>
          <tr v-for="row in onlyRows" :key="row.id" class="gvg-support-only">
            <th scope="row">
              <template v-for="(part, index) in parts(label(row.id))" :key="index">
                <strong v-if="part.bold">{{ part.text }}</strong>
                <template v-else>{{ part.text }}</template>
              </template>
            </th>
            <td v-for="(cell, index) in row.cells" :key="data.sites[index].id">
              <span v-if="cell === 'yes'" class="gvg-tick">✓</span>
              <span v-else class="gvg-tick-no" aria-hidden="true">·</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>
