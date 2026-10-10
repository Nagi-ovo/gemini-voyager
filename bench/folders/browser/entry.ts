/**
 * Browser page entry. `run.ts` serves this bundle with `public/contentStyle.css`
 * and calls `window.__folderBench.run(options)` over the DevTools protocol.
 */
import './timing';
import '../stubs/install';
import { runDataBenchmarks } from '../dataCases';
import { DATASETS, type DatasetName, generateFolderData, summarize } from '../datasets';
import type { BenchResult } from '../stats';
import { installExtensionApiStub } from '../stubs/extensionApi';
import {
  type RunCounts,
  benchChatGptPicker,
  benchChatGptSection,
  benchFloatingTree,
  benchGeminiSidebar,
  benchHideFiledStyle,
} from './surfaces';
import { countLongTasksDuring, longTasksSupported } from './timing';

export interface BrowserBenchOptions {
  readonly datasets: readonly DatasetName[];
  readonly runScale: number;
  /** Skip the data cases here (they also run in node). */
  readonly skipData?: boolean;
}

const BASE_COUNTS: Record<DatasetName, RunCounts> = {
  normal: { mount: 15, interaction: 20 },
  duplicates: { mount: 10, interaction: 15 },
  deepLegacy: { mount: 10, interaction: 15 },
  large: { mount: 5, interaction: 8 },
};

function scaled(counts: RunCounts, scale: number): RunCounts {
  return {
    mount: Math.max(3, Math.round(counts.mount * scale)),
    interaction: Math.max(3, Math.round(counts.interaction * scale)),
  };
}

async function run(options: BrowserBenchOptions) {
  installExtensionApiStub();
  const results: BenchResult[] = [];
  const progress: string[] = [];
  const datasets = options.datasets.map((name) => {
    const data = generateFolderData(DATASETS[name]);
    return { name, data, summary: summarize(name, data) };
  });
  for (const { name, data } of datasets) {
    const counts = scaled(BASE_COUNTS[name], options.runScale);
    progress.push(`${name}: gemini sidebar`);
    results.push(...(await benchGeminiSidebar(name, data, counts)));
    progress.push(`${name}: floating panel`);
    results.push(...(await benchFloatingTree(name, data, counts)));
    progress.push(`${name}: chatgpt section`);
    results.push(...(await benchChatGptSection(name, data, counts)));
    const chatgptData = generateFolderData(DATASETS[name], 'chatgpt');
    progress.push(`${name}: chatgpt picker`);
    results.push(...(await benchChatGptPicker(name, chatgptData, counts)));
    progress.push(`${name}: hide-filed style`);
    results.push(...(await benchHideFiledStyle(name, chatgptData, counts)));
  }
  if (!options.skipData) {
    progress.push('data cases');
    const data = await runDataBenchmarks({
      datasets: options.datasets,
      runScale: options.runScale,
      countLongTasks: countLongTasksDuring,
    });
    results.push(...data.map((result) => ({ ...result, surface: 'data (chrome)' })));
  }
  return {
    userAgent: navigator.userAgent,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    longTasksSupported,
    datasets: datasets.map(({ summary }) => summary),
    progress,
    results,
  };
}

declare global {
  interface Window {
    __folderBench: { run: typeof run };
  }
}

window.__folderBench = { run };
