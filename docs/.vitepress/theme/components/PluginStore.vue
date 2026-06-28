<script setup lang="ts">
import { useData, withBase } from 'vitepress';
import { computed, onMounted, ref } from 'vue';

import {
  CATEGORY_FALLBACKS,
  CONTRIBUTE,
  MARKETPLACE_URL,
  NATIVE_PLUGINS,
  type PluginManifest,
  displayName,
  groupPluginsByFeature,
  localeKey,
  localePrefix,
  platformsFromMatches,
  resolveSourceUrl,
} from './pluginStore';

const { lang } = useData();

interface I18nData {
  title: string;
  subtitle: string;
  requires: string;
  official: string;
  source: string;
  errorTitle: string;
  errorBody: string;
  retry: string;
  hint: string;
  install: string;
  empty: string;
  disclaimer: string;
  howto?: string;
  howtoAlt?: string;
  categories: Record<string, string>;
}

const i18n: Record<string, I18nData> = {
  'zh-CN': {
    title: '插件市场',
    subtitle:
      '由 Voyager 官方维护的声明式插件，把顺手体验带到更多 AI 网站。全部免费，随扩展自动更新。',
    requires: '需要 Voyager 1.4.8 及以上版本',
    official: 'Voyager 官方',
    source: '查看源码',
    errorTitle: '插件列表加载失败',
    errorBody: '请检查网络后重试。',
    retry: '重试',
    hint: '安装 Voyager 后，在 Claude 或 ChatGPT 页面点开 Voyager 弹窗，开启插件并允许访问该网站即可使用，更新自动送达。',
    install: '如何安装 Voyager',
    empty: '暂无插件，敬请期待。',
    disclaimer:
      'Claude、ChatGPT 等名称与标志为其各自所有者的商标。本插件市场由 Voyager 维护，与 Anthropic、OpenAI 无关联，亦未获其背书。',
    howto: '🔎 怎么打开弹窗？',
    howtoAlt: '打开 Voyager 弹窗的两步：① 点击浏览器扩展（拼图）图标 ② 在列表里选择 Voyager。',
    categories: {
      readability: '阅读体验',
      'render-fix': '渲染修复',
      theme: '主题',
      layout: '布局',
      other: '其他',
    },
  },
  'zh-TW': {
    title: '外掛市集',
    subtitle:
      '由 Voyager 官方維護的宣告式外掛，把順手體驗帶到更多 AI 網站。全部免費，隨擴充功能自動更新。',
    requires: '需要 Voyager 1.4.8 或更新版本',
    official: 'Voyager 官方',
    source: '檢視原始碼',
    errorTitle: '外掛清單載入失敗',
    errorBody: '請檢查網路後重試。',
    retry: '重試',
    hint: '安裝 Voyager 後，在 Claude 或 ChatGPT 頁面點開 Voyager 彈窗，開啟外掛並允許存取該網站即可使用，更新自動送達。',
    install: '如何安裝 Voyager',
    empty: '暫無外掛，敬請期待。',
    disclaimer:
      'Claude、ChatGPT 等名稱與標誌為其各自所有者的商標。本外掛市集由 Voyager 維護，與 Anthropic、OpenAI 無關聯，亦未獲其背書。',
    howto: '🔎 怎麼打開彈窗？',
    howtoAlt: '打開 Voyager 彈窗的兩步：① 點擊瀏覽器擴充功能（拼圖）圖示 ② 在清單中選擇 Voyager。',
    categories: {
      readability: '閱讀體驗',
      'render-fix': '渲染修復',
      theme: '主題',
      layout: '版面',
      other: '其他',
    },
  },
  'en-US': {
    title: 'Plugin Marketplace',
    subtitle:
      "Declarative plugins maintained by the Voyager team that bring Voyager's polish to more AI sites. All free, and they auto-update with the extension.",
    requires: 'Requires Voyager 1.4.8 or later',
    official: 'by Voyager',
    source: 'View source',
    errorTitle: "Couldn't load the plugin list",
    errorBody: 'Check your connection and try again.',
    retry: 'Retry',
    hint: 'After installing Voyager, open its popup on a Claude or ChatGPT page, enable the plugin and allow access to the site — that’s it. Updates arrive automatically.',
    install: 'How to install Voyager',
    empty: 'No plugins yet — stay tuned.',
    disclaimer:
      'Claude, ChatGPT and other names and logos are trademarks of their respective owners. This marketplace is maintained by Voyager and is not affiliated with, or endorsed by, Anthropic or OpenAI.',
    howto: '🔎 How to open the popup?',
    howtoAlt:
      'Two steps to open the Voyager popup: ① click the browser Extensions (puzzle) icon ② pick Voyager from the list.',
    categories: {
      readability: 'Readability',
      'render-fix': 'Render fix',
      theme: 'Theme',
      layout: 'Layout',
      other: 'Other',
    },
  },
  'ja-JP': {
    title: 'プラグインマーケット',
    subtitle:
      'Voyager 公式チームが維持する宣言型プラグイン。Voyager の使い心地をより多くの AI サイトへ。すべて無料で、拡張機能とともに自動更新されます。',
    requires: 'Voyager 1.4.8 以降が必要です',
    official: 'Voyager 公式',
    source: 'ソースを見る',
    errorTitle: 'プラグイン一覧を読み込めませんでした',
    errorBody: '接続を確認して再試行してください。',
    retry: '再試行',
    hint: 'Voyager をインストールしたら、Claude や ChatGPT のページで Voyager のポップアップを開き、プラグインを有効化してサイトへのアクセスを許可するだけ。更新は自動で届きます。',
    install: 'Voyager のインストール方法',
    empty: 'プラグインはまだありません。お楽しみに。',
    disclaimer:
      'Claude、ChatGPT などの名称およびロゴは各所有者の商標です。本マーケットは Voyager が運営しており、Anthropic・OpenAI とは関係なく、承認も受けていません。',
    howto: '🔎 ポップアップの開き方は？',
    howtoAlt:
      'Voyager のポップアップを開く 2 ステップ：① ブラウザの拡張機能（パズル）アイコンをクリック ② 一覧から Voyager を選択。',
    categories: {
      readability: '読みやすさ',
      'render-fix': '表示修正',
      theme: 'テーマ',
      layout: 'レイアウト',
      other: 'その他',
    },
  },
  'ko-KR': {
    title: '플러그인 마켓플레이스',
    subtitle:
      'Voyager 팀이 직접 관리하는 선언형 플러그인. Voyager의 편안한 경험을 더 많은 AI 사이트로. 모두 무료이며 확장 프로그램과 함께 자동 업데이트됩니다.',
    requires: 'Voyager 1.4.8 이상이 필요합니다',
    official: 'Voyager 공식',
    source: '소스 보기',
    errorTitle: '플러그인 목록을 불러오지 못했습니다',
    errorBody: '연결을 확인한 후 다시 시도하세요.',
    retry: '다시 시도',
    hint: 'Voyager를 설치한 뒤 Claude 또는 ChatGPT 페이지에서 Voyager 팝업을 열고 플러그인을 켠 다음 사이트 접근을 허용하면 됩니다. 업데이트는 자동으로 제공됩니다.',
    install: 'Voyager 설치 방법',
    empty: '아직 플러그인이 없습니다. 기대해 주세요.',
    disclaimer:
      'Claude, ChatGPT 등의 이름과 로고는 각 소유자의 상표입니다. 본 마켓플레이스는 Voyager가 운영하며 Anthropic 또는 OpenAI와 제휴하거나 보증받지 않았습니다.',
    howto: '🔎 팝업을 여는 방법은?',
    howtoAlt:
      'Voyager 팝업을 여는 두 단계: ① 브라우저 확장 프로그램(퍼즐) 아이콘 클릭 ② 목록에서 Voyager 선택.',
    categories: {
      readability: '가독성',
      'render-fix': '렌더링 수정',
      theme: '테마',
      layout: '레이아웃',
      other: '기타',
    },
  },
  'fr-FR': {
    title: 'Marketplace des plugins',
    subtitle:
      "Des plugins déclaratifs maintenus par l'équipe Voyager qui apportent la finesse de Voyager à davantage de sites d'IA. Tous gratuits et mis à jour automatiquement avec l'extension.",
    requires: 'Nécessite Voyager 1.4.8 ou version ultérieure',
    official: 'par Voyager',
    source: 'Voir le code',
    errorTitle: 'Impossible de charger la liste des plugins',
    errorBody: 'Vérifiez votre connexion et réessayez.',
    retry: 'Réessayer',
    hint: 'Après avoir installé Voyager, ouvrez sa fenêtre sur une page Claude ou ChatGPT, activez le plugin et autorisez l’accès au site — c’est tout. Les mises à jour arrivent automatiquement.',
    install: 'Comment installer Voyager',
    empty: 'Aucun plugin pour le moment — restez à l’écoute.',
    disclaimer:
      'Claude, ChatGPT et les autres noms et logos sont des marques de leurs propriétaires respectifs. Cette marketplace est maintenue par Voyager et n’est ni affiliée à Anthropic ou OpenAI, ni approuvée par eux.',
    howto: '🔎 Comment ouvrir la fenêtre ?',
    howtoAlt:
      'Deux étapes pour ouvrir la fenêtre Voyager : ① cliquez sur l’icône Extensions (puzzle) du navigateur ② choisissez Voyager dans la liste.',
    categories: {
      readability: 'Lisibilité',
      'render-fix': 'Correctif de rendu',
      theme: 'Thème',
      layout: 'Mise en page',
      other: 'Autre',
    },
  },
  'es-ES': {
    title: 'Mercado de plugins',
    subtitle:
      'Plugins declarativos mantenidos por el equipo de Voyager que llevan la comodidad de Voyager a más sitios de IA. Todos gratis y se actualizan automáticamente con la extensión.',
    requires: 'Requiere Voyager 1.4.8 o posterior',
    official: 'de Voyager',
    source: 'Ver código',
    errorTitle: 'No se pudo cargar la lista de plugins',
    errorBody: 'Comprueba tu conexión e inténtalo de nuevo.',
    retry: 'Reintentar',
    hint: 'Tras instalar Voyager, abre su ventana en una página de Claude o ChatGPT, activa el plugin y permite el acceso al sitio. Las actualizaciones llegan automáticamente.',
    install: 'Cómo instalar Voyager',
    empty: 'Aún no hay plugins, muy pronto.',
    disclaimer:
      'Claude, ChatGPT y otros nombres y logotipos son marcas de sus respectivos propietarios. Este mercado lo mantiene Voyager y no está afiliado ni respaldado por Anthropic u OpenAI.',
    howto: '🔎 ¿Cómo abrir la ventana?',
    howtoAlt:
      'Dos pasos para abrir la ventana de Voyager: ① haz clic en el icono de Extensiones (pieza de puzle) del navegador ② elige Voyager en la lista.',
    categories: {
      readability: 'Legibilidad',
      'render-fix': 'Corrección de renderizado',
      theme: 'Tema',
      layout: 'Diseño',
      other: 'Otro',
    },
  },
  'pt-PT': {
    title: 'Mercado de plugins',
    subtitle:
      'Plugins declarativos mantidos pela equipa do Voyager que levam a fluidez do Voyager a mais sites de IA. Todos gratuitos e atualizados automaticamente com a extensão.',
    requires: 'Requer o Voyager 1.4.8 ou posterior',
    official: 'da Voyager',
    source: 'Ver código',
    errorTitle: 'Não foi possível carregar a lista de plugins',
    errorBody: 'Verifique a sua ligação e tente novamente.',
    retry: 'Tentar novamente',
    hint: 'Depois de instalar o Voyager, abra a sua janela numa página do Claude ou ChatGPT, ative o plugin e permita o acesso ao site. As atualizações chegam automaticamente.',
    install: 'Como instalar o Voyager',
    empty: 'Ainda não há plugins — fique atento.',
    disclaimer:
      'Claude, ChatGPT e outros nomes e logótipos são marcas dos respetivos proprietários. Este mercado é mantido pela Voyager e não tem qualquer afiliação ou aprovação da Anthropic ou da OpenAI.',
    howto: '🔎 Como abrir a janela?',
    howtoAlt:
      'Dois passos para abrir a janela do Voyager: ① clique no ícone de Extensões (peça de puzzle) do navegador ② escolha o Voyager na lista.',
    categories: {
      readability: 'Legibilidade',
      'render-fix': 'Correção de renderização',
      theme: 'Tema',
      layout: 'Disposição',
      other: 'Outro',
    },
  },
  'ar-SA': {
    title: 'سوق الإضافات',
    subtitle:
      'إضافات تعريفية يحافظ عليها فريق Voyager، تنقل سلاسة Voyager إلى مزيد من مواقع الذكاء الاصطناعي. جميعها مجانية وتُحدَّث تلقائيًا مع الامتداد.',
    requires: 'يتطلب الإصدار 1.4.8 من Voyager أو أحدث',
    official: 'من Voyager',
    source: 'عرض الكود',
    errorTitle: 'تعذّر تحميل قائمة الإضافات',
    errorBody: 'تحقق من اتصالك ثم أعد المحاولة.',
    retry: 'إعادة المحاولة',
    hint: 'بعد تثبيت Voyager، افتح نافذته على صفحة Claude أو ChatGPT، ثم فعّل الإضافة واسمح بالوصول إلى الموقع. تصل التحديثات تلقائيًا.',
    install: 'كيفية تثبيت Voyager',
    empty: 'لا توجد إضافات بعد — ترقّبوا المزيد.',
    disclaimer:
      'أسماء وشعارات Claude وChatGPT وغيرها علامات تجارية لأصحابها. يحافظ Voyager على هذا السوق، وهو غير مرتبط بـ Anthropic أو OpenAI ولا يحظى بموافقتهما.',
    howto: '🔎 كيف تفتح النافذة المنبثقة؟',
    howtoAlt:
      'خطوتان لفتح نافذة Voyager: ① انقر أيقونة الإضافات (قطعة الأحجية) في المتصفح ② اختر Voyager من القائمة.',
    categories: {
      readability: 'سهولة القراءة',
      'render-fix': 'إصلاح العرض',
      theme: 'السمة',
      layout: 'التخطيط',
      other: 'أخرى',
    },
  },
  'ru-RU': {
    title: 'Маркетплейс плагинов',
    subtitle:
      'Декларативные плагины, поддерживаемые командой Voyager, приносят удобство Voyager на другие сайты ИИ. Все бесплатны и обновляются автоматически вместе с расширением.',
    requires: 'Требуется Voyager 1.4.8 или новее',
    official: 'от Voyager',
    source: 'Исходный код',
    errorTitle: 'Не удалось загрузить список плагинов',
    errorBody: 'Проверьте подключение и повторите попытку.',
    retry: 'Повторить',
    hint: 'После установки Voyager откройте его всплывающее окно на странице Claude или ChatGPT, включите плагин и разрешите доступ к сайту. Обновления приходят автоматически.',
    install: 'Как установить Voyager',
    empty: 'Плагинов пока нет — следите за обновлениями.',
    disclaimer:
      'Claude, ChatGPT и другие названия и логотипы являются товарными знаками их владельцев. Этот маркетплейс поддерживается Voyager и не связан с Anthropic или OpenAI и не одобрен ими.',
    howto: '🔎 Как открыть всплывающее окно?',
    howtoAlt:
      'Два шага, чтобы открыть окно Voyager: ① нажмите значок расширений (пазл) в браузере ② выберите Voyager из списка.',
    categories: {
      readability: 'Читаемость',
      'render-fix': 'Исправление отображения',
      theme: 'Тема',
      layout: 'Макет',
      other: 'Другое',
    },
  },
};

// Brand logos ported verbatim from the extension popup (WebsiteLogos.tsx)
// so the marketplace uses the real Claude / ChatGPT / … marks.
const PLATFORM_ICONS: Record<string, { viewBox: string; path: string }> = {
  claude: {
    viewBox: '0 0 24 24',
    path: 'M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z',
  },
  chatgpt: {
    viewBox: '0 0 24 24',
    path: 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364l2.0201-1.1685a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z',
  },
  grok: {
    viewBox: '0 0 24 24',
    path: 'M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815',
  },
  gemini: {
    viewBox: '0 0 65 65',
    path: 'M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z',
  },
};

const t = computed(() => i18n[lang.value as string] || i18n['en-US']);
const installLink = computed(() =>
  withBase(`${localePrefix(lang.value as string)}/guide/installation`),
);
const contributeLink = computed(() =>
  withBase(`${localePrefix(lang.value as string)}/guide/plugin-contribution`),
);
const contribute = computed(() => CONTRIBUTE[localeKey(lang.value as string)] ?? CONTRIBUTE.en);

interface PluginCard {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  homepage?: string;
  official: boolean;
  platforms: ReturnType<typeof platformsFromMatches>;
  /** Single fused colour for borders/glow: one platform's colour, or a blend. */
  accent: string;
  /** The two brand colours (equal when single-platform) for gradient fills. */
  c1: string;
  c2: string;
  /** Up to two platform marks — rendered as "twins" when there are two. */
  icons: { viewBox: string; path: string; color: string }[];
}

const rawPlugins = ref<(PluginManifest & { official: boolean })[]>([]);
const loading = ref(true);
const failed = ref(false);

const cards = computed<PluginCard[]>(() => {
  const loc = localeKey(lang.value as string);
  // Native first-party plugins are always present; remote catalog plugins are
  // appended. Dedupe by id so a future overlap never renders twice.
  const seen = new Set<string>();
  const merged = [...NATIVE_PLUGINS, ...rawPlugins.value].filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  // One card per feature: per-site variants of the same feature (e.g. the
  // Claude / ChatGPT reading-width plugins) collapse into a single card that
  // carries the union of their platforms — matching how a genuinely multi-site
  // plugin (Formula Copy) already reads.
  return groupPluginsByFeature(merged).map((group) => {
    const primary = group[0];
    const localized = primary.i18n?.[loc];
    const platforms: PluginCard['platforms'] = [];
    const platformSeen = new Set<string>();
    for (const p of group) {
      for (const platform of platformsFromMatches(p.matches)) {
        if (platformSeen.has(platform.key)) continue;
        platformSeen.add(platform.key);
        platforms.push(platform);
      }
    }
    // Twin treatment: a card spanning two platforms fuses both brand colours
    // (gradient backdrop + blended accent) and shows both marks side by side.
    const colors = platforms.map((p) => p.color);
    const c1 = primary.theme?.brand || colors[0] || 'var(--vp-c-brand-1)';
    const c2 = colors[1] ?? c1;
    const icons = platforms
      .map((p) => {
        const mark = PLATFORM_ICONS[p.key];
        return mark ? { ...mark, color: p.color } : null;
      })
      .filter((m): m is { viewBox: string; path: string; color: string } => m !== null)
      .slice(0, 2);
    return {
      id: primary.id,
      name: displayName(localized?.name ?? primary.name),
      version: primary.version,
      description: localized?.description ?? primary.description,
      category: primary.category,
      homepage: primary.homepage,
      official: group.some((p) => p.official),
      platforms,
      accent: colors.length >= 2 ? `color-mix(in srgb, ${c1}, ${c2})` : c1,
      c1,
      c2,
      icons,
    };
  });
});

// Category filter — "all" plus every category present in the loaded cards, in
// first-seen order. The pill row hides itself when there is only one category.
const activeCat = ref('all');
const categories = computed<string[]>(() => {
  const found = ['all'];
  for (const c of cards.value) if (!found.includes(c.category)) found.push(c.category);
  return found;
});
const visibleCards = computed<PluginCard[]>(() =>
  activeCat.value === 'all'
    ? cards.value
    : cards.value.filter((c) => c.category === activeCat.value),
);
// Top two cards drive the hero preview stack (native plugins lead, so the
// showcase always has real content even before the remote catalog loads).
const previewCards = computed<PluginCard[]>(() => cards.value.slice(0, 2));

function countFor(category: string): number {
  return category === 'all'
    ? cards.value.length
    : cards.value.filter((c) => c.category === category).length;
}

function iconFor(key: string): { viewBox: string; path: string } | null {
  return PLATFORM_ICONS[key] ?? null;
}

function categoryLabel(category: string): string {
  return (
    t.value.categories[category] ||
    CATEGORY_FALLBACKS[localeKey(lang.value as string)]?.[category] ||
    t.value.categories.other
  );
}

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    const res = await fetch(MARKETPLACE_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('marketplace unavailable');
    const market = (await res.json()) as { plugins?: unknown };
    const entries = Array.isArray(market.plugins)
      ? (market.plugins as { name: string; source: string; official?: boolean }[])
      : [];
    const settled = await Promise.allSettled(
      entries.map(async (entry) => {
        const url = resolveSourceUrl(MARKETPLACE_URL, entry.source);
        const r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) throw new Error(`manifest unavailable: ${entry.name}`);
        const manifest = (await r.json()) as PluginManifest;
        return { ...manifest, official: entry.official === true };
      }),
    );
    const ok = settled
      .filter(
        (s): s is PromiseFulfilledResult<PluginManifest & { official: boolean }> =>
          s.status === 'fulfilled',
      )
      .map((s) => s.value);
    rawPlugins.value = ok;
    if (ok.length === 0 && entries.length > 0) failed.value = true;
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="gv-store">
    <!-- Split hero: message on the lead side, a live preview on the other -->
    <section class="gv-hero">
      <div class="gv-hero__copy">
        <h1 class="gv-hero__title">{{ t.title }}</h1>
        <p class="gv-hero__sub">{{ t.subtitle }}</p>
        <div class="gv-hero__actions">
          <a :href="installLink" class="gv-cta">
            {{ t.install }}
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
          <span class="gv-req">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
              <path
                d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linejoin="round"
              />
            </svg>
            {{ t.requires }}
          </span>
        </div>
        <p class="gv-hero__hint">
          {{ t.hint }}
          <span v-if="t.howto" class="gv-howto" tabindex="0">
            {{ t.howto }}
            <span class="gv-howto__pop" role="tooltip">
              <img
                :src="withBase('/assets/plugin-popup-guide.png')"
                :alt="t.howtoAlt"
                loading="lazy"
              />
            </span>
          </span>
        </p>
      </div>

      <div class="gv-showcase" aria-hidden="true">
        <span class="gv-showcase__glow" />
        <div class="gv-showcase__stack">
          <article
            v-for="(card, i) in previewCards"
            :key="card.id"
            class="gv-mini"
            :style="{
              '--gv-accent': card.accent,
              '--gv-c1': card.c1,
              '--gv-c2': card.c2,
              '--i': i,
            }"
          >
            <span class="gv-mini__icon" :class="{ 'gv-mini__icon--twin': card.icons.length > 1 }">
              <template v-if="card.icons.length > 1">
                <span
                  v-for="(ic, j) in card.icons"
                  :key="j"
                  class="gv-twin"
                  :class="j === 0 ? 'gv-twin--a' : 'gv-twin--b'"
                  :style="{ color: ic.color }"
                >
                  <svg :viewBox="ic.viewBox" width="13" height="13" fill="currentColor">
                    <path :d="ic.path" />
                  </svg>
                </span>
              </template>
              <svg
                v-else-if="card.icons.length === 1"
                :viewBox="card.icons[0].viewBox"
                width="20"
                height="20"
                fill="currentColor"
              >
                <path :d="card.icons[0].path" />
              </svg>
            </span>
            <span class="gv-mini__text">
              <span class="gv-mini__name">{{ card.name }}</span>
              <span class="gv-mini__desc">{{ card.description }}</span>
            </span>
            <span class="gv-mini__switch"><span /></span>
          </article>
          <template v-if="previewCards.length === 0">
            <div v-for="n in 2" :key="'s' + n" class="gv-mini gv-mini--skeleton">
              <span class="gv-skel gv-skel--icon" />
              <span class="gv-mini__text">
                <span class="gv-skel gv-skel--line" style="width: 55%" />
                <span class="gv-skel gv-skel--line" style="width: 88%" />
              </span>
            </div>
          </template>
        </div>
      </div>
    </section>

    <!-- Category filter -->
    <nav v-if="categories.length > 1" class="gv-filter" :aria-label="t.title">
      <button
        v-for="cat in categories"
        :key="cat"
        type="button"
        class="gv-filter__pill"
        :class="{ 'is-active': activeCat === cat }"
        :aria-pressed="activeCat === cat"
        @click="activeCat = cat"
      >
        {{ categoryLabel(cat) }}
        <span class="gv-filter__n">{{ countFor(cat) }}</span>
      </button>
    </nav>

    <!-- Cards -->
    <div class="gv-grid">
      <article
        v-for="card in visibleCards"
        :key="card.id"
        class="gv-card"
        :style="{ '--gv-accent': card.accent, '--gv-c1': card.c1, '--gv-c2': card.c2 }"
      >
        <div class="gv-card__top">
          <span class="gv-card__icon" :class="{ 'gv-card__icon--twin': card.icons.length > 1 }">
            <template v-if="card.icons.length > 1">
              <span
                v-for="(ic, i) in card.icons"
                :key="i"
                class="gv-twin"
                :class="i === 0 ? 'gv-twin--a' : 'gv-twin--b'"
                :style="{ color: ic.color }"
              >
                <svg
                  :viewBox="ic.viewBox"
                  width="15"
                  height="15"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path :d="ic.path" />
                </svg>
              </span>
            </template>
            <svg
              v-else-if="card.icons.length === 1"
              :viewBox="card.icons[0].viewBox"
              width="24"
              height="24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path :d="card.icons[0].path" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
              <path
                d="M10 3a2 2 0 0 1 2 2v1a1 1 0 0 0 2 0V5a2 2 0 1 1 4 0v2h2v3h-1a2 2 0 1 0 0 4h1v3h-3v-1a2 2 0 1 0-4 0v1h-3a2 2 0 0 1-2-2v-2H4a2 2 0 1 1 0-4h1V9a2 2 0 0 1 2-2h1"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="gv-card__head">
            <span class="gv-card__name">{{ card.name }}</span>
            <span class="gv-card__meta"
              >v{{ card.version }} · {{ categoryLabel(card.category) }}</span
            >
          </span>
          <span v-if="card.official" class="gv-card__badge">{{ t.official }}</span>
        </div>

        <p class="gv-card__desc">{{ card.description }}</p>

        <div class="gv-card__foot">
          <span class="gv-card__plats">
            <span
              v-for="p in card.platforms"
              :key="p.key"
              class="gv-plat"
              :style="{ '--gv-plat': p.color }"
            >
              <svg
                v-if="iconFor(p.key)"
                :viewBox="iconFor(p.key).viewBox"
                width="13"
                height="13"
                fill="currentColor"
                aria-hidden="true"
              >
                <path :d="iconFor(p.key).path" />
              </svg>
              {{ p.label }}
            </span>
          </span>
          <a
            v-if="card.homepage"
            :href="card.homepage"
            target="_blank"
            rel="noopener noreferrer"
            class="gv-card__src"
          >
            {{ t.source }}
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
        </div>
      </article>

      <!-- Loading skeletons append after whatever is already loaded -->
      <template v-if="loading">
        <div v-for="n in 3" :key="'g' + n" class="gv-card gv-card--skeleton" aria-hidden="true">
          <div class="gv-skel gv-skel--icon" />
          <div class="gv-skel gv-skel--line" style="width: 55%" />
          <div class="gv-skel gv-skel--line" style="width: 100%" />
          <div class="gv-skel gv-skel--line" style="width: 78%" />
        </div>
      </template>

      <!-- Contribute tile: a quiet, elegant invite that lives in the grid -->
      <a v-if="!loading" :href="contributeLink" class="gv-contribute">
        <span class="gv-contribute__icon">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13.5 7l-3 10" />
          </svg>
        </span>
        <span class="gv-contribute__title">{{ contribute.title }}</span>
        <span class="gv-contribute__body">{{ contribute.body }}</span>
        <span class="gv-contribute__cta">
          {{ contribute.cta }}
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </a>
    </div>

    <!-- States only when nothing is showing -->
    <div v-if="!loading && visibleCards.length === 0" class="gv-state">
      <p v-if="failed" class="gv-state__title">{{ t.errorTitle }}</p>
      <p class="gv-state__body">{{ failed ? t.errorBody : t.empty }}</p>
      <button v-if="failed" type="button" class="gv-cta gv-cta--ghost" @click="load">
        {{ t.retry }}
      </button>
    </div>

    <p class="gv-disclaimer">{{ t.disclaimer }}</p>
  </div>
</template>

<style scoped>
.gv-store {
  max-width: 1180px;
  margin: 0 auto;
  padding: 56px 24px 96px;
}

/* ---- Split hero ---------------------------------------------------------- */
.gv-hero {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  align-items: center;
  gap: 48px;
  padding: 24px 0 8px;
  animation: gv-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.gv-hero__copy {
  text-align: start;
}

.gv-hero__title {
  margin: 0;
  font-size: clamp(34px, 5vw, 52px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.08;
  color: var(--vp-c-text-1);
}

.gv-hero__sub {
  max-width: 46ch;
  margin: 18px 0 0;
  font-size: 17px;
  line-height: 1.65;
  color: var(--vp-c-text-2);
}

.gv-hero__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 26px;
}

.gv-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 650;
  color: #fff;
  background: var(--vp-c-brand-1);
  transition:
    transform 0.18s ease,
    background 0.18s ease;
}

.gv-cta:hover {
  transform: translateY(-1px);
  background: var(--vp-c-brand-2);
}

.gv-cta:active {
  transform: translateY(0);
}

.gv-cta--ghost {
  color: var(--vp-c-text-1);
  background: transparent;
  border: 1px solid var(--vp-c-divider);
}

.gv-cta--ghost:hover {
  background: var(--vp-c-bg-soft);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 50%, var(--vp-c-divider));
}

.gv-req {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}

.gv-hero__hint {
  max-width: 52ch;
  margin: 22px 0 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}

/* Hover-reveal "how to open the popup" preview */
.gv-howto {
  position: relative;
  margin-inline-start: 8px;
  color: var(--vp-c-brand-1);
  font-weight: 600;
  white-space: nowrap;
  cursor: help;
  border-bottom: 1px dashed currentColor;
  outline: none;
}

.gv-howto__pop {
  position: absolute;
  top: calc(100% + 12px);
  inset-inline-start: 0;
  width: 268px;
  padding: 8px;
  border-radius: 14px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  box-shadow: 0 18px 48px -18px rgba(0, 0, 0, 0.5);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-6px) scale(0.97);
  transform-origin: top center;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease,
    visibility 0.18s;
  pointer-events: none;
  z-index: 30;
}

.gv-howto__pop img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
}

.gv-howto:hover .gv-howto__pop,
.gv-howto:focus .gv-howto__pop {
  opacity: 1;
  visibility: visible;
  transform: translateY(0) scale(1);
}

/* ---- Hero showcase (right) ----------------------------------------------- */
.gv-showcase {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 280px;
}

.gv-showcase__glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(
    60% 60% at 60% 40%,
    color-mix(in srgb, var(--vp-c-brand-1) 22%, transparent),
    transparent 72%
  );
  filter: blur(46px);
  opacity: 0.8;
}

.gv-showcase__stack {
  display: grid;
  gap: 14px;
  width: min(380px, 100%);
}

.gv-mini {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 13px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  box-shadow: 0 16px 40px -24px
    color-mix(in srgb, var(--gv-accent, var(--vp-c-brand-1)) 60%, transparent);
  transform: translateX(calc(var(--i, 0) * 18px));
  animation: gv-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--i, 0) * 90ms + 120ms);
}

.gv-mini__icon {
  position: relative;
  flex: none;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: var(--gv-c1, var(--gv-accent));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--gv-c1, var(--gv-accent)) 16%, transparent),
    color-mix(in srgb, var(--gv-c2, var(--gv-accent)) 16%, transparent)
  );
}

.gv-mini__text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gv-mini__name {
  font-size: 14px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.gv-mini__desc {
  font-size: 12px;
  color: var(--vp-c-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gv-mini__switch {
  flex: none;
  width: 32px;
  height: 18px;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 2px;
}

.gv-mini__switch span {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
}

/* ---- Category filter ----------------------------------------------------- */
.gv-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 36px 0 28px;
}

.gv-filter__pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  transition:
    color 0.18s ease,
    background 0.18s ease,
    border-color 0.18s ease;
}

.gv-filter__pill:hover {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 45%, var(--vp-c-divider));
}

.gv-filter__pill.is-active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 40%, transparent);
}

.gv-filter__n {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-3);
}

.gv-filter__pill.is-active .gv-filter__n {
  color: inherit;
}

/* ---- Cards --------------------------------------------------------------- */
.gv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 18px;
}

.gv-card {
  display: flex;
  flex-direction: column;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.gv-card:hover {
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--gv-accent) 60%, var(--vp-c-divider));
  box-shadow: 0 14px 36px -18px color-mix(in srgb, var(--gv-accent) 55%, transparent);
}

.gv-card__top {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.gv-card__icon {
  position: relative;
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: var(--gv-c1, var(--gv-accent));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--gv-c1, var(--gv-accent)) 16%, transparent),
    color-mix(in srgb, var(--gv-c2, var(--gv-accent)) 16%, transparent)
  );
}

/* Twin marks: two platform logos as overlapping discs on the fused backdrop */
.gv-twin {
  position: absolute;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--vp-c-bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 38%, transparent);
}

.gv-twin--a {
  z-index: 2;
  transform: translateX(-7px);
}

.gv-twin--b {
  z-index: 1;
  transform: translateX(7px);
}

.gv-mini__icon--twin .gv-twin {
  width: 22px;
  height: 22px;
}

.gv-mini__icon--twin .gv-twin--a {
  transform: translateX(-6px);
}

.gv-mini__icon--twin .gv-twin--b {
  transform: translateX(6px);
}

.gv-card__head {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gv-card__name {
  font-size: 15.5px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--vp-c-text-1);
}

.gv-card__meta {
  font-size: 12px;
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
}

.gv-card__badge {
  flex: none;
  align-self: center;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.gv-card__desc {
  margin: 0 0 16px;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gv-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--vp-c-divider);
}

.gv-card__plats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.gv-plat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 7px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-mute);
  border: 1px solid var(--vp-c-divider);
}

.gv-plat svg {
  color: var(--gv-plat);
}

.gv-card__src {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--vp-c-text-3);
  white-space: nowrap;
  transition: color 0.2s ease;
}

.gv-card__src:hover {
  color: var(--vp-c-brand-1);
}

/* ---- Contribute tile ----------------------------------------------------- */
.gv-contribute {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  min-height: 168px;
  padding: 24px 22px;
  border: 1px dashed color-mix(in srgb, var(--vp-c-text-3) 32%, transparent);
  border-radius: 16px;
  background: transparent;
  text-decoration: none;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.2s ease;
}

.gv-contribute:hover {
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 55%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 6%, transparent);
}

.gv-contribute__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  margin-bottom: 2px;
  border-radius: 12px;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.gv-contribute__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.gv-contribute__body {
  max-width: 30ch;
  font-size: 13px;
  line-height: 1.55;
  color: var(--vp-c-text-3);
}

.gv-contribute__cta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
}

/* ---- States -------------------------------------------------------------- */
.gv-state {
  text-align: center;
  padding: 64px 24px;
  color: var(--vp-c-text-2);
}

.gv-state__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--vp-c-text-1);
  margin: 0 0 6px;
}

.gv-state__body {
  margin: 0 0 18px;
}

.gv-disclaimer {
  max-width: 760px;
  margin: 48px auto 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
  text-align: center;
}

/* ---- Skeleton ------------------------------------------------------------ */
.gv-card--skeleton {
  gap: 12px;
}

.gv-skel {
  display: block;
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    var(--vp-c-bg-mute) 25%,
    var(--vp-c-bg-soft) 50%,
    var(--vp-c-bg-mute) 75%
  );
  background-size: 200% 100%;
  animation: gv-shimmer 1.4s ease-in-out infinite;
}

.gv-skel--icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
}

.gv-mini .gv-skel--icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
}

.gv-skel--line {
  height: 13px;
}

@keyframes gv-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@keyframes gv-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ---- Responsive ---------------------------------------------------------- */
@media (max-width: 880px) {
  .gv-hero {
    grid-template-columns: 1fr;
    gap: 8px;
    padding-top: 8px;
  }

  .gv-showcase {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gv-hero,
  .gv-mini,
  .gv-card,
  .gv-skel,
  .gv-cta,
  .gv-filter__pill,
  .gv-contribute {
    transition: none;
    animation: none;
    transform: none;
  }
}
</style>
