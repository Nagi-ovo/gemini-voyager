---
head:
  - - meta
    - name: robots
      content: noindex
---

# プラグイン一覧

[プラグイン一覧](/ja/guide/plugins)

<script setup>
import { inBrowser } from 'vitepress';

// The plugin marketplace became the guide's plugin table; old links land there.
if (inBrowser) {
  window.location.replace('/ja/guide/plugins');
}
</script>
