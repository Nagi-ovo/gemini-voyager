<script setup lang="ts">
import { useData } from 'vitepress';
import { computed, onMounted, ref } from 'vue';

interface Folder {
  readonly id: string;
  name: string;
  parentId: string | null;
  pinned?: boolean;
  color?: string;
  sortIndex?: number;
  createdAt: number;
  updatedAt: number;
  instructions?: string;
}

interface ConversationReference {
  readonly conversationId: string;
  title: string;
  url: string;
  addedAt: number;
  isGem?: boolean;
  starred?: boolean;
  sortIndex?: number;
}

interface FolderExportPayload {
  format: 'gemini-voyager.folders.v1';
  exportedAt: string;
  version: string;
  data: {
    folders: Folder[];
    folderContents: Record<string, ConversationReference[]>;
  };
}

type RowKind = 'folder' | 'conversation' | 'empty';

interface FlatRow {
  kind: RowKind;
  depth: number;
  folder?: Folder;
  conversation?: ConversationReference;
  hasChildren?: boolean;
  convCount?: number;
}

const CACHE_KEY = 'gv-folder-viewer-data';
const UNFILED_ID = '__unfiled__';

const { lang } = useData();

const i18n: Record<string, Record<string, string>> = {
  'zh-CN': {
    dropHint: '拖拽 JSON 文件到此处，或点击选择文件',
    browse: '选择文件',
    formatHint: '支持从 Voyager 扩展导出的文件夹数据（gemini-voyager.folders.v1）',
    exportedAt: '导出时间',
    clear: '清除数据',
    reimport: '重新导入',
    folders: '个文件夹',
    conversations: '个对话',
    noConversations: '空文件夹',
    pinned: '已置顶',
    gem: 'Gem',
    invalidFormat: '文件格式无效，请上传 Voyager 导出的文件夹 JSON 文件',
    parseError: '文件解析失败，请检查文件是否完整',
    project: '项目',
    unfiled: '未归类对话',
  },
  'zh-TW': {
    dropHint: '拖曳 JSON 檔案到此處，或點擊選擇檔案',
    browse: '選擇檔案',
    formatHint: '支援從 Voyager 擴充功能匯出的資料夾資料（gemini-voyager.folders.v1）',
    exportedAt: '匯出時間',
    clear: '清除資料',
    reimport: '重新匯入',
    folders: '個資料夾',
    conversations: '個對話',
    noConversations: '空資料夾',
    pinned: '已置頂',
    gem: 'Gem',
    invalidFormat: '檔案格式無效，請上傳 Voyager 匯出的資料夾 JSON 檔案',
    parseError: '檔案解析失敗，請檢查檔案是否完整',
    project: '專案',
    unfiled: '未歸類對話',
  },
  'en-US': {
    dropHint: 'Drop a JSON file here, or click to browse',
    browse: 'Browse file',
    formatHint: 'Supports folder data exported from Voyager extension (gemini-voyager.folders.v1)',
    exportedAt: 'Exported at',
    clear: 'Clear data',
    reimport: 'Re-import',
    folders: 'folders',
    conversations: 'conversations',
    noConversations: 'Empty folder',
    pinned: 'Pinned',
    gem: 'Gem',
    invalidFormat: 'Invalid file format. Please upload a folder JSON exported from Voyager.',
    parseError: 'Failed to parse file. Please check if the file is complete.',
    project: 'Project',
    unfiled: 'Unfiled conversations',
  },
  'ja-JP': {
    dropHint: 'JSON ファイルをここにドロップ、またはクリックして選択',
    browse: 'ファイルを選択',
    formatHint: 'Voyager からエクスポートしたフォルダデータに対応（gemini-voyager.folders.v1）',
    exportedAt: 'エクスポート日時',
    clear: 'データを消去',
    reimport: '再インポート',
    folders: 'フォルダ',
    conversations: '会話',
    noConversations: '空のフォルダ',
    pinned: 'ピン留め',
    gem: 'Gem',
    invalidFormat:
      'ファイル形式が無効です。Voyager からエクスポートしたフォルダ JSON をアップロードしてください。',
    parseError: 'ファイルの解析に失敗しました。ファイルが完全か確認してください。',
    project: 'プロジェクト',
    unfiled: '未分類の会話',
  },
  'ko-KR': {
    dropHint: 'JSON 파일을 여기에 놓거나 클릭하여 선택하세요',
    browse: '파일 선택',
    formatHint: 'Voyager에서 내보낸 폴더 데이터를 지원합니다 (gemini-voyager.folders.v1)',
    exportedAt: '내보낸 시간',
    clear: '데이터 지우기',
    reimport: '다시 가져오기',
    folders: '폴더',
    conversations: '대화',
    noConversations: '빈 폴더',
    pinned: '고정됨',
    gem: 'Gem',
    invalidFormat: '파일 형식이 잘못되었습니다. Voyager에서 내보낸 폴더 JSON을 업로드하세요.',
    parseError: '파일 분석에 실패했습니다. 파일이 완전한지 확인해 주세요.',
    project: '프로젝트',
    unfiled: '미분류 대화',
  },
  'fr-FR': {
    dropHint: 'Déposez un fichier JSON ici, ou cliquez pour parcourir',
    browse: 'Parcourir',
    formatHint: 'Prend en charge les données exportées depuis Voyager (gemini-voyager.folders.v1)',
    exportedAt: 'Exporté le',
    clear: 'Effacer',
    reimport: 'Ré-importer',
    folders: 'dossiers',
    conversations: 'conversations',
    noConversations: 'Dossier vide',
    pinned: 'Épinglé',
    gem: 'Gem',
    invalidFormat: 'Format invalide. Veuillez importer un JSON de dossiers exporté depuis Voyager.',
    parseError: "Échec de l'analyse. Vérifiez que le fichier est complet.",
    project: 'Projet',
    unfiled: 'Conversations non classées',
  },
  'es-ES': {
    dropHint: 'Arrastra un archivo JSON aquí, o haz clic para seleccionar',
    browse: 'Seleccionar',
    formatHint: 'Compatible con datos exportados desde Voyager (gemini-voyager.folders.v1)',
    exportedAt: 'Exportado el',
    clear: 'Borrar',
    reimport: 'Reimportar',
    folders: 'carpetas',
    conversations: 'conversaciones',
    noConversations: 'Carpeta vacía',
    pinned: 'Fijado',
    gem: 'Gem',
    invalidFormat: 'Formato inválido. Sube un JSON de carpetas exportado desde Voyager.',
    parseError: 'Error al analizar. Verifica que el archivo esté completo.',
    project: 'Proyecto',
    unfiled: 'Conversaciones sin clasificar',
  },
  'pt-PT': {
    dropHint: 'Arraste um ficheiro JSON para aqui, ou clique para selecionar',
    browse: 'Selecionar',
    formatHint: 'Suporta dados exportados da extensão Voyager (gemini-voyager.folders.v1)',
    exportedAt: 'Exportado em',
    clear: 'Limpar',
    reimport: 'Reimportar',
    folders: 'pastas',
    conversations: 'conversas',
    noConversations: 'Pasta vazia',
    pinned: 'Fixado',
    gem: 'Gem',
    invalidFormat: 'Formato inválido. Carregue um JSON de pastas exportado do Voyager.',
    parseError: 'Falha ao analisar. Verifique se o ficheiro está completo.',
    project: 'Projeto',
    unfiled: 'Conversas não classificadas',
  },
  'ar-SA': {
    dropHint: 'اسحب ملف JSON هنا، أو انقر للاختيار',
    browse: 'اختيار ملف',
    formatHint: 'يدعم بيانات المجلدات المصدّرة من Voyager (gemini-voyager.folders.v1)',
    exportedAt: 'تاريخ التصدير',
    clear: 'مسح',
    reimport: 'إعادة الاستيراد',
    folders: 'مجلدات',
    conversations: 'محادثات',
    noConversations: 'مجلد فارغ',
    pinned: 'مثبّت',
    gem: 'Gem',
    invalidFormat: 'صيغة غير صالحة. يرجى رفع ملف JSON مصدّر من Voyager.',
    parseError: 'فشل التحليل. يرجى التحقق من اكتمال الملف.',
    project: 'مشروع',
    unfiled: 'محادثات غير مصنّفة',
  },
  'ru-RU': {
    dropHint: 'Перетащите JSON-файл сюда или нажмите для выбора',
    browse: 'Выбрать файл',
    formatHint: 'Поддерживает данные из расширения Voyager (gemini-voyager.folders.v1)',
    exportedAt: 'Экспортировано',
    clear: 'Очистить',
    reimport: 'Повторный импорт',
    folders: 'папок',
    conversations: 'бесед',
    noConversations: 'Пустая папка',
    pinned: 'Закреплено',
    gem: 'Gem',
    invalidFormat: 'Неверный формат. Загрузите JSON папок, экспортированный из Voyager.',
    parseError: 'Не удалось разобрать файл. Проверьте его целостность.',
    project: 'Проект',
    unfiled: 'Неклассифицированные беседы',
  },
};

function t(key: string): string {
  return i18n[lang.value]?.[key] ?? i18n['en-US'][key] ?? key;
}

const payload = ref<FolderExportPayload | null>(null);
const errorMsg = ref('');
const dragging = ref(false);
const expandedIds = ref(new Set<string>());
const fileInput = ref<HTMLInputElement>();

interface TreeNode {
  folder: Folder;
  children: TreeNode[];
  conversations: ConversationReference[];
}

function buildTree(data: FolderExportPayload['data']): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const f of data.folders) {
    map.set(f.id, {
      folder: f,
      children: [],
      conversations: (data.folderContents[f.id] ?? [])
        .slice()
        .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0)),
    });
  }
  const roots: TreeNode[] = [];
  for (const f of data.folders) {
    const node = map.get(f.id)!;
    if (f.parentId && map.has(f.parentId)) {
      map.get(f.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes: TreeNode[]) =>
    nodes.sort((a, b) => (a.folder.sortIndex ?? 0) - (b.folder.sortIndex ?? 0));
  sortNodes(roots);
  for (const node of map.values()) sortNodes(node.children);
  return roots;
}

function flattenTree(nodes: TreeNode[], depth: number, out: FlatRow[]) {
  for (const node of nodes) {
    const hasChildren = node.children.length > 0 || node.conversations.length > 0;
    out.push({
      kind: 'folder',
      depth,
      folder: node.folder,
      hasChildren,
      convCount: node.conversations.length,
    });
    if (expandedIds.value.has(node.folder.id)) {
      flattenTree(node.children, depth + 1, out);
      if (node.conversations.length > 0) {
        for (const conv of node.conversations) {
          out.push({ kind: 'conversation', depth: depth + 1, conversation: conv });
        }
      } else if (node.children.length === 0) {
        out.push({ kind: 'empty', depth: depth + 1 });
      }
    }
  }
}

const rows = computed<FlatRow[]>(() => {
  if (!payload.value) return [];
  const tree = buildTree(payload.value.data);
  const out: FlatRow[] = [];
  flattenTree(tree, 0, out);

  const folderIds = new Set(payload.value.data.folders.map((f) => f.id));
  const unfiled: ConversationReference[] = [];
  for (const [fid, convs] of Object.entries(payload.value.data.folderContents)) {
    if (!folderIds.has(fid)) unfiled.push(...convs);
  }
  if (unfiled.length > 0) {
    out.push({
      kind: 'folder',
      depth: 0,
      folder: {
        id: UNFILED_ID,
        name: t('unfiled'),
        parentId: null,
        createdAt: 0,
        updatedAt: 0,
      } as Folder,
      hasChildren: true,
      convCount: unfiled.length,
    });
    if (expandedIds.value.has(UNFILED_ID)) {
      for (const conv of unfiled) {
        out.push({ kind: 'conversation', depth: 1, conversation: conv });
      }
    }
  }
  return out;
});

const stats = computed(() => {
  if (!payload.value) return { folders: 0, conversations: 0 };
  let convCount = 0;
  for (const convs of Object.values(payload.value.data.folderContents)) {
    convCount += convs.length;
  }
  return { folders: payload.value.data.folders.length, conversations: convCount };
});

function toggle(id: string) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

function expandAll() {
  if (!payload.value) return;
  expandedIds.value = new Set(payload.value.data.folders.map((f) => f.id));
}

function collapseAll() {
  expandedIds.value = new Set();
}

function formatDate(ts: number | string): string {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
  return d.toLocaleDateString(lang.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function loadPayload(raw: string) {
  errorMsg.value = '';
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed.format !== 'gemini-voyager.folders.v1' ||
      !parsed.data?.folders ||
      !parsed.data?.folderContents
    ) {
      errorMsg.value = t('invalidFormat');
      return;
    }
    payload.value = parsed as FolderExportPayload;
    expandAll();
    localStorage.setItem(CACHE_KEY, raw);
  } catch {
    errorMsg.value = t('parseError');
  }
}

function handleFile(file: File) {
  if (!file.name.endsWith('.json')) {
    errorMsg.value = t('invalidFormat');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => loadPayload(reader.result as string);
  reader.readAsText(file);
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) handleFile(file);
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) handleFile(file);
  input.value = '';
}

function clearData() {
  payload.value = null;
  errorMsg.value = '';
  expandedIds.value = new Set();
  localStorage.removeItem(CACHE_KEY);
}

function triggerImport() {
  fileInput.value?.click();
}

onMounted(() => {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) loadPayload(cached);
});
</script>

<template>
  <div class="folder-viewer">
    <div
      v-if="!payload"
      class="fv-upload"
      :class="{ dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
      @click="triggerImport"
    >
      <svg
        class="fv-upload-icon"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <p class="fv-upload-text">{{ t('dropHint') }}</p>
      <button class="fv-browse" @click.stop="triggerImport">{{ t('browse') }}</button>
      <p class="fv-hint">{{ t('formatHint') }}</p>
    </div>

    <div v-if="errorMsg" class="fv-error">{{ errorMsg }}</div>

    <div v-if="payload" class="fv-data">
      <div class="fv-header">
        <div class="fv-meta">
          <span class="fv-badge">{{ stats.folders }} {{ t('folders') }}</span>
          <span class="fv-badge">{{ stats.conversations }} {{ t('conversations') }}</span>
          <span v-if="payload.exportedAt" class="fv-info"
            >{{ t('exportedAt') }}: {{ formatDate(payload.exportedAt) }}</span
          >
          <span v-if="payload.version" class="fv-info">v{{ payload.version }}</span>
        </div>
        <div class="fv-actions">
          <button class="fv-btn" @click="expandAll" title="Expand all">+</button>
          <button class="fv-btn" @click="collapseAll" title="Collapse all">&minus;</button>
          <button class="fv-btn" @click="triggerImport">{{ t('reimport') }}</button>
          <button class="fv-btn fv-btn-danger" @click="clearData">{{ t('clear') }}</button>
        </div>
      </div>

      <div class="fv-tree">
        <template v-for="(row, i) in rows" :key="i">
          <!-- Folder row -->
          <div
            v-if="row.kind === 'folder'"
            class="fv-folder"
            :class="{ 'fv-unfiled': row.folder?.id === UNFILED_ID }"
            :style="{ paddingLeft: `${row.depth * 20 + 12}px` }"
            @click="toggle(row.folder!.id)"
          >
            <span class="fv-toggle">{{
              row.hasChildren ? (expandedIds.has(row.folder!.id) ? '▾' : '▸') : ''
            }}</span>
            <span class="fv-icon">📂</span>
            <span class="fv-name">{{ row.folder!.name }}</span>
            <span v-if="row.folder?.pinned" class="fv-tag fv-tag-pin">{{ t('pinned') }}</span>
            <span v-if="row.folder?.instructions" class="fv-tag fv-tag-project">{{
              t('project')
            }}</span>
            <span class="fv-count">{{ row.convCount }}</span>
          </div>

          <!-- Conversation row -->
          <a
            v-else-if="row.kind === 'conversation'"
            :href="row.conversation!.url"
            target="_blank"
            rel="noopener noreferrer"
            class="fv-conv"
            :style="{ paddingLeft: `${row.depth * 20 + 20}px` }"
          >
            <span class="fv-conv-title">
              <span v-if="row.conversation?.starred" class="fv-star">★</span>
              <span v-if="row.conversation?.isGem" class="fv-tag fv-tag-gem">{{ t('gem') }}</span>
              {{ row.conversation!.title || row.conversation!.conversationId }}
            </span>
            <span class="fv-date">{{ formatDate(row.conversation!.addedAt) }}</span>
          </a>

          <!-- Empty folder hint -->
          <div v-else class="fv-empty" :style="{ paddingLeft: `${row.depth * 20 + 20}px` }">
            {{ t('noConversations') }}
          </div>
        </template>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".json"
      style="display: none"
      @change="onFileChange"
    />
  </div>
</template>

<style scoped>
.folder-viewer {
  max-width: 800px;
  margin: 24px auto 0;
}

.fv-upload {
  border: 2px dashed var(--vp-c-border);
  border-radius: 12px;
  padding: 48px 24px;
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background 0.2s;
}
.fv-upload:hover,
.fv-upload.dragging {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}
.fv-upload-icon {
  color: var(--vp-c-text-3);
  margin-bottom: 16px;
}
.fv-upload-text {
  color: var(--vp-c-text-2);
  margin: 0 0 16px;
}
.fv-browse {
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  border: none;
  border-radius: 8px;
  padding: 8px 20px;
  font-size: 14px;
  cursor: pointer;
}
.fv-browse:hover {
  opacity: 0.85;
}
.fv-hint {
  color: var(--vp-c-text-3);
  font-size: 12px;
  margin: 16px 0 0;
}

.fv-error {
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
  border-radius: 8px;
  padding: 12px 16px;
  margin: 16px 0;
  font-size: 14px;
}

.fv-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--vp-c-border);
}
.fv-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.fv-badge {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 13px;
  font-weight: 500;
}
.fv-info {
  color: var(--vp-c-text-3);
  font-size: 12px;
}
.fv-actions {
  display: flex;
  gap: 6px;
}
.fv-btn {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 13px;
  cursor: pointer;
}
.fv-btn:hover {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-1);
}
.fv-btn-danger {
  color: var(--vp-c-danger-1);
}
.fv-btn-danger:hover {
  background: var(--vp-c-danger-soft);
}

.fv-tree {
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  overflow: hidden;
}

.fv-folder {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
}
.fv-folder:hover {
  background: var(--vp-c-bg-soft);
}
.fv-toggle {
  width: 14px;
  font-size: 12px;
  color: var(--vp-c-text-3);
  flex-shrink: 0;
  text-align: center;
}
.fv-icon {
  font-size: 16px;
  flex-shrink: 0;
}
.fv-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-1);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fv-unfiled .fv-name {
  color: var(--vp-c-text-3);
  font-style: italic;
}
.fv-count {
  color: var(--vp-c-text-3);
  font-size: 12px;
  flex-shrink: 0;
}

.fv-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
.fv-tag-pin {
  background: var(--vp-c-warning-soft);
  color: var(--vp-c-warning-1);
}
.fv-tag-project {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
.fv-tag-gem {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.fv-conv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  text-decoration: none;
  color: var(--vp-c-text-1);
  font-size: 13px;
  transition: background 0.1s;
}
.fv-conv:hover {
  background: var(--vp-c-bg-soft);
}
.fv-conv-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fv-star {
  color: #e6a817;
  margin-right: 4px;
}
.fv-date {
  color: var(--vp-c-text-3);
  font-size: 11px;
  flex-shrink: 0;
  white-space: nowrap;
}

.fv-empty {
  color: var(--vp-c-text-3);
  font-size: 12px;
  font-style: italic;
  padding: 4px 12px 8px;
}
</style>
