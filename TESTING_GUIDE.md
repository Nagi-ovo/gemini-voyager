# 数据丢失防护功能测试指南

本指南将帮助你测试新实现的数据丢失防护功能，包括多层备份系统和存储配额监控。

---

## 📋 测试前准备

### 1. 构建扩展

```bash
# 构建 Chrome 版本
bun run build:chrome

# 或构建 Firefox 版本
bun run build:firefox
```

### 2. 安装扩展到浏览器

#### Chrome/Edge
1. 打开 `chrome://extensions/`
2. 启用"开发者模式"（右上角）
3. 点击"加载已解压的扩展程序"
4. 选择 `dist_chrome` 文件夹

#### Firefox
1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击"临时载入附加组件"
3. 选择 `dist_firefox/manifest.json`

### 3. 打开浏览器控制台

- 访问 https://gemini.google.com 或 https://aistudio.google.com/prompts
- 按 `F12` 打开开发者工具
- 切换到 **Console** 标签

---

## 🧪 测试功能清单

### ✅ 测试 1：localStorage 备份系统

**目标**：验证三层备份（primary, emergency, beforeUnload）是否正常工作

#### 步骤 1：创建测试数据

1. 在 Gemini 或 AI Studio 中创建几个文件夹
2. 添加一些对话到文件夹中
3. 打开控制台，运行以下代码查看备份：

```javascript
// 查看所有 localStorage 备份
console.log('=== Backup Keys ===');
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && key.includes('Backup')) {
    console.log(key);
  }
}

// 查看 Gemini 备份详情
const primaryBackup = localStorage.getItem('gvBackup_gemini-folders_primary');
if (primaryBackup) {
  const backup = JSON.parse(primaryBackup);
  console.log('Primary Backup:', backup);
  console.log('Folders:', backup.data.folders.length);
  console.log('Timestamp:', backup.metadata.timestamp);
}

// 查看 AI Studio 备份详情
const aiStudioBackup = localStorage.getItem('gvBackup_aistudio-folders_primary');
if (aiStudioBackup) {
  const backup = JSON.parse(aiStudioBackup);
  console.log('AI Studio Primary Backup:', backup);
  console.log('Folders:', backup.data.folders.length);
}
```

**预期结果**：
- ✅ 应该看到 `gvBackup_gemini-folders_primary`
- ✅ 应该看到 `gvBackup_gemini-folders_emergency`
- ✅ 应该看到 `gvBackup_gemini-folders_beforeUnload`
- ✅ 应该看到 `gvBackup_gemini-folders_metadata`
- ✅ 备份数据包含你创建的文件夹

---

#### 步骤 2：测试 Emergency Backup（保存前快照）

1. 修改一个文件夹名称
2. 在控制台查看 emergency backup：

```javascript
const emergencyBackup = localStorage.getItem('gvBackup_gemini-folders_emergency');
if (emergencyBackup) {
  const backup = JSON.parse(emergencyBackup);
  console.log('Emergency Backup (before save):', backup);
  console.log('This should have the OLD folder name');
}
```

**预期结果**：
- ✅ Emergency backup 包含修改前的数据
- ✅ Primary backup 包含修改后的数据

---

#### 步骤 3：测试 BeforeUnload Backup（页面退出备份）

1. 刷新页面
2. 在控制台查看：

```javascript
const beforeUnloadBackup = localStorage.getItem('gvBackup_gemini-folders_beforeUnload');
if (beforeUnloadBackup) {
  const backup = JSON.parse(beforeUnloadBackup);
  console.log('BeforeUnload Backup:', backup);
  console.log('This was created when you left the page');
}
```

**预期结果**：
- ✅ BeforeUnload backup 存在
- ✅ 包含离开页面前的最新数据

---

### ✅ 测试 2：数据恢复机制

**目标**：验证在数据丢失情况下能否成功恢复

#### 场景 A：模拟存储加载失败

1. 在控制台运行：

```javascript
// 清空主存储（模拟加载失败）
chrome.storage.sync.remove('gvFolderData');
// 或 AI Studio
chrome.storage.sync.remove('gvFolderDataAIStudio');

console.log('Main storage cleared, refresh page to test recovery');
```

2. **刷新页面**

**预期结果**：
- ✅ 页面右上角显示通知："Folder data recovered from backup"
- ✅ 控制台显示：`[FolderManager] Data recovered from localStorage backup`
- ✅ 所有文件夹正常显示（从 localStorage 恢复）

---

#### 场景 B：模拟网络断开（用户报告的 100% 必现场景）

1. **断开网络连接**（关闭 Wi-Fi 或禁用网络适配器）
2. Gemini 显示错误页面
3. **重新连接网络**
4. **刷新页面**

**预期结果**：
- ✅ 数据不丢失（从 localStorage 恢复）
- ✅ 显示恢复通知
- ✅ 所有文件夹完整保留

**对比**：修复前，这个场景会 100% 导致数据丢失！

---

#### 场景 C：所有备份都失效（极端情况）

1. 在控制台清空所有备份：

```javascript
// 清空主存储
chrome.storage.sync.remove('gvFolderData');

// 清空所有 localStorage 备份
localStorage.removeItem('gvBackup_gemini-folders_primary');
localStorage.removeItem('gvBackup_gemini-folders_emergency');
localStorage.removeItem('gvBackup_gemini-folders_beforeUnload');
localStorage.removeItem('gvBackup_gemini-folders_metadata');

console.log('All backups cleared, refresh to see last-resort behavior');
```

2. **刷新页面**

**预期结果**：
- ✅ 显示红色错误通知："Failed to load folder data. All folders have been reset."
- ✅ 控制台显示：`[FolderManager] CRITICAL: Unable to recover data, initializing empty state`
- ✅ 文件夹被重置为空（最后防线）

---

### ✅ 测试 3：存储配额监控

**目标**：验证存储配额警告系统

#### 步骤 1：检查当前存储使用

在控制台运行：

```javascript
// 手动触发配额检查
const { StorageMonitor } = await import(chrome.runtime.getURL('src/core/services/StorageMonitor.js'));
const monitor = StorageMonitor.getInstance();

const info = await monitor.checkQuota();
console.log('=== Storage Quota Info ===');
console.log('Usage:', info.usageMB.toFixed(2), 'MB');
console.log('Quota:', info.quotaMB.toFixed(2), 'MB');
console.log('Percentage:', Math.round(info.usagePercent * 100) + '%');
```

**预期结果**：
- ✅ 显示当前存储使用情况
- ✅ 数据格式正确（MB 和百分比）

---

#### 步骤 2：模拟高存储使用（触发警告）

```javascript
// 填充 localStorage 到 80%
async function fillStorage(targetPercent) {
  const monitor = StorageMonitor.getInstance();
  let info = await monitor.checkQuota();

  console.log(`Current: ${Math.round(info.usagePercent * 100)}%`);
  console.log(`Target: ${targetPercent}%`);

  let i = 0;
  while (info.usagePercent < targetPercent / 100) {
    try {
      localStorage.setItem(`test_fill_${i}`, 'x'.repeat(50000));
      i++;

      if (i % 10 === 0) {
        info = await monitor.checkQuota();
        console.log(`Progress: ${Math.round(info.usagePercent * 100)}%`);
      }
    } catch (e) {
      console.error('Storage full at:', i, 'items');
      break;
    }
  }

  console.log('Final usage:', Math.round(info.usagePercent * 100) + '%');
}

// 填充到 85%（触发 80% 警告）
fillStorage(85);
```

**预期结果**：
- ✅ 页面右上角显示**蓝色通知**（info）
- ✅ 通知内容：`Storage usage is 85% (XXX MB / XXX MB). Consider exporting and cleaning old data to free up space.`
- ✅ 通知 3 秒后自动消失

---

#### 步骤 3：测试更高级别的警告

```javascript
// 触发 90% 警告
fillStorage(91);
```

**预期结果**：
- ✅ 显示**橙色通知**（warning）
- ✅ 通知显示 7 秒
- ✅ 控制台显示：`[StorageMonitor] Storage usage is 91%...`

---

```javascript
// 触发 95% 警告
fillStorage(96);
```

**预期结果**：
- ✅ 显示**红色通知**（error）
- ✅ 通知显示 10 秒
- ✅ 控制台显示 error 级别日志

---

#### 步骤 4：测试防重复警告

1. 等待上一个通知消失
2. 再次手动触发检查：

```javascript
const monitor = StorageMonitor.getInstance();
await monitor.checkAndWarn();
```

**预期结果**：
- ✅ **不显示新通知**（因为仍在相同的警告级别）
- ✅ 控制台显示当前使用率，但不触发新警告

---

#### 步骤 5：清理测试数据

```javascript
// 清理填充的测试数据
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && key.startsWith('test_fill_')) {
    localStorage.removeItem(key);
  }
}

console.log('Test data cleaned');

// 重新检查配额
const monitor = StorageMonitor.getInstance();
const info = await monitor.checkQuota();
console.log('Current usage:', Math.round(info.usagePercent * 100) + '%');
```

---

### ✅ 测试 4：自动监控

**目标**：验证监控是否在后台自动运行

#### 步骤 1：检查监控状态

```javascript
// 检查监控是否在运行
const monitor = StorageMonitor.getInstance();
const config = monitor.getConfig();
console.log('=== Monitor Configuration ===');
console.log('Enabled:', config.enabled);
console.log('Check Interval:', config.checkIntervalMs / 1000, 'seconds');
console.log('Thresholds:', config.warningThresholds.map(t => t * 100 + '%'));
```

**预期结果**：
- ✅ Enabled: true
- ✅ Gemini: 60 秒间隔
- ✅ AI Studio: 120 秒间隔
- ✅ Thresholds: [80%, 90%, 95%]

---

#### 步骤 2：观察自动检查

1. 保持页面打开
2. 观察控制台（1-2 分钟）

**预期结果**：
- ✅ 如果存储使用超过阈值，每隔 1-2 分钟会自动检查
- ✅ 控制台可能显示：`[StorageMonitor] Storage usage is XX%`（仅当超过阈值）

---

### ✅ 测试 5：通知系统统一性

**目标**：验证不同级别的通知样式一致

#### 测试代码

在 Gemini 页面控制台运行：

```javascript
// 获取 FolderManager 实例（需要访问私有方法，仅用于测试）
// 通过模拟不同级别的通知

// 方法 1：直接创建通知元素
function testNotification(message, level) {
  const notification = document.createElement('div');
  notification.className = `gv-notification gv-notification-${level}`;
  notification.textContent = `[Test] ${message}`;

  const colors = {
    info: '#2196F3',
    warning: '#FF9800',
    error: '#f44336',
  };

  const style = notification.style;
  style.position = 'fixed';
  style.top = '20px';
  style.right = '20px';
  style.padding = '12px 20px';
  style.background = colors[level];
  style.color = 'white';
  style.borderRadius = '4px';
  style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  style.zIndex = String(2147483647);
  style.maxWidth = '400px';
  style.fontSize = '14px';
  style.fontFamily = 'system-ui, -apple-system, sans-serif';
  style.lineHeight = '1.4';

  document.body.appendChild(notification);

  setTimeout(() => {
    try {
      document.body.removeChild(notification);
    } catch {}
  }, 3000);
}

// 测试三种级别
testNotification('Info level notification', 'info');
setTimeout(() => testNotification('Warning level notification', 'warning'), 3500);
setTimeout(() => testNotification('Error level notification', 'error'), 7000);
```

**预期结果**：
- ✅ Info：蓝色背景，3 秒后消失
- ✅ Warning：橙色背景，7 秒后消失
- ✅ Error：红色背景，10 秒后消失
- ✅ 所有通知样式一致（字体、大小、位置）

---

## 🔍 调试技巧

### 查看详细日志

在控制台设置调试模式：

```javascript
// 启用 FolderManager 调试日志
localStorage.setItem('gvFolderDebug', '1');

// 刷新页面后会看到详细日志
```

### 查看所有备份元数据

```javascript
function showAllBackups() {
  console.log('=== Gemini Backups ===');
  const metadata = localStorage.getItem('gvBackup_gemini-folders_metadata');
  if (metadata) {
    console.log(JSON.parse(metadata));
  }

  console.log('\n=== AI Studio Backups ===');
  const aiMetadata = localStorage.getItem('gvBackup_aistudio-folders_metadata');
  if (aiMetadata) {
    console.log(JSON.parse(aiMetadata));
  }
}

showAllBackups();
```

### 手动触发备份

```javascript
// 假设你能访问 FolderManager 实例
// 这需要在扩展的 content script 上下文中运行

// 创建测试数据
const testData = {
  folders: [
    { id: 'test1', name: 'Test Folder', createdAt: Date.now() }
  ],
  folderContents: {
    test1: []
  }
};

// 使用 DataBackupService
const { DataBackupService } = await import(chrome.runtime.getURL('src/core/services/DataBackupService.js'));
const backup = new DataBackupService('test-backup', data => true);

// 创建各种备份
backup.createPrimaryBackup(testData);
backup.createEmergencyBackup(testData);

console.log('Test backups created');
```

---

## 📊 性能测试

### 测试备份性能

```javascript
async function benchmarkBackup() {
  const { DataBackupService } = await import(chrome.runtime.getURL('src/core/services/DataBackupService.js'));
  const backup = new DataBackupService('perf-test', data => true);

  // 创建大量测试数据
  const largeData = {
    folders: Array.from({ length: 100 }, (_, i) => ({
      id: `folder_${i}`,
      name: `Folder ${i}`,
      createdAt: Date.now(),
    })),
    folderContents: {},
  };

  // 测试写入性能
  console.time('Primary Backup');
  backup.createPrimaryBackup(largeData);
  console.timeEnd('Primary Backup');

  console.time('Emergency Backup');
  backup.createEmergencyBackup(largeData);
  console.timeEnd('Emergency Backup');

  // 测试读取性能
  console.time('Recover from Backup');
  const recovered = backup.recoverFromBackup();
  console.timeEnd('Recover from Backup');

  console.log('Recovered folders:', recovered?.folders.length);

  // 清理
  backup.clearAllBackups();
}

benchmarkBackup();
```

**预期性能**：
- ✅ 备份创建：< 50ms
- ✅ 数据恢复：< 100ms
- ✅ 100 个文件夹可轻松处理

---

## ✅ 验收标准

所有功能正常工作的标准：

### 1. 备份系统
- ✅ Primary backup 在成功保存后创建
- ✅ Emergency backup 在保存前创建
- ✅ BeforeUnload backup 在页面退出时创建
- ✅ 备份包含完整的文件夹数据
- ✅ 备份有正确的时间戳

### 2. 数据恢复
- ✅ 断网刷新后数据不丢失
- ✅ 存储加载失败时能从备份恢复
- ✅ 显示恢复成功通知
- ✅ 极端情况下显示数据丢失警告

### 3. 配额监控
- ✅ 自动启动监控
- ✅ 80% 触发蓝色通知
- ✅ 90% 触发橙色通知
- ✅ 95% 触发红色通知
- ✅ 防止重复警告
- ✅ 通知内容清晰准确

### 4. 通知系统
- ✅ 三种级别颜色正确
- ✅ 自动消失时间正确
- ✅ 样式统一
- ✅ 位置固定（右上角）

---

## 🐛 常见问题

### Q1: 看不到备份数据？
**A**: 检查是否在正确的页面（gemini.google.com 或 aistudio.google.com/prompts）

### Q2: 监控没有启动？
**A**:
1. 检查浏览器是否支持 Storage API
2. 运行 `StorageMonitor.isStorageApiAvailable()`
3. 查看控制台是否有错误

### Q3: 通知不显示？
**A**:
1. 检查是否有 CSP 限制
2. 查看控制台错误
3. 确认通知元素已添加到 DOM：`document.querySelector('.gv-notification')`

### Q4: 备份数据过期？
**A**: 备份有 7 天有效期，超过会自动忽略。这是设计行为。

---

## 📝 测试报告模板

测试完成后，可以使用以下模板记录结果：

```
# 测试报告 - 数据丢失防护功能

## 测试环境
- 浏览器: Chrome 120 / Firefox 121
- 日期: 2025-11-19
- 构建版本: [commit hash]

## 测试结果

### 1. localStorage 备份系统
- [ ] Primary backup 创建: ✅/❌
- [ ] Emergency backup 创建: ✅/❌
- [ ] BeforeUnload backup 创建: ✅/❌
- [ ] 备份元数据正确: ✅/❌

### 2. 数据恢复机制
- [ ] 断网刷新恢复: ✅/❌
- [ ] 存储失败恢复: ✅/❌
- [ ] 恢复通知显示: ✅/❌
- [ ] 极端情况处理: ✅/❌

### 3. 存储配额监控
- [ ] 自动监控启动: ✅/❌
- [ ] 80% 警告: ✅/❌
- [ ] 90% 警告: ✅/❌
- [ ] 95% 警告: ✅/❌
- [ ] 防重复警告: ✅/❌

### 4. 通知系统
- [ ] Info 通知: ✅/❌
- [ ] Warning 通知: ✅/❌
- [ ] Error 通知: ✅/❌
- [ ] 样式统一: ✅/❌

## 发现的问题
[记录任何问题]

## 建议
[记录改进建议]
```

---

## 🎯 下一步

测试完成后，可以：

1. **创建 PR** - 将修复合并到主分支
2. **更新文档** - 在 README 中说明新功能
3. **发布版本** - 打包新版本发布到应用商店
4. **通知用户** - 在 Release Notes 中说明修复的问题

---

**祝测试顺利！** 🚀

如有问题，请查看控制台日志或联系开发团队。
