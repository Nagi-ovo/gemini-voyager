---
head:
  - - meta
    - name: robots
      content: noindex
---

# 플러그인 목록

[플러그인 목록](/ko/guide/plugins)

<script setup>
import { inBrowser } from 'vitepress';

// The plugin marketplace became the guide's plugin table; old links land there.
if (inBrowser) {
  window.location.replace('/ko/guide/plugins');
}
</script>
