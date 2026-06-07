---
head:
  - - meta
    - name: robots
      content: noindex
---

# 插件市场

这个页面是旧链接兼容页。简体中文插件市场现在位于根路径：

[打开插件市场](/plugins)

<script setup>
import { inBrowser } from 'vitepress';

if (inBrowser) {
  window.location.replace('/plugins');
}
</script>
