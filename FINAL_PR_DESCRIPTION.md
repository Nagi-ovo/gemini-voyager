# PR Title: feat: add Auto-Categorization feature with live preview and index routing

### 🚫 AI Policy / AI 政策

- **We explicitly reject AI-generated PRs that have not been manually verified.**
- **本项目拒绝接受任何未经人工复核的 AI 生成的 PR。**
- Low-quality AI PRs will be closed immediately. / 低质量的 AI PR 会被直接关闭。
- You must understand and take responsibility for every line of code you submit. / 你必须理解并对你提交的每一行代码负责。
- **Workflow Proficiency / 协作能力**: Ensure you are familiar with GitHub/Git workflows and maintain a clean Git history. Please learn the basics first if needed to avoid messy PR history. / 请确保你熟悉 GitHub/Git 工作流并保持 Git 历史整洁。如有必要请先学习相关知识，避免 PR 历史过于混乱。

---

### Description / 描述

此 PR 为 Gemini Voyager 引入了全新的 **“自动归类 (Auto-Categorization)”** 功能。该功能允许用户根据消息内容或手动指定的序号，将对话自动整理到文件夹中。

This PR introduces the **"Auto-Categorization"** feature, allowing users to automatically organize conversations into folders based on message content or manually specified indices.

#### Key Features / 主要功能：
1. **AI Categorization (AI 智能归类)**:
   - 启用后，插件将根据用户消息的意图，自动将对话分配至最相关的文件夹。
   - 支持【正向/反向】触发模式：正向（有前缀才触发）或反向（全自动，有前缀则跳过）。
2. **Index Routing (序号直接归类)**:
   - 跳过 AI，通过 `.1 2 正文` 这种命令格式，直接将对话路由到指定的文件夹和子文件夹。
   - 极速分类，适合对文件夹结构熟悉的进阶用户。
3. **WYSIWYG Configuration (所见即所得设置)**:
   - 创新的实时预览组件：通过颜色码关联（蓝色-前缀、绿色-序号、橙色-分隔符），实时展示当前配置下的输入效果。
   - 预览文案根据设置实时联动（动态显示“则归类”/“则跳过”）。
4. **Enhanced Compatibility (标点兼容性)**:
   - 原生的全半角及中英文标点兼容逻辑。输入 `.` 或 `。` 均能有效触发，无需切换输入法。
5. **UI & Hierarchy (UI 与层级优化)**:
   - 深度集成于现有的“文件夹”功能之下。
   - 侧栏序号的显示逻辑已同步，确保 UI 展示与路由逻辑的一致性。

### Related Issue / 相关 Issue

Closes #287

### Visual Proof / 可视化证据

##### 0. 功能预览 (Feature Preview)
| 自动归类设置界面 (Settings UI) | 侧边栏索引显示 (Sidebar Index) |
| :---: | :---: |
| ![Settings UI](media__1772550437759.png) | ![Sidebar Index](media__1772551191683.png) |

---

##### 1. 背景与 UI 嵌套 (Background & UI Hierarchy)
- **演示 1：标准用例** - 展示了基础的 AI 自动归类逻辑，且设置项已完美嵌套在文件夹功能下。
  ![标准用例](https://github.com/user-attachments/assets/b52021e0-50f3-468e-bc1a-ff4ab82a4785)

##### 2. 触发逻辑与预览 (Trigger Logic & Preview)
- **演示 2：中文 + Pro 模型** - 中文环境下搭配 Pro 模型的丝滑体验。
  ![中文与默认模型](https://github.com/user-attachments/assets/49af4a2c-1a2f-4eca-a88f-02eb3a0ced06)
- **演示 5：反向触发模式** - “全自动归类，输入前缀则跳过”模式演示。
  ![反向触发模式](https://github.com/user-attachments/assets/962f3ed0-64b2-407a-b5d2-45f8b9b387b8)

##### 3. 序号路由与精确控制 (Routing & Precise Control)
- **演示 3：精确放入子文件夹** - 通过序号组合（如 `.1 1`）瞬间路由至特定子目录。
  ![精确子文件夹路由](https://github.com/user-attachments/assets/4cf7e411-9785-4c4b-9f91-849f7776eb6c)
- **演示 6：直接指定测试例** - 直接指定父文件夹分类演示。
  ![直接指定演示](https://github.com/user-attachments/assets/c253b64e-85da-43b9-a478-99d48a8f4999)

##### 4. 边界规则 (Edge Cases)
- **演示 4：临时对话不被归类** - 验证“临时对话”不会触发自动归类，保持目录纯净。
  ![临时对话规则](https://github.com/user-attachments/assets/c301ea99-eb07-4c46-bdfc-fab110d1d053)

### Browser Testing / 浏览器测试

- [x] **Chrome / Edge (Chromium)**: Tested / 已测试
- [x] **Firefox**: Tested (Mandatory) / 已测试（必填）
- [ ] **Safari**: Tested (Optional) or labeled as unsupported / 已测试（可选）或已标注为不支持

### Checklist / 检查清单

- [x] I have manually verified that the feature works as intended. / 我已手动验证功能按预期工作。
- [x] I have confirmed that this PR does not break existing functionality. / 我已确认此 PR 不会破坏原有功能。
- [x] I have run `bun run lint`, `bun run typecheck`, `bun run format` and `bun run build`. / 我已运行代码校验、类型检查、格式化及构建。
- [x] I have added/updated necessary tests and they pass (`bun run test`). / 我已添加/更新了必要的测试并确保通过（`bun run test`）。
