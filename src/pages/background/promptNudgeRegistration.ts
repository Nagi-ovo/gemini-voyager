import browser from 'webextension-polyfill';

import { computeNudgeDomains, normalizeIconResourcePath } from '@/features/plugins/promptNudge';

const CUSTOM_WEBSITE_KEY = 'gvPromptCustomWebsites';

export function createPromptNudgeRegistration(getPluginSiteDomains: () => Set<string>) {
  // --- Prompt Manager discovery nudge (Chrome/Edge only) ----------------------
  // On plugin-capable third-party sites (ChatGPT / Claude) Voyager has no host
  // access until the user turns the Prompt Manager on, so it stays at "No access
  // needed" and cannot run any code on the page. To still hint that Voyager
  // supports the site, paint a small dot on the toolbar icon while the user is on
  // such a site and has not enabled it yet. declarativeContent matches the URL
  // inside Chrome (no host permission, preserves "No access needed") and only
  // exposes SetIcon (no badge action), so the dot is baked into the icon via
  // OffscreenCanvas. chrome.declarativeContent is absent on Firefox/Safari, where
  // this whole feature safely no-ops.
  // Chrome cannot pin the icon; unpinned users see this dot only in the extensions menu.
  const NUDGE_ICON_SIZES = [16, 32] as const;
  const NUDGE_DOT_COLOR = '#e5484d';
  let cachedNudgeIcon: { [size: string]: ImageData } | null = null;

  function collectBaseIconCandidates(): string[] {
    const manifest = chrome.runtime.getManifest() as {
      action?: { default_icon?: string | { [key: string]: string } };
      icons?: { [key: string]: string };
    };
    const candidates = new Set<string>();
    const actionIcon = manifest.action?.default_icon;
    if (typeof actionIcon === 'string') {
      candidates.add(normalizeIconResourcePath(actionIcon));
    } else if (actionIcon) {
      for (const value of Object.values(actionIcon)) {
        candidates.add(normalizeIconResourcePath(value));
      }
    }
    if (manifest.icons) {
      for (const value of Object.values(manifest.icons)) {
        candidates.add(normalizeIconResourcePath(value));
      }
    }
    return Array.from(candidates);
  }

  async function loadBaseIconBitmap(): Promise<ImageBitmap | null> {
    for (const candidate of collectBaseIconCandidates()) {
      try {
        const response = await fetch(chrome.runtime.getURL(candidate));
        if (!response.ok) continue;
        return await createImageBitmap(await response.blob());
      } catch {
        // Try the next candidate.
      }
    }
    return null;
  }

  async function buildNudgeIcon(): Promise<{ [size: string]: ImageData } | null> {
    if (cachedNudgeIcon) return cachedNudgeIcon;
    if (typeof OffscreenCanvas === 'undefined') return null;
    const bitmap = await loadBaseIconBitmap();
    if (!bitmap) return null;

    const icon: { [size: string]: ImageData } = {};
    for (const size of NUDGE_ICON_SIZES) {
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return null;
      }
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(bitmap, 0, 0, size, size);

      const radius = size * 0.24;
      const cx = size - radius - size * 0.04;
      const cy = radius + size * 0.04;
      // White ring keeps the dot legible on any icon background.
      ctx.beginPath();
      ctx.arc(cx, cy, radius + Math.max(1, size * 0.06), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = NUDGE_DOT_COLOR;
      ctx.fill();

      icon[String(size)] = ctx.getImageData(0, 0, size, size);
    }
    bitmap.close();
    cachedNudgeIcon = icon;
    return icon;
  }

  async function getEnabledCustomWebsites(): Promise<Set<string>> {
    try {
      const stored = await browser.storage.sync.get({ [CUSTOM_WEBSITE_KEY]: [] });
      const value = stored[CUSTOM_WEBSITE_KEY];
      if (!Array.isArray(value)) return new Set();
      return new Set(value.map((domain) => String(domain).toLowerCase()));
    } catch {
      return new Set();
    }
  }

  async function syncPromptNudgeIcon(): Promise<void> {
    if (!chrome.declarativeContent?.onPageChanged) return;

    const removeAll = () =>
      new Promise<void>((resolve) => {
        chrome.declarativeContent.onPageChanged.removeRules(undefined, () => resolve());
      });

    try {
      const enabled = await getEnabledCustomWebsites();
      const nudgeDomains = computeNudgeDomains(getPluginSiteDomains(), enabled);

      await removeAll();
      if (nudgeDomains.length === 0) return;

      const icon = await buildNudgeIcon();
      if (!icon) return;

      const conditions = nudgeDomains.flatMap((domain) => [
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostEquals: domain, schemes: ['https'] },
        }),
        new chrome.declarativeContent.PageStateMatcher({
          pageUrl: { hostSuffix: `.${domain}`, schemes: ['https'] },
        }),
      ]);

      chrome.declarativeContent.onPageChanged.addRules([
        {
          conditions,
          actions: [new chrome.declarativeContent.SetIcon({ imageData: icon })],
        },
      ]);
    } catch (error) {
      console.warn('[Background] Failed to sync Prompt Manager nudge icon:', error);
    }
  }

  return { sync: syncPromptNudgeIcon };
}
