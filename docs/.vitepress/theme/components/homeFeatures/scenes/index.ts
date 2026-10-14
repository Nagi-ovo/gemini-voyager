import { defineAsyncComponent, type Component } from 'vue';

/** Feature scenes keyed by the item's first icon key; each loads when its feature is first clicked. */
export const featureScenes: Record<string, Component> = {
  'move-horizontal': defineAsyncComponent(() => import('./ChatWidth.vue')),
  'a-large-small': defineAsyncComponent(() => import('./FontSize.vue')),
  'clock-3': defineAsyncComponent(() => import('./Timestamps.vue')),
  workflow: defineAsyncComponent(() => import('./Mermaid.vue')),
  snowflake: defineAsyncComponent(() => import('./Effects.vue')),
  'file-down': defineAsyncComponent(() => import('./ChatExport.vue')),
  microscope: defineAsyncComponent(() => import('./DeepResearch.vue')),
  cloud: defineAsyncComponent(() => import('./CloudSync.vue')),
  'list-x': defineAsyncComponent(() => import('./BatchDelete.vue')),
  image: defineAsyncComponent(() => import('./Watermark.vue')),
  quote: defineAsyncComponent(() => import('./QuoteReply.vue')),
  'corner-down-left': defineAsyncComponent(() => import('./SendBehavior.vue')),
  star: defineAsyncComponent(() => import('./DefaultModel.vue')),
  'git-branch': defineAsyncComponent(() => import('./ChatBranch.vue')),
  sigma: defineAsyncComponent(() => import('./FormulaCopy.vue')),
  puzzle: defineAsyncComponent(() => import('./PluginStore.vue')),
  globe: defineAsyncComponent(() => import('./MultiSite.vue')),
  monitor: defineAsyncComponent(() => import('./LocalWebUI.vue')),
  code: defineAsyncComponent(() => import('./IdeSync.vue')),
  'panel-left-close': defineAsyncComponent(() => import('./SidebarHide.vue')),
};
