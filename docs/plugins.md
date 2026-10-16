---
head:
  - - meta
    - name: robots
      content: noindex
---

# 插件一览

[插件一览](/guide/plugins)

<script setup>
import { inBrowser } from 'vitepress';

// The plugin marketplace became the guide's plugin table; old links land there.
if (inBrowser) {
  window.location.replace('/guide/plugins');
}
</script>
