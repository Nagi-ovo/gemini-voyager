import { LAYER_ATTR, type LayerHost, mountLayerHost } from '@/core/ui/layer';
import { createToaster } from '@/core/ui/toast/toaster';
import { getTranslationSync, onCachedLanguageChange } from '@/utils/i18n';

import { getPrimitiveContract } from '../contracts';
import type { Primitive, PrimitiveContext } from '../types';
import { buildIssueUrl } from './issueLink';
import './messages';
import { renderPanel } from './panel';
import { type Picker, startPicker } from './picker';
import { type Probe, collectProbes, runProbes } from './probes';
import {
  type PickedSection,
  type SiteCheckReport,
  buildSiteCheckReport,
  describePick,
  formatSiteCheckMarkdown,
  pluginIds,
  serializeSiteCheckReport,
} from './report';
import { redactRoute } from './route';
import { LAUNCHER_CSS, PANEL_CSS } from './styles';

export type SiteCheckParams = Readonly<Record<string, never>>;

/** Run the check now: what the panel shows and every action exports. */
export function checkPage(
  context: Pick<PrimitiveContext, 'doc' | 'adapter' | 'pluginId' | 'inspectPlugins'>,
  picked: PickedSection | null,
): { report: SiteCheckReport; probes: readonly Probe[] } {
  const { doc, adapter } = context;
  const inspection = context.inspectPlugins?.() ?? null;
  const url = doc.defaultView?.location.href ?? '';
  const probes = collectProbes(adapter, inspection, context.pluginId);
  const conversation = redactRoute(url, adapter).conversation;
  const results = runProbes(probes, { doc, conversation });
  const statuses = inspection?.statuses ?? [];
  const report = buildSiteCheckReport({ url, doc, adapter, results, statuses, picked });
  return { report, probes };
}

function download(doc: Document, report: SiteCheckReport): void {
  const blob = new Blob([serializeSiteCheckReport(report)], {
    type: 'application/json;charset=utf-8',
  });
  const href = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = href;
  anchor.download = `voyager-site-check-${report.site?.id ?? 'page'}.json`;
  anchor.setAttribute(LAYER_ATTR, 'site-check-download');
  doc.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export const siteCheckPrimitive: Primitive<SiteCheckParams> = {
  contract: getPrimitiveContract('siteCheck')!,
  validateParams(raw: unknown) {
    if (raw !== undefined && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) {
      return { success: false, error: [{ path: 'params', message: 'must be an object' }] };
    }
    const keys = Object.keys(raw ?? {});
    return keys.length
      ? {
          success: false,
          error: keys.map((key) => ({ path: `params.${key}`, message: 'unknown parameter' })),
        }
      : { success: true, data: {} };
  },

  activate(scope, _params, context) {
    const { doc } = context;
    const view = doc.defaultView;
    // One launcher per tab: embedded frames (Claude's artifacts) get none.
    if (!view || !doc.body || view.top !== view) return;

    // One ledger entry owns the launcher, the panel, the picker and their listeners.
    scope.effect(() => {
      const toaster = createToaster();
      const launcherLayer = mountLayerHost('popover', LAUNCHER_CSS);
      launcherLayer.host.classList.add('gv-site-check-launcher');
      const launcher = doc.createElement('button');
      launcher.type = 'button';
      launcher.className = 'gv-sc-launcher';
      const dot = doc.createElement('span');
      dot.className = 'gv-sc-dot';
      dot.setAttribute('aria-hidden', 'true');
      const label = doc.createElement('span');
      launcher.append(dot, label);
      launcherLayer.root.append(launcher);
      const relabel = () => {
        label.textContent = getTranslationSync('siteCheckLauncher');
      };
      relabel();
      const stopLanguage = onCachedLanguageChange(relabel);
      context.setTargetCounter(() => (launcher.isConnected ? 1 : 0));

      let panelLayer: LayerHost | null = null;
      let picker: Picker | null = null;
      let picked: PickedSection | null = null;
      let current: { report: SiteCheckReport; probes: readonly Probe[] } | null = null;
      let disposed = false;

      const closePanel = (): void => {
        panelLayer?.remove();
        panelLayer = null;
      };
      const notify = (key: 'siteCheckCopied' | 'siteCheckCopiedForIssue' | 'siteCheckCopyFailed') =>
        toaster.show({
          message: getTranslationSync(key),
          tone: key === 'siteCheckCopyFailed' ? 'error' : 'success',
          durationMs: key === 'siteCheckCopied' ? 2500 : 7000,
          channel: 'site-check',
        });
      const copy = async (report: SiteCheckReport): Promise<boolean> => {
        try {
          await view.navigator.clipboard.writeText(formatSiteCheckMarkdown(report));
          return true;
        } catch {
          notify('siteCheckCopyFailed');
          return false;
        }
      };
      const render = (): void => {
        if (!panelLayer || !current) return;
        const report = current.report;
        const panel = renderPanel(panelLayer.root, doc, report, {
          rerun: () => {
            current = checkPage(context, picked);
            render();
          },
          pick: startPick,
          copy: () => {
            void copy(report).then((ok) => ok && notify('siteCheckCopied'));
          },
          download: () => download(doc, report),
          openIssue: () => {
            void copy(report).then((ok) => {
              if (ok) notify('siteCheckCopiedForIssue');
              view.open(buildIssueUrl(report), '_blank', 'noopener,noreferrer');
            });
          },
          close: () => {
            closePanel();
            launcher.focus({ preventScroll: true });
          },
        });
        panel.querySelector<HTMLButtonElement>('.gv-sc-close')?.focus({ preventScroll: true });
      };
      const stopPick = (): void => {
        picker?.stop();
        picker = null;
      };
      function startPick(): void {
        closePanel();
        // One picker at a time: a second one would orphan the first's capture listeners.
        stopPick();
        const instance: Picker = startPicker({
          doc,
          labels: {
            hint: getTranslationSync('siteCheckPickHint'),
            cancel: getTranslationSync('siteCheckCancel'),
          },
          onPick: (element) => {
            if (picker !== instance || disposed) return;
            picker = null;
            const probes = current?.probes ?? [];
            const ids = pluginIds(probes.map((probe) => probe.source));
            picked = describePick(element, probes, ids);
            openPanel();
          },
          onCancel: () => {
            if (picker !== instance || disposed) return;
            picker = null;
            openPanel();
          },
        });
        picker = instance;
      }
      const openPanel = (): void => {
        if (disposed) return;
        current = checkPage(context, picked);
        panelLayer ??= mountLayerHost('popover', PANEL_CSS);
        panelLayer.host.classList.add('gv-site-check-panel');
        render();
      };

      const listeners = new view.AbortController();
      launcher.addEventListener(
        'click',
        () => {
          // The launcher stays live during a pick; pressing it leaves the pick for the panel.
          if (picker) {
            stopPick();
            openPanel();
            return;
          }
          if (panelLayer) closePanel();
          else openPanel();
        },
        { signal: listeners.signal },
      );
      doc.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'Escape' || !panelLayer || picker || event.defaultPrevented) return;
          closePanel();
          launcher.focus({ preventScroll: true });
        },
        { signal: listeners.signal },
      );
      const stopPanelLanguage = onCachedLanguageChange(render);

      return () => {
        disposed = true;
        listeners.abort();
        stopLanguage();
        stopPanelLanguage();
        stopPick();
        closePanel();
        launcherLayer.remove();
        toaster.destroy();
      };
    }, 'site-check');
    return { updateSettings() {} };
  },
};
