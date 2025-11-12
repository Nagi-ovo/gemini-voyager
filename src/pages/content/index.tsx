import { startChatWidthAdjuster } from './chatWidth/index';
import { startEditInputWidthAdjuster } from './editInputWidth/index';
import { startExportButton } from './export/index';
import { startAIStudioFolderManager } from './folder/aistudio';
import { startFolderManager } from './folder/index';
import { startPromptManager } from './prompt/index';
import { startTimeline } from './timeline/index';
import { startSidebarWidthAdjuster } from './sidebarWidth/index'; // 新增导入

import { startFormulaCopy } from '@/features/formulaCopy';

try {
  if (location.hostname === 'gemini.google.com') {
    startTimeline();
    startFolderManager();
    startChatWidthAdjuster();
    startEditInputWidthAdjuster();
    startFormulaCopy();

    // 启动 sidebar 宽度调整器（会向页面注入样式）
    startSidebarWidthAdjuster();
  }
  if (
    location.hostname === 'gemini.google.com' ||
    location.hostname === 'aistudio.google.com' ||
    location.hostname === 'aistudio.google.cn'
  ) {
    startPromptManager();
  }
  if (location.hostname === 'aistudio.google.com' || location.hostname === 'aistudio.google.cn') {
    startAIStudioFolderManager();
  }
  startExportButton();
} catch (e) {
  console.error(e);
}