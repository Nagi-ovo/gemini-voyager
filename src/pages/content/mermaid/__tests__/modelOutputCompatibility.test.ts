import { describe, expect, it } from 'vitest';

import { normalizeMermaidCode } from '../index';

describe('model-output Mermaid compatibility', () => {
  it.each([
    `sequenceDiagram
      participant 你 as 🐂 逼的你
      participant 系统 as 崩溃的核心服务器
      激活->>你:
      你->>系统: SSH登录/看日志/改配置
      系统-->>你: 瞬间恢复正常
      deactivate 你`,
    `graph LR
      subgraph 流量层 (日活十亿)
        User[用户请求] --> DNS[智能DNS/CDN]
      end
      subgraph 数据与存储 (万无一失)
        DNS --> DB[(分布式数据库 - 三地五中心)]
      end`,
  ])('normalizes into syntax accepted by Mermaid', async (code) => {
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

    await expect(mermaid.parse(normalizeMermaidCode(code))).resolves.toBeTruthy();
  });
});
