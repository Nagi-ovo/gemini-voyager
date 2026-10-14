<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { homeFeaturesContent } from '../content';
import { useStage } from '../stage';
import type { TreeNode } from '../types';
import { uiIcons } from '../uiIcons';

const props = defineProps<{ name: string; detail: string; lang: string }>();
const stage = useStage();
stage.focus('folders');

const ICONS = {
  circleCheck: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  x: uiIcons.x,
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const icon = (path: string, size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

/* The extension's own strings: folder_multi_select_count, batch_delete_*, pm_delete, pm_cancel. */
interface Strings {
  count: string;
  progress: string;
  confirm: string;
  cancel: string;
  del: string;
  done: string;
  exit: string;
}
const TEXT: Record<string, Strings> = {
  'zh-CN': {
    count: '已选 {n} 个',
    progress: '正在删除... ({i}/{n})',
    confirm: '确定要删除 {n} 个会话吗？此操作无法撤销。',
    cancel: '取消',
    del: '删除',
    done: '已删除 {n} 个会话',
    exit: '退出多选模式',
  },
  'zh-TW': {
    count: '已選 {n} 個',
    progress: '正在刪除... ({i}/{n})',
    confirm: '確定要刪除 {n} 個對話嗎？此操作無法復原。',
    cancel: '取消',
    del: '刪除',
    done: '已刪除 {n} 個對話',
    exit: '結束多選模式',
  },
  'en-US': {
    count: '{n} selected',
    progress: 'Deleting... ({i}/{n})',
    confirm: 'Delete {n} conversations? This action cannot be undone.',
    cancel: 'Cancel',
    del: 'Delete',
    done: 'Deleted {n} conversations',
    exit: 'Exit multi-select mode',
  },
  'ja-JP': {
    count: '{n} 件選択中',
    progress: '削除中... ({i}/{n})',
    confirm: '{n} 件の会話を削除してもよろしいですか？この操作は取り消せません。',
    cancel: 'キャンセル',
    del: '削除',
    done: '{n} 件の会話を削除しました',
    exit: '複数選択モードを終了',
  },
  'ko-KR': {
    count: '{n}개 선택됨',
    progress: '삭제 중... ({i}/{n})',
    confirm: '{n}개의 대화를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
    cancel: '취소',
    del: '삭제',
    done: '{n}개의 대화를 삭제했습니다',
    exit: '다중 선택 모드 종료',
  },
  'fr-FR': {
    count: '{n} sélectionnées',
    progress: 'Suppression... ({i}/{n})',
    confirm: 'Voulez-vous vraiment supprimer {n} discussions ? Cette action est irréversible.',
    cancel: 'Annuler',
    del: 'Supprimer',
    done: '{n} discussions supprimées',
    exit: 'Quitter le mode sélection multiple',
  },
  'es-ES': {
    count: '{n} seleccionadas',
    progress: 'Eliminando... ({i}/{n})',
    confirm: '¿Eliminar {n} conversaciones? Esta acción no se puede deshacer.',
    cancel: 'Cancelar',
    del: 'Eliminar',
    done: 'Se eliminaron {n} conversaciones',
    exit: 'Salir del modo de selección múltiple',
  },
  'pt-PT': {
    count: '{n} selecionadas',
    progress: 'A eliminar... ({i}/{n})',
    confirm: 'Eliminar {n} conversas? Esta ação não pode ser desfeita.',
    cancel: 'Cancelar',
    del: 'Eliminar',
    done: '{n} conversas eliminadas',
    exit: 'Sair do modo de seleção múltipla',
  },
  'ar-SA': {
    count: '{n} محددة',
    progress: 'جارٍ الحذف... ({i}/{n})',
    confirm: 'هل تريد حذف {n} محادثات؟ لا يمكن التراجع عن هذا الإجراء.',
    cancel: 'إلغاء',
    del: 'حذف',
    done: 'تم حذف {n} محادثات',
    exit: 'إنهاء وضع التحديد المتعدد',
  },
  'ru-RU': {
    count: 'Выбрано: {n}',
    progress: 'Удаление... ({i}/{n})',
    confirm: 'Удалить разговоры ({n})? Это действие нельзя отменить.',
    cancel: 'Отмена',
    del: 'Удалить',
    done: 'Удалено разговоров: {n}',
    exit: 'Выйти из режима множественного выбора',
  },
};
const text = computed(() => TEXT[props.lang] ?? TEXT['en-US']);
const fmt = (s: string, n: number, i = 0) => s.replace('{n}', String(n)).replace('{i}', String(i));

/* The folder card, redrawn row for row so the scene starts exactly where the demo is. */
const content = computed(() => homeFeaturesContent[props.lang] ?? homeFeaturesContent['en-US']);
interface Row {
  key: string;
  depth: number;
  folder?: string;
  open?: boolean;
  chat?: string;
}
const allRows = computed<Row[]>(() => {
  const c = content.value;
  const starred = (n: TreeNode) => 'chat' in n && !!c.chats[n.chat]?.star;
  const out: Row[] = [];
  const walk = (nodes: TreeNode[], depth: number, path: string) => {
    const sorted = [...nodes].sort(
      (a, b) =>
        Number('folder' in b) - Number('folder' in a) || Number(starred(b)) - Number(starred(a)),
    );
    for (const n of sorted) {
      if ('folder' in n) {
        out.push({ key: `${path}/${n.folder}`, depth, folder: n.folder, open: !!n.open });
        if (n.open) walk(n.kids, depth + 1, `${path}/${n.folder}`);
      } else out.push({ key: n.chat, depth, chat: n.chat });
    }
  };
  walk(c.tree, 0, '');
  return out;
});
/* Gemini's own chat list is what batch delete works on: the chats outside any folder. */
const isNative = (row: Row) => !!row.chat && row.depth === 0 && row.chat !== content.value.current;
const PICK = computed(() =>
  allRows.value
    .filter(isNative)
    .slice(0, 3)
    .map((r) => r.chat as string),
);

const gone = ref<string[]>([]);
const rows = computed(() => allRows.value.filter((r) => !r.chat || !gone.value.includes(r.chat)));
const selected = ref<string[]>([]);
const mode = ref(false);
const confirmOpen = ref(false);
const deleting = ref(0); // rows deleted so far + 1 while a delete runs
const deleteTotal = ref(0);
const toast = ref(0); // how many the last run deleted
const holdId = ref('');
const auto = ref(true);

const toolText = computed(() =>
  deleting.value
    ? fmt(text.value.progress, deleteTotal.value, Math.min(deleting.value, deleteTotal.value))
    : fmt(text.value.count, selected.value.length),
);

const timers: number[] = [];
const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

function enter(id: string) {
  toast.value = 0;
  mode.value = true;
  selected.value = [id];
}
function exit() {
  mode.value = false;
  confirmOpen.value = false;
  selected.value = [];
}
function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((x) => x !== id)
    : [...selected.value, id];
  if (!selected.value.length) exit();
}
function runDelete(step = 320) {
  confirmOpen.value = false;
  const ids = [...selected.value];
  deleteTotal.value = ids.length;
  deleting.value = 1;
  ids.forEach((id, k) =>
    at(200 + k * step, () => {
      gone.value = [...gone.value, id];
      deleting.value = k + 2;
    }),
  );
  at(200 + ids.length * step + 120, () => {
    deleting.value = 0;
    mode.value = false;
    selected.value = [];
    toast.value = ids.length;
  });
}

/* Try it yourself once the scene has played: long-press a chat, tap more, delete. */
let pressTimer = 0;
let pressed = false;
function rowDown(row: Row) {
  if (auto.value || deleting.value || !isNative(row)) return;
  pressed = false;
  if (mode.value) return;
  holdId.value = row.chat as string;
  clearTimeout(pressTimer);
  pressTimer = window.setTimeout(() => {
    pressed = true;
    holdId.value = '';
    enter(row.chat as string);
  }, 500);
}
function rowUp(row: Row) {
  clearTimeout(pressTimer);
  holdId.value = '';
  if (auto.value || deleting.value || pressed || !mode.value || !isNative(row)) return;
  toggle(row.chat as string);
}
function rowCancel() {
  clearTimeout(pressTimer);
  holdId.value = '';
}

/* A touch marker that walks through the gesture. */
const rootEl = ref<HTMLElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const trashEl = ref<HTMLElement | null>(null);
const confirmDelEl = ref<HTMLElement | null>(null);
const rowEls = new Map<string, HTMLElement>();
const setRow = (key: string) => (el: unknown) => {
  if (el instanceof HTMLElement) rowEls.set(key, el);
  else rowEls.delete(key);
};
const dot = reactive({ x: 0, y: 0, show: false, tap: 0, hold: false });
function moveTo(el: HTMLElement | null | undefined, share = 0.55) {
  const root = rootEl.value?.getBoundingClientRect();
  const r = el?.getBoundingClientRect();
  if (!root || !r || !rootEl.value) return;
  const rtl = getComputedStyle(rootEl.value).direction === 'rtl';
  dot.x = r.left - root.left + r.width * (rtl ? 1 - share : share);
  dot.y = r.top - root.top + r.height / 2;
}
const tap = () => dot.tap++;

onMounted(() => {
  const picks = PICK.value;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gone.value = picks;
    toast.value = picks.length;
    auto.value = false;
    return;
  }
  // The chats outside folders sit below the fold: bring them up first.
  at(250, () => listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: 'smooth' }));
  at(900, () => {
    moveTo(rowEls.get(picks[0]));
    dot.show = true;
  });
  at(1100, () => {
    dot.hold = true;
    holdId.value = picks[0];
  });
  at(1650, () => {
    dot.hold = false;
    holdId.value = '';
    enter(picks[0]);
  });
  picks.slice(1).forEach((id, k) => {
    const t = 2000 + k * 450;
    at(t, () => moveTo(rowEls.get(id)));
    at(t + 220, () => {
      tap();
      toggle(id);
    });
  });
  const t = 2000 + (picks.length - 1) * 450 + 250;
  at(t, () => moveTo(trashEl.value, 0.5));
  at(t + 220, () => {
    tap();
    confirmOpen.value = true;
  });
  at(t + 700, () => moveTo(confirmDelEl.value, 0.5));
  at(t + 950, () => {
    tap();
    runDelete();
  });
  at(t + 1150, () => (dot.show = false));
  at(t + 1300 + picks.length * 320, () => (auto.value = false));
});
onBeforeUnmount(() => {
  timers.forEach((t) => clearTimeout(t));
  clearTimeout(pressTimer);
});
</script>

<template>
  <Teleport v-if="stage.regions.foldersCover" :to="stage.regions.foldersCover">
    <div ref="rootEl" class="gvf-bd">
      <div ref="listEl" class="gvf-fd">
        <div class="gvf-fd-head">
          <span class="gvf-fd-label">{{ content.folders.heading }}</span>
          <span class="gvf-icon-btn sm" v-html="icon(uiIcons.user, 15)" />
          <span class="gvf-icon-btn sm" v-html="icon(uiIcons.folder, 15)" />
          <span class="gvf-icon-btn sm" v-html="icon(uiIcons.cloud, 15)" />
          <span class="gvf-icon-btn sm" v-html="icon(uiIcons.settings, 15)" />
          <span class="gvf-icon-btn sm" v-html="icon(uiIcons.plus, 15)" />
        </div>
        <div class="gvf-fd-search">
          <input
            type="search"
            readonly
            tabindex="-1"
            :placeholder="content.folders.searchPlaceholder"
            :aria-label="content.folders.searchPlaceholder"
          />
        </div>
        <TransitionGroup tag="div" name="gvf-bd-row">
          <div
            v-for="row in rows"
            :key="row.key"
            :ref="setRow(row.key)"
            class="gvf-row"
            :class="{
              current: row.chat === content.current,
              'gvf-bd-sel': !!row.chat && selected.includes(row.chat),
              'gvf-bd-hold': holdId === row.chat,
              'gvf-bd-del': deleting > 0 && !!row.chat && selected.includes(row.chat),
            }"
            :style="{ paddingLeft: `${10 + row.depth * 14}px` }"
            @pointerdown="rowDown(row)"
            @pointerup="rowUp(row)"
            @pointerleave="rowCancel"
            @contextmenu.prevent
          >
            <template v-if="row.folder">
              <span
                class="gvf-chev"
                :class="{ open: row.open }"
                v-html="icon(uiIcons['chevron-right'], 14)"
              />
              <span v-html="icon(row.open ? uiIcons['folder-open'] : uiIcons.folder, 14)" />
              <span class="gvf-name">{{ row.folder }}</span>
            </template>
            <template v-else>
              <span v-html="icon(uiIcons['message-square'], 14)" />
              <span class="gvf-name">{{ content.chats[row.chat!]?.title }}</span>
              <span
                class="gvf-star"
                :class="{ on: content.chats[row.chat!]?.star }"
                v-html="icon(uiIcons.star, 14)"
              />
            </template>
          </div>
        </TransitionGroup>
      </div>

      <!-- The multi-select toolbar (.gv-multi-select-indicator) -->
      <div class="gvf-bd-tool" :class="{ on: mode }" role="toolbar" :aria-hidden="!mode">
        <span class="gvf-bd-tool-ic" v-html="icon(ICONS.circleCheck, 17)" />
        <span class="gvf-bd-tool-text">{{ toolText }}</span>
        <button
          ref="trashEl"
          type="button"
          class="gvf-bd-tool-btn gvf-bd-trash"
          :disabled="deleting > 0 || auto"
          :title="text.del"
          :aria-label="text.del"
          @click="confirmOpen = !confirmOpen"
          v-html="icon(ICONS.trash, 16)"
        />
        <button
          type="button"
          class="gvf-bd-tool-btn"
          :disabled="deleting > 0 || auto"
          :title="text.exit"
          :aria-label="text.exit"
          @click="exit"
          v-html="icon(ICONS.x, 16)"
        />
      </div>

      <!-- The shared confirm card (askConfirm, danger tone) under the delete button -->
      <div
        class="gvf-bd-confirm"
        :class="{ on: confirmOpen }"
        role="alertdialog"
        :aria-hidden="!confirmOpen"
      >
        <p>{{ fmt(text.confirm, selected.length) }}</p>
        <div>
          <button type="button" class="gvf-bd-cbtn" :disabled="auto" @click="confirmOpen = false">
            {{ text.cancel }}
          </button>
          <button
            ref="confirmDelEl"
            type="button"
            class="gvf-bd-cbtn gvf-bd-danger"
            :disabled="auto"
            @click="runDelete()"
          >
            {{ text.del }}
          </button>
        </div>
      </div>

      <span
        :key="dot.tap"
        class="gvf-bd-dot"
        :class="{ show: dot.show, hold: dot.hold, tap: dot.tap > 0 }"
        :style="{ transform: `translate(${dot.x}px, ${dot.y}px)` }"
        aria-hidden="true"
      />

      <div class="gvf-bd-toast" :class="{ on: toast > 0 }" role="status">
        <span v-html="icon(ICONS.check, 14)" />{{ fmt(text.done, toast) }}
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.gvf-bd {
  --gvf-bd-accent: #10b981;
  --gvf-bd-glow: rgba(16, 185, 129, 0.14);
  --gvf-bd-danger: #ef4444;
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--host-bg);
}
.dark .gvf-bd {
  background: var(--host-side);
  --gvf-bd-glow: rgba(16, 185, 129, 0.16);
}
.gvf-bd .gvf-fd {
  height: 100%;
  padding-bottom: 52px;
}
.gvf-bd .gvf-row {
  touch-action: manipulation;
  -webkit-touch-callout: none;
  transition: background 0.2s ease;
}

/* Selected rows: the extension's subtle gradient and left accent stripe */
.gvf-bd .gvf-row.gvf-bd-sel {
  background: linear-gradient(to right, var(--gvf-bd-glow), transparent);
  border-radius: 10px;
}
[dir='rtl'] .gvf-bd .gvf-row.gvf-bd-sel {
  background: linear-gradient(to left, var(--gvf-bd-glow), transparent);
}
.gvf-bd .gvf-row.gvf-bd-sel::before {
  content: '';
  position: absolute;
  inset-inline-start: 0;
  top: 20%;
  width: 3px;
  height: 60%;
  border-start-end-radius: 2px;
  border-end-end-radius: 2px;
  background: var(--gvf-bd-accent);
  opacity: 0.9;
  animation: gvf-bd-bar 0.22s ease both;
}
@keyframes gvf-bd-bar {
  from {
    transform: scaleY(0.3);
    opacity: 0;
  }
}
.gvf-bd .gvf-row.gvf-bd-hold {
  background: color-mix(in srgb, var(--host-text) 9%, transparent);
}
.gvf-bd .gvf-row.gvf-bd-del {
  background: color-mix(in srgb, var(--gvf-bd-danger) 12%, transparent);
}
.gvf-bd .gvf-row.gvf-bd-del::before {
  background: var(--gvf-bd-danger);
}
.gvf-bd-row-leave-active {
  transition:
    height 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.2s ease,
    transform 0.28s ease;
  overflow: hidden;
}
.gvf-bd .gvf-row.gvf-bd-row-leave-to {
  height: 0;
  opacity: 0;
  transform: translateX(-12px);
}
[dir='rtl'] .gvf-bd .gvf-row.gvf-bd-row-leave-to {
  transform: translateX(12px);
}
.gvf-bd-row-move {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

/* The multi-select toolbar */
.gvf-bd-tool {
  position: absolute;
  inset: 8px 8px auto;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding-inline: 12px 4px;
  border: 1px solid var(--gvf-bd-accent);
  border-radius: 10px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--gvf-bd-accent) 14%, var(--host-bg)),
    color-mix(in srgb, var(--gvf-bd-accent) 6%, var(--host-bg))
  );
  box-shadow:
    0 4px 12px var(--gvf-bd-glow),
    0 2px 4px oklch(0 0 0 / 0.08);
  opacity: 0;
  transform: translateY(-10px);
  transition:
    opacity 0.25s ease,
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}
.gvf-bd-tool.on {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.gvf-bd-tool-ic {
  display: grid;
  color: var(--gvf-bd-accent);
}
.gvf-bd-tool-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.gvf-bd-tool-btn {
  flex: none;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--host-muted) !important;
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    background 0.2s ease;
}
.gvf-bd-tool-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--host-text) 8%, transparent);
}
.gvf-bd-tool-btn.gvf-bd-trash {
  color: var(--gvf-bd-danger) !important;
}
.gvf-bd-tool-btn.gvf-bd-trash:hover:not(:disabled) {
  background: color-mix(in srgb, var(--gvf-bd-danger) 12%, transparent);
}
.gvf-bd-tool-btn:disabled {
  cursor: default;
}
.gvf-bd-tool-btn:disabled:not(.gvf-bd-trash) {
  opacity: 0.5;
}

/* The confirm card */
.gvf-bd-confirm {
  position: absolute;
  top: 56px;
  inset-inline-end: 8px;
  width: min(250px, calc(100% - 16px));
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid var(--gv-border);
  border-radius: 12px;
  background: var(--gv-surface);
  color: var(--gv-text);
  box-shadow: 0 6px 20px oklch(0 0 0 / 0.16);
  font-size: 12.5px;
  line-height: 1.45;
  opacity: 0;
  transform: translateY(2px);
  transition:
    opacity 0.16s ease-out,
    transform 0.16s ease-out;
  pointer-events: none;
}
.gvf-bd-confirm.on {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.gvf-bd-confirm p {
  margin: 0 0 10px;
}
.gvf-bd-confirm div {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.gvf-bd-cbtn {
  padding: 3px 12px;
  border: 1px solid var(--gv-border);
  border-radius: 8px;
  background: transparent;
  font-size: 12.5px !important;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.gvf-bd-cbtn:disabled {
  cursor: default;
}
.gvf-bd-cbtn.gvf-bd-danger {
  border-color: transparent;
  background: var(--gvf-bd-danger);
  color: #fff !important;
}

/* Touch marker */
.gvf-bd-dot {
  position: absolute;
  top: -14px;
  left: -14px;
  z-index: 3;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--host-text) 16%, transparent);
  border: 2px solid color-mix(in srgb, var(--host-text) 35%, transparent);
  box-sizing: border-box;
  opacity: 0;
  pointer-events: none;
  transition:
    transform 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.2s ease;
}
.gvf-bd-dot.show {
  opacity: 1;
}
.gvf-bd-dot::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  border: 2px solid var(--gvf-bd-accent);
  opacity: 0;
}
.gvf-bd-dot.hold::after {
  animation: gvf-bd-hold 0.55s linear forwards;
}
@keyframes gvf-bd-hold {
  from {
    opacity: 0.9;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(2);
  }
}
.gvf-bd-dot.tap.show::after {
  animation: gvf-bd-tap 0.4s ease-out;
}
@keyframes gvf-bd-tap {
  from {
    opacity: 0.8;
    transform: scale(0.7);
  }
  to {
    opacity: 0;
    transform: scale(1.7);
  }
}

/* Result toast */
.gvf-bd-toast {
  position: absolute;
  inset-inline: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: fit-content;
  max-width: calc(100% - 24px);
  margin-inline: auto;
  padding: 7px 14px;
  border: 1px solid var(--gv-border);
  border-radius: 99px;
  background: var(--gv-surface);
  color: var(--gv-text);
  box-shadow: 0 8px 24px -8px oklch(0 0 0 / 0.25);
  font-size: 12.5px;
  font-weight: 500;
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  transition:
    opacity 0.25s ease,
    transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.gvf-bd-toast.on {
  opacity: 1;
  transform: none;
}
.gvf-bd-toast span {
  display: grid;
  color: var(--gvf-bd-accent);
}
</style>
