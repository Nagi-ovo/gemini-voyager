/* Prompt Manager content module
 * - Injects a floating trigger button using the extension icon
 * - Opens a small anchored panel above the trigger (default)
 * - Panel supports: i18n language switch, add prompt, tag chips, search, copy, import/export
 * - Optional lock to pin panel position; when locked, panel is draggable and persisted
 */

import DOMPurify from 'dompurify';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';

type PromptItem = {
  id: string;
  text: string;
  tags: string[];
  createdAt: number;
  updatedAt?: number;
};

type PanelPosition = { top: number; left: number };
type TriggerPosition = { bottom: number; right: number };

const STORAGE_KEYS = {
  items: 'gvPromptItems',
  locked: 'gvPromptPanelLocked',
  position: 'gvPromptPanelPosition',
  triggerPos: 'gvPromptTriggerPosition',
  language: 'language', // reuse global language key
} as const;

const ID = {
  trigger: 'gv-pm-trigger',
  panel: 'gv-pm-panel',
} as const;

function getRuntimeUrl(path: string): string {
  try {
    return (window as any).chrome?.runtime?.getURL?.(path) || path;
  } catch {
    return path;
  }
}

function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    const v = JSON.parse(raw);
    return v as T;
  } catch {
    return fallback;
  }
}

function normalizeLang(lang: string | undefined): 'en' | 'zh' {
  return lang && lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

// Minimal i18n util (reads same JSON dictionaries used by popup/options)
let dictionaries: Record<'en' | 'zh', Record<string, string>> | null = null;
async function loadDictionaries(): Promise<void> {
  if (dictionaries) return;
  try {
    // Dynamic import to avoid bundling issues if JSON module typing varies
    const enRaw: any = await import(/* @vite-ignore */ '../../../locales/en/messages.json');
    const zhRaw: any = await import(/* @vite-ignore */ '../../../locales/zh/messages.json');
    const extract = (raw: any): Record<string, string> => {
      const out: Record<string, string> = {};
      if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach((k) => {
          const v = (raw as any)[k];
          if (v && typeof v.message === 'string') out[k] = v.message;
        });
      }
      return out;
    };
    dictionaries = { en: extract(enRaw), zh: extract(zhRaw) } as any;
  } catch {
    dictionaries = { en: {}, zh: {} } as any;
  }
}

async function getLanguage(): Promise<'en' | 'zh'> {
  try {
    const stored = await new Promise<any>((resolve) => {
      try {
        (window as any).chrome?.storage?.sync?.get?.(STORAGE_KEYS.language, resolve);
      } catch {
        resolve({});
      }
    });
    const v = typeof stored?.[STORAGE_KEYS.language] === 'string' ? stored[STORAGE_KEYS.language] : undefined;
    return normalizeLang(v || (navigator.language || 'en'));
  } catch {
    return 'en';
  }
}

async function setLanguage(lang: 'en' | 'zh'): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      (window as any).chrome?.storage?.sync?.set?.({ [STORAGE_KEYS.language]: lang }, () => resolve());
    });
  } catch {}
}

function createI18n(tables: Record<'en' | 'zh', Record<string, string>>, lang: 'en' | 'zh') {
  let current = lang;
  return {
    t: (key: string): string => tables[current]?.[key] ?? tables.en?.[key] ?? key,
    set: (l: 'en' | 'zh') => {
      current = l;
    },
    get: (): 'en' | 'zh' => current,
  };
}

function uid(): string {
  // FNV-1a-ish hash over timestamp + rand
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

async function readStorage<T>(key: string, fallback: T): Promise<T> {
  return await new Promise<T>((resolve) => {
    try {
      (window as any).chrome?.storage?.sync?.get?.(key, (res: any) => {
        if (res && key in res) return resolve(res[key] as T);
        resolve(fallback);
      });
    } catch {
      resolve(fallback);
    }
  });
}

async function writeStorage<T>(key: string, value: T): Promise<void> {
  return await new Promise<void>((resolve) => {
    try {
      (window as any).chrome?.storage?.sync?.set?.({ [key]: value }, () => resolve());
    } catch {
      resolve();
    }
  });
}

function createEl<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function elFromHTML(html: string): HTMLElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild as HTMLElement;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function collectAllTags(items: PromptItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) for (const t of it.tags || []) set.add(String(t).toLowerCase());
  return Array.from(set).sort();
}

function copyText(text: string): Promise<void> {
  try {
    return navigator.clipboard.writeText(text);
  } catch {
    return new Promise<void>((resolve) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {}
      ta.remove();
      resolve();
    });
  }
}

function computeAnchoredPosition(trigger: HTMLElement, panel: HTMLElement): { top: number; left: number } {
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const pad = 8;
  const panelW = Math.min(380, Math.max(300, panel.getBoundingClientRect().width || 320));
  const tentativeLeft = Math.min(vw - panelW - pad, Math.max(pad, rect.left + rect.width - panelW));
  const top = Math.max(pad, rect.top - (panel.getBoundingClientRect().height || 360) - 10);
  return { top, left: Math.round(tentativeLeft) };
}

export async function startPromptManager(): Promise<void> {
  try {
    // markdown config: respect single newlines as <br> and KaTeX inline/display math
    try {
      marked.use(markedKatex({
        throwOnError: false,
        output: 'html',
      } as any));
      marked.setOptions({ breaks: true });
    } catch {}
    await loadDictionaries();
    const lang = await getLanguage();
    const i18n = createI18n(dictionaries as any, lang);

    // Prevent duplicate injection
    if (document.getElementById(ID.trigger)) return;

    // Trigger button
    const trigger = createEl('button', 'gv-pm-trigger');
    trigger.id = ID.trigger;
    trigger.setAttribute('aria-label', 'Prompt Manager');
    const img = document.createElement('img');
    img.width = 24;
    img.height = 24;
    img.alt = 'pm';
    img.src = getRuntimeUrl('icon-32.png');
    img.addEventListener('error', () => {
      // dev fallback
      const devUrl = getRuntimeUrl('icon-32.png');
      if (img.src !== devUrl) img.src = devUrl;
    }, { once: true });
    trigger.appendChild(img);
    document.body.appendChild(trigger);
    // Helper: place trigger near a target element (e.g. Gemini FAB touch target)
    function placeTriggerNextToHost(): void {
      try {
        const candidates = Array.from(document.querySelectorAll('span.mat-mdc-button-touch-target')) as HTMLElement[];
        if (!candidates.length) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pick = candidates
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter((x) => x.r.width > 0 && x.r.height > 0)
          // choose the element closest to bottom-right corner
          .sort((a, b) => (a.r.bottom + a.r.right) - (b.r.bottom + b.r.right))
          .reduce((_, x) => x, undefined as any) as { el: HTMLElement; r: DOMRect } | undefined;
        if (!pick) return;
        const r = pick.r;
        const tw = (trigger.getBoundingClientRect().width || 36);
        const th = (trigger.getBoundingClientRect().height || 36);
        const gap = 10;
        const right = Math.max(6, Math.round(vw - r.left + gap));
        const bottom = Math.max(6, Math.round(vh - (r.top + r.height / 2 + th / 2)));
        trigger.style.right = `${right}px`;
        trigger.style.bottom = `${bottom}px`;
      } catch {}
    }

    // Restore trigger position if saved; otherwise place next to host button
    try {
      const pos = await readStorage<TriggerPosition | null>(STORAGE_KEYS.triggerPos, null);
      if (pos && Number.isFinite(pos.bottom) && Number.isFinite(pos.right)) {
        trigger.style.bottom = `${Math.max(6, Math.round(pos.bottom))}px`;
        trigger.style.right = `${Math.max(6, Math.round(pos.right))}px`;
      } else {
        // defer a bit to wait for host DOM
        placeTriggerNextToHost();
        requestAnimationFrame(placeTriggerNextToHost);
        window.setTimeout(placeTriggerNextToHost, 350);
      }
    } catch { placeTriggerNextToHost(); }

    // Panel root
    const panel = createEl('div', 'gv-pm-panel gv-hidden');
    panel.id = ID.panel;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    document.body.appendChild(panel);

    // Build panel DOM
    const header = createEl('div', 'gv-pm-header');
    const dragHandle = createEl('div', 'gv-pm-drag');
    const title = createEl('div', 'gv-pm-title');
    title.textContent = i18n.t('pm_title') || 'Prompt Manager';
    const controls = createEl('div', 'gv-pm-controls');

    const langSel = createEl('select', 'gv-pm-lang');
    const optEn = createEl('option');
    optEn.value = 'en';
    optEn.textContent = 'English';
    const optZh = createEl('option');
    optZh.value = 'zh';
    optZh.textContent = '中文';
    langSel.appendChild(optEn);
    langSel.appendChild(optZh);
    langSel.value = i18n.get();

    const lockBtn = createEl('button', 'gv-pm-lock');
    lockBtn.setAttribute('aria-pressed', 'false');
    lockBtn.setAttribute('data-icon', '🔓');
    lockBtn.title = i18n.t('pm_lock');

    const addBtn = createEl('button', 'gv-pm-add');
    addBtn.textContent = i18n.t('pm_add');

    controls.appendChild(langSel);
    controls.appendChild(addBtn);
    controls.appendChild(lockBtn);
    header.appendChild(dragHandle);
    header.appendChild(title);
    header.appendChild(controls);

    const searchWrap = createEl('div', 'gv-pm-search');
    const searchInput = createEl('input') as HTMLInputElement;
    searchInput.type = 'search';
    searchInput.placeholder = i18n.t('pm_search_placeholder');
    searchWrap.appendChild(searchInput);

    const tagsWrap = createEl('div', 'gv-pm-tags');

    const list = createEl('div', 'gv-pm-list');

    const footer = createEl('div', 'gv-pm-footer');
    const importInput = createEl('input') as HTMLInputElement;
    importInput.type = 'file';
    importInput.accept = '.json,application/json';
    importInput.className = 'gv-pm-import-input';
    const importBtn = createEl('button', 'gv-pm-import-btn');
    importBtn.textContent = i18n.t('pm_import');
    const exportBtn = createEl('button', 'gv-pm-export-btn');
    exportBtn.textContent = i18n.t('pm_export');
    const notice = createEl('div', 'gv-pm-notice');
    footer.appendChild(importBtn);
    footer.appendChild(exportBtn);
    const gh = document.createElement('a');
    gh.className = 'gv-pm-gh';
    gh.href = 'https://github.com/Nagi-ovo/gemini-voyager';
    gh.target = '_blank';
    gh.rel = 'noreferrer';
    gh.title = i18n.t('starProject') || 'Support the project';
    // Put notice before GitHub button so GH stays at the far right
    footer.appendChild(notice);
    footer.appendChild(gh);
    footer.appendChild(importInput);

    const addForm = elFromHTML(
      `<form class="gv-pm-add-form gv-hidden">
        <textarea class="gv-pm-input-text" placeholder="${escapeHtml(
          i18n.t('pm_prompt_placeholder') || 'Prompt text'
        )}" rows="3"></textarea>
        <input class="gv-pm-input-tags" type="text" placeholder="${escapeHtml(
          i18n.t('pm_tags_placeholder') || 'Tags (comma separated)'
        )}" />
        <div class="gv-pm-add-actions">
          <span class="gv-pm-inline-hint" aria-live="polite"></span>
          <button type="submit" class="gv-pm-save">${escapeHtml(i18n.t('pm_save') || 'Save')}</button>
          <button type="button" class="gv-pm-cancel">${escapeHtml(
            i18n.t('pm_cancel') || 'Cancel'
          )}</button>
        </div>
      </form>`
    );

    panel.appendChild(header);
    panel.appendChild(searchWrap);
    panel.appendChild(tagsWrap);
    panel.appendChild(addForm);
    panel.appendChild(list);
    panel.appendChild(footer);

    // State
    let items: PromptItem[] = await readStorage<PromptItem[]>(STORAGE_KEYS.items, []);
    let open = false;
    let selectedTags: Set<string> = new Set<string>();
    let locked = !!(await readStorage<boolean>(STORAGE_KEYS.locked, false));
    let savedPos = await readStorage<PanelPosition | null>(STORAGE_KEYS.position, null);
    let dragging = false;
    let dragStart = { x: 0, y: 0 };
    let dragOffset = { x: 0, y: 0 };
    let draggingTrigger = false;
    let editingId: string | null = null;

    function setNotice(text: string, kind: 'ok' | 'err' = 'ok') {
      notice.textContent = text || '';
      notice.classList.toggle('ok', kind === 'ok');
      notice.classList.toggle('err', kind === 'err');
      if (text) {
        window.setTimeout(() => {
          if (notice.textContent === text) notice.textContent = '';
        }, 1800);
      }
    }

    function setInlineHint(text: string, kind: 'ok' | 'err' = 'err'): void {
      const hint = addForm.querySelector('.gv-pm-inline-hint') as HTMLSpanElement | null;
      if (!hint) return;
      hint.textContent = text || '';
      hint.classList.toggle('ok', kind === 'ok');
      hint.classList.toggle('err', kind === 'err');
    }

    function renderTags(): void {
      const all = collectAllTags(items);
      tagsWrap.innerHTML = '';
      const allBtn = createEl('button', 'gv-pm-tag');
      allBtn.textContent = i18n.t('pm_all_tags') || 'All';
      allBtn.classList.toggle('active', selectedTags.size === 0);
      allBtn.addEventListener('click', () => {
        selectedTags = new Set();
        renderTags();
        renderList();
      });
      tagsWrap.appendChild(allBtn);
      for (const tag of all) {
        const btn = createEl('button', 'gv-pm-tag');
        btn.textContent = tag;
        btn.classList.toggle('active', selectedTags.has(tag));
        btn.addEventListener('click', () => {
          if (selectedTags.has(tag)) selectedTags.delete(tag);
          else selectedTags.add(tag);
          renderTags();
          renderList();
        });
        tagsWrap.appendChild(btn);
      }
    }

    function renderList(): void {
      const q = (searchInput.value || '').trim().toLowerCase();
      const selectedTagList = Array.from(selectedTags);
      const filtered = items.filter((it) => {
        const okTag = selectedTagList.length === 0 || selectedTagList.every((t) => it.tags.includes(t));
        if (!okTag) return false;
        if (!q) return true;
        return it.text.toLowerCase().includes(q) || it.tags.some((t) => t.includes(q));
      });
      list.innerHTML = '';
      if (filtered.length === 0) {
        const empty = createEl('div', 'gv-pm-empty');
        empty.textContent = i18n.t('pm_empty') || 'No prompts yet';
        list.appendChild(empty);
        return;
      }
      const frag = document.createDocumentFragment();
      for (const it of filtered) {
        const row = createEl('div', 'gv-pm-item');
        const textBtn = createEl('button', 'gv-pm-item-text');
        // Render Markdown + KaTeX preview (sanitized)
        const md = document.createElement('div');
        md.className = 'gv-md';
        try {
          const out = marked.parse(it.text as string);
          if (typeof out === 'string') {
            md.innerHTML = DOMPurify.sanitize(out);
          } else {
            out.then((html) => { md.innerHTML = DOMPurify.sanitize(html); }).catch(() => { md.textContent = it.text; });
          }
        } catch {
          md.textContent = it.text;
        }
        textBtn.appendChild(md);
        textBtn.title = i18n.t('pm_copy') || 'Copy';
        textBtn.addEventListener('click', async () => {
          await copyText(it.text);
          setNotice(i18n.t('pm_copied') || 'Copied', 'ok');
        });
        // Edit button
        const editBtn = createEl('button', 'gv-pm-edit');
        editBtn.setAttribute('aria-label', i18n.t('pm_edit') || 'Edit');
        //editBtn.textContent = '✏️';
        editBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          // Start inline edit using the add form fields
          (addForm.querySelector('.gv-pm-input-text') as HTMLTextAreaElement).value = it.text;
          (addForm.querySelector('.gv-pm-input-tags') as HTMLInputElement).value = (it.tags || []).join(', ');
          addForm.classList.remove('gv-hidden');
          (addForm.querySelector('.gv-pm-input-text') as HTMLTextAreaElement).focus();
          editingId = it.id;
        });
        const bottom = createEl('div', 'gv-pm-bottom');
        const meta = createEl('div', 'gv-pm-item-meta');
        for (const t of it.tags) {
          const chip = createEl('span', 'gv-pm-chip');
          chip.textContent = t;
          chip.addEventListener('click', () => {
            if (selectedTags.has(t)) selectedTags.delete(t);
            else selectedTags.add(t);
            renderTags();
            renderList();
          });
          meta.appendChild(chip);
        }
        // Actions container at row bottom-right
        const actions = createEl('div', 'gv-pm-actions');
        const del = createEl('button', 'gv-pm-del');
        del.title = i18n.t('pm_delete') || 'Delete';
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          // inline confirm popover (floating)
          if (document.body.querySelector('.gv-pm-confirm')) return; // one at a time
          const pop = document.createElement('div');
          pop.className = 'gv-pm-confirm';
          const msg = document.createElement('span');
          msg.textContent = i18n.t('pm_delete_confirm') || 'Delete this prompt?';
          const yes = document.createElement('button');
          yes.className = 'gv-pm-confirm-yes';
          yes.textContent = i18n.t('pm_delete') || 'Delete';
          const no = document.createElement('button');
          no.textContent = i18n.t('pm_cancel') || 'Cancel';
          pop.appendChild(msg);
          pop.appendChild(yes);
          pop.appendChild(no);
          document.body.appendChild(pop);
          // position near button
          const r = del.getBoundingClientRect();
          const vw = window.innerWidth;
          const side: 'left' | 'right' = r.right + 220 > vw ? 'left' : 'right';
          const top = Math.max(8, r.top + window.scrollY - 6);
          const left = side === 'right' ? r.right + window.scrollX + 10 : r.left + window.scrollX - pop.offsetWidth - 10;
          pop.style.top = `${Math.round(top)}px`;
          pop.style.left = `${Math.round(Math.max(8, left))}px`;
          pop.setAttribute('data-side', side);
          const cleanup = () => { try { pop.remove(); } catch {} window.removeEventListener('keydown', onKey); window.removeEventListener('click', onOutside, true); };
          const onOutside = (ev: MouseEvent) => { const t = ev.target as HTMLElement; if (!t.closest('.gv-pm-confirm')) cleanup(); };
          const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') cleanup(); };
          window.addEventListener('click', onOutside, true);
          window.addEventListener('keydown', onKey, { passive: true } as any);
          no.addEventListener('click', (ev) => { ev.stopPropagation(); cleanup(); });
          yes.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            items = items.filter((x) => x.id !== it.id);
            await writeStorage(STORAGE_KEYS.items, items);
            cleanup();
            renderTags();
            renderList();
            setNotice(i18n.t('pm_deleted') || 'Deleted', 'ok');
          });
        });
        row.appendChild(textBtn);
        actions.appendChild(editBtn);
        actions.appendChild(del);
        bottom.appendChild(meta);
        bottom.appendChild(actions);
        row.appendChild(bottom);
        frag.appendChild(row);
      }
      list.appendChild(frag);
      // KaTeX rendered during Markdown step, no post-typeset needed
    }

    function openPanel(): void {
      open = true;
      panel.classList.remove('gv-hidden');
      if (locked && savedPos) {
        panel.style.left = `${Math.round(savedPos.left)}px`;
        panel.style.top = `${Math.round(savedPos.top)}px`;
      } else {
        // measure after making visible
        const pos = computeAnchoredPosition(trigger, panel);
        panel.style.left = `${pos.left}px`;
        panel.style.top = `${pos.top}px`;
      }
    }

    function closePanel(): void {
      open = false;
      panel.classList.add('gv-hidden');
    }

    function applyLockUI(): void {
      lockBtn.classList.toggle('active', locked);
      lockBtn.setAttribute('aria-pressed', locked ? 'true' : 'false');
      // When locked, show 🔒; when unlocked, show 🔓.
      lockBtn.setAttribute('data-icon', locked ? '🔒' : '🔓');
      lockBtn.title = locked ? (i18n.t('pm_unlock') || 'Unlock') : (i18n.t('pm_lock') || 'Lock');
      panel.classList.toggle('gv-locked', locked);
    }

    function refreshUITexts(): void {
      title.textContent = i18n.t('pm_title') || 'Prompt Manager';
      addBtn.textContent = i18n.t('pm_add') || 'Add';
      searchInput.placeholder = i18n.t('pm_search_placeholder') || 'Search prompts';
      importBtn.textContent = i18n.t('pm_import') || 'Import';
      exportBtn.textContent = i18n.t('pm_export') || 'Export';
      try {
        const ghEl = footer.querySelector('.gv-pm-gh') as HTMLAnchorElement | null;
        if (ghEl) ghEl.title = i18n.t('starProject') || 'Support the project';
      } catch {}
      (addForm.querySelector('.gv-pm-input-text') as HTMLTextAreaElement).placeholder =
        i18n.t('pm_prompt_placeholder') || 'Prompt text';
      (addForm.querySelector('.gv-pm-input-tags') as HTMLInputElement).placeholder =
        i18n.t('pm_tags_placeholder') || 'Tags (comma separated)';
      (addForm.querySelector('.gv-pm-save') as HTMLButtonElement).textContent =
        i18n.t('pm_save') || 'Save';
      (addForm.querySelector('.gv-pm-cancel') as HTMLButtonElement).textContent =
        i18n.t('pm_cancel') || 'Cancel';
      applyLockUI();
      renderTags();
      renderList();
    }

    function onReposition(): void {
      if (!open) return;
      if (locked) return;
      const pos = computeAnchoredPosition(trigger, panel);
      panel.style.left = `${pos.left}px`;
      panel.style.top = `${pos.top}px`;
    }

    function beginDrag(ev: PointerEvent): void {
      if (locked) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      dragOffset = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      dragStart = { x: ev.clientX, y: ev.clientY };
      try {
        panel.setPointerCapture?.(ev.pointerId);
      } catch {}
    }

    async function endDrag(_ev: PointerEvent): Promise<void> {
      if (!dragging) return;
      dragging = false;
      const rect = panel.getBoundingClientRect();
      savedPos = { left: rect.left, top: rect.top };
      await writeStorage(STORAGE_KEYS.position, savedPos);
    }

    function onDragMove(ev: PointerEvent): void {
      if (dragging) {
        const x = ev.clientX - dragOffset.x;
        const y = ev.clientY - dragOffset.y;
        panel.style.left = `${Math.round(x)}px`;
        panel.style.top = `${Math.round(y)}px`;
      } else if (draggingTrigger) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = trigger.getBoundingClientRect();
        const w = rect.width || 36;
        const h = rect.height || 36;
        const right = Math.max(6, Math.min(vw - 6 - w, vw - ev.clientX - w / 2));
        const bottom = Math.max(6, Math.min(vh - 6 - h, vh - ev.clientY - h / 2));
        trigger.style.right = `${Math.round(right)}px`;
        trigger.style.bottom = `${Math.round(bottom)}px`;
      }
    }

    // Events
    trigger.addEventListener('click', () => {
      if (open) closePanel();
      else {
        openPanel();
        renderTags();
        renderList();
      }
    });
    window.addEventListener('resize', onReposition, { passive: true });
    window.addEventListener('scroll', onReposition, { passive: true });

    // Close when clicking outside of the manager (panel/trigger/confirm are exceptions)
    window.addEventListener(
      'pointerdown',
      (ev: PointerEvent) => {
        if (!open) return;
        const target = ev.target as HTMLElement | null;
        if (!target) return;
        if (target.closest(`#${ID.panel}`)) return;
        if (target.closest(`#${ID.trigger}`)) return;
        if (target.closest('.gv-pm-confirm')) return;
        closePanel();
      },
      { capture: true }
    );
    // Close on Escape
    window.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (!open) return;
      if (ev.key === 'Escape') closePanel();
    }, { passive: true } as any);

    lockBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      locked = !locked;
      await writeStorage(STORAGE_KEYS.locked, locked);
      applyLockUI();
      try { (ev.currentTarget as HTMLButtonElement)?.blur?.(); } catch {}
      if (locked) {
        const rect = panel.getBoundingClientRect();
        savedPos = { left: rect.left, top: rect.top };
        await writeStorage(STORAGE_KEYS.position, savedPos);
      } else {
        onReposition();
      }
    });
    panel.addEventListener('pointerdown', (ev: PointerEvent) => {
      const target = ev.target as HTMLElement;
      if (target.closest('.gv-pm-drag')) beginDrag(ev);
    });
    window.addEventListener('pointermove', onDragMove, { passive: true });
    window.addEventListener('pointerup', endDrag, { passive: true });

    // Trigger drag (always draggable)
    trigger.addEventListener('pointerdown', (ev: PointerEvent) => {
      if (typeof ev.button === 'number' && ev.button !== 0) return;
      draggingTrigger = true;
      try { trigger.setPointerCapture?.(ev.pointerId); } catch {}
    });
    window.addEventListener('pointerup', async () => {
      if (draggingTrigger) {
        draggingTrigger = false;
        const r = parseFloat((trigger.style.right || '').replace('px', '')) || 18;
        const b = parseFloat((trigger.style.bottom || '').replace('px', '')) || 18;
        await writeStorage(STORAGE_KEYS.triggerPos, { right: r, bottom: b });
      }
    }, { passive: true });

    langSel.addEventListener('change', async () => {
      const next = normalizeLang(langSel.value) as 'en' | 'zh';
      i18n.set(next);
      await setLanguage(next);
      refreshUITexts();
    });

    // Listen to external language changes (popup/options)
    try {
      chrome.storage?.onChanged?.addListener((changes: any, area: string) => {
        if (area !== 'sync') return;
        if (changes?.language) {
          const next = normalizeLang(changes.language.newValue);
          i18n.set(next);
          try { langSel.value = next; } catch {}
          refreshUITexts();
        }
      });
    } catch {}

    addBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      editingId = null;
      addForm.classList.remove('gv-hidden');
      (addForm.querySelector('.gv-pm-input-text') as HTMLTextAreaElement)?.focus();
    });
    (addForm.querySelector('.gv-pm-cancel') as HTMLButtonElement).addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      editingId = null;
      addForm.classList.add('gv-hidden');
    });
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = (addForm.querySelector('.gv-pm-input-text') as HTMLTextAreaElement).value.trim();
      const tagsRaw = (addForm.querySelector('.gv-pm-input-tags') as HTMLInputElement).value;
      const tags = dedupeTags((tagsRaw || '').split(',').map((s) => s.trim()));
      if (!text) return;
      if (editingId) {
        const dup = items.some((x) => x.id !== editingId && x.text.trim().toLowerCase() === text.toLowerCase());
        if (dup) {
          setInlineHint(i18n.t('pm_duplicate') || 'Duplicate prompt', 'err');
          return;
        }
        const target = items.find((x) => x.id === editingId);
        if (target) {
          target.text = text;
          target.tags = tags;
          target.updatedAt = Date.now();
          await writeStorage(STORAGE_KEYS.items, items);
          setNotice(i18n.t('pm_saved') || 'Saved', 'ok');
        }
        editingId = null;
      } else {
        // prevent duplicates (case-insensitive, same text)
        const exists = items.some((x) => x.text.trim().toLowerCase() === text.toLowerCase());
        if (exists) {
          setInlineHint(i18n.t('pm_duplicate') || 'Duplicate prompt', 'err');
          return;
        }
        const it: PromptItem = { id: uid(), text, tags, createdAt: Date.now() };
        items = [it, ...items];
        await writeStorage(STORAGE_KEYS.items, items);
      }
      (addForm.querySelector('.gv-pm-input-text') as HTMLTextAreaElement).value = '';
      (addForm.querySelector('.gv-pm-input-tags') as HTMLInputElement).value = '';
      setInlineHint('');
      addForm.classList.add('gv-hidden');
      renderTags();
      renderList();
    });

    searchInput.addEventListener('input', () => renderList());

    exportBtn.addEventListener('click', async () => {
      try {
        const data = await readStorage<PromptItem[]>(STORAGE_KEYS.items, []);
        const payload = {
          format: 'gemini-voyager.prompts.v1',
          exportedAt: new Date().toISOString(),
          items: data,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prompts-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        setNotice('Export failed', 'err');
      }
    });

    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = safeParseJSON<any>(text, null);
        if (!json || (json.format !== 'gemini-voyager.prompts.v1' && !Array.isArray(json.items))) {
          setNotice(i18n.t('pm_import_invalid') || 'Invalid file format', 'err');
          return;
        }
        const arr: PromptItem[] = Array.isArray(json) ? json : Array.isArray(json.items) ? json.items : [];
        const valid: PromptItem[] = [];
        const seen = new Set<string>();
        for (const it of arr) {
          const text = String((it && (it as any).text) || '').trim();
          if (!text) continue;
          const tags = Array.isArray((it as any).tags) ? (it as any).tags.map((t: any) => String(t)) : [];
          const key = `${text.toLowerCase()}|${tags.sort().join(',')}`;
          if (seen.has(key)) continue;
          seen.add(key);
          valid.push({ id: uid(), text, tags: dedupeTags(tags), createdAt: Date.now() });
        }
        if (valid.length) {
          // Merge by text equality (case-insensitive)
          const map = new Map<string, PromptItem>();
          for (const it of items) map.set(it.text.toLowerCase(), it);
          for (const it of valid) {
            const k = it.text.toLowerCase();
            if (map.has(k)) {
              const prev = map.get(k)!;
              const mergedTags = dedupeTags([...(prev.tags || []), ...(it.tags || [])]);
              prev.tags = mergedTags;
              prev.updatedAt = Date.now();
              map.set(k, prev);
            } else {
              map.set(k, it);
            }
          }
          items = Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          await writeStorage(STORAGE_KEYS.items, items);
          setNotice((i18n.t('pm_import_success') || 'Imported').replace('{count}', String(valid.length)), 'ok');
          renderTags();
          renderList();
        } else {
          setNotice(i18n.t('pm_import_invalid') || 'Invalid file format', 'err');
        }
      } catch {
        setNotice(i18n.t('pm_import_invalid') || 'Invalid file format', 'err');
      } finally {
        importInput.value = '';
      }
    });

    // Initialize
    refreshUITexts();
  } catch (err) {
    try { (window as any).console?.error?.('Prompt Manager init failed', err); } catch {}
  }
}

export default { startPromptManager };


