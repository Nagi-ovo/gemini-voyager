import React, { useEffect, useState } from 'react';

import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Slider } from '../../../components/ui/slider';

import { StorageKeys } from '@/core/types/common';

/**
 * SidebarWidth popup 组件
 * - 默认值 400px，范围 200 - 800（可按需调整）
 * - 保存到 chrome.storage.sync（并发送 runtime message: {type: 'gv_sidebar_width_changed', width: number}）
 */

const DEFAULT = 308; // Gemini 默认侧边栏宽度
const MIN = 200;
const MAX = 800;
const STEP = 10;

export default function SidebarWidth() {
  const [value, setValue] = useState<number>(DEFAULT);

  useEffect(() => {
    let mounted = true;
    const g: any = globalThis as any;

    // 读取 storage
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get([StorageKeys.SIDEBAR_WIDTH], (res: any) => {
          if (!mounted) return;
          const v = res && res[StorageKeys.SIDEBAR_WIDTH];
          setValue(typeof v === 'number' && !isNaN(v) ? v : DEFAULT);
        });
      } else if (typeof g.browser !== 'undefined' && g.browser.storage && g.browser.storage.local) {
        g.browser.storage.local.get([StorageKeys.SIDEBAR_WIDTH]).then((res: any) => {
          if (!mounted) return;
          const v = res && res[StorageKeys.SIDEBAR_WIDTH];
          setValue(typeof v === 'number' && !isNaN(v) ? v : DEFAULT);
        });
      } else {
        const raw = localStorage.getItem(StorageKeys.SIDEBAR_WIDTH);
        setValue(raw ? Number(raw) : DEFAULT);
      }
    } catch (e) {
      const raw = localStorage.getItem(StorageKeys.SIDEBAR_WIDTH);
      setValue(raw ? Number(raw) : DEFAULT);
    }

    return () => {
      mounted = false;
    };
  }, []);

  function commit(val: number) {
    const g: any = globalThis as any;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set({ [StorageKeys.SIDEBAR_WIDTH]: val });
        try {
          chrome.runtime.sendMessage({ type: 'gv_sidebar_width_changed', width: val });
        } catch (e) {
          // ignore
        }
      } else if (typeof g.browser !== 'undefined' && g.browser.storage && g.browser.storage.local) {
        g.browser.storage.local.set({ [StorageKeys.SIDEBAR_WIDTH]: val });
        try {
          g.browser.runtime.sendMessage({ type: 'gv_sidebar_width_changed', width: val });
        } catch (e) {
          // ignore
        }
      } else {
        localStorage.setItem(StorageKeys.SIDEBAR_WIDTH, String(val));
      }
    } catch (e) {
      localStorage.setItem(StorageKeys.SIDEBAR_WIDTH, String(val));
    }
  }

  return (
    <Card className="p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <CardTitle className="text-xs uppercase">SIDEBAR WIDTH</CardTitle>
        <span className="text-sm font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md shadow-sm">
          {value}px
        </span>
      </div>
      <CardContent className="p-0">
        <div className="px-1">
          <Slider
            min={MIN}
            max={MAX}
            step={STEP}
            value={value}
            onValueChange={(v: number) => setValue(v)}
            onValueCommit={(v: number) => commit(v)}
          />
          <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground font-medium">
            <span>Narrow</span>
            <span>Wide</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}