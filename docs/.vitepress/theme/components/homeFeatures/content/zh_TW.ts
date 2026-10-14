import type { HomeFeaturesContent } from '../types';

export const zhTW: HomeFeaturesContent = {
  timeline: {
    eyebrow: '時間軸',
    title: '別再滑了，用飛的。',
    body: '右側每個圓點都是你問過的一句話。滑鼠移上去就知道是哪句，點一下直接跳過去；在軌道上停一下，旁邊會出現列表按鈕，展開就是整段對話的總覽，還能搜尋。',
    hint: '試試看：點圓點 · 長按加星 · 停在軌道上打開總覽',
    overview: '開啟對話總覽',
    searchPlaceholder: '搜尋這段對話',
    noMatch: '沒有符合「{q}」的提問',
  },
  folders: {
    eyebrow: '資料夾',
    title: '給思想安個家。',
    body: '就長在 Gemini 側邊欄裡，兩層巢狀，星標置頂，還能搜尋。',
    hint: '試試看：點另一個對話 · 拖進資料夾 · 搜尋「貓」',
    heading: '資料夾',
    searchPlaceholder: '搜尋資料夾和對話',
    newFolder: '新資料夾',
    noMatch: '沒有符合「{q}」的資料夾或對話',
    star: '加星標',
  },
  prompts: {
    eyebrow: '提示詞庫',
    title: '捕捉靈光。',
    body: '常用的話存一次，在 Gemini、ChatGPT、Claude、DeepSeek 裡都叫得出來。',
    hint: '試試看：點一則，它會填進左邊的輸入框，再按傳送',
    add: '新增',
    searchPlaceholder: '搜尋 prompt 或標籤',
    all: '全部',
    saved: '收藏庫',
    settings: '設定',
    noMatch: '沒有符合「{q}」的提示詞',
  },
  composer: { placeholder: '從右邊的提示詞庫挑一則', send: '傳送', ball: '開啟提示詞庫' },
  replyLeads: {
    table: '整理好了：',
    summary: '三點總結：',
    todo: '照著這份一項一項打勾就好：',
    plain: '白話來說：',
  },
  chats: {
    kyoto: {
      title: '京都三天怎麼玩',
      star: true,
      starred: [3],
      turns: [
        [
          '十一月要去京都，三天行程怎麼排？',
          '十一月剛好是紅葉季，建議按區域分三天走：\n- 第一天東山：清水寺、二年坂、八坂神社\n- 第二天嵐山：竹林小徑、天龍寺、嵯峨野小火車\n- 第三天伏見稻荷，下午回市區逛錦市場',
        ],
        [
          '清水寺幾點去人比較少？',
          '早上 6 點開門到 7 點之間人最少，晨光照在清水舞台上也最漂亮。9 點以後旅行團就陸續到了。',
        ],
        ['嵐山小火車要先訂嗎？', '紅葉季建議一個月前就在官網訂位，坐右側可以看到保津川峽谷。'],
        [
          '住哪一區交通最方便？',
          '京都車站或四條河原町附近。京都車站去伏見、嵐山都順路；河原町晚上吃飯、逛街比較方便。',
        ],
        [
          '推薦幾家不用排隊的拉麵',
          '避開中午 12 點和晚上 6 點的用餐尖峰，大部分店都不太需要排。河原町附近的在地小店，晚上 9 點後通常直接就能入座。',
        ],
      ],
      extra: {
        table: [
          ['天', '上午', '下午'],
          ['第一天', '清水寺', '二年坂、八坂神社'],
          ['第二天', '竹林小徑', '天龍寺、小火車'],
          ['第三天', '伏見稻荷', '錦市場'],
        ],
        summary: [
          '紅葉季按東山、嵐山、伏見分三天走',
          '清水寺早上 6 到 7 點去，小火車一個月前先訂',
          '住京都車站或河原町，吃飯避開尖峰就不用排',
        ],
        translation:
          'Avoid the noon and 6 pm rush and most ramen shops have little or no line. Around Kawaramachi, small local spots usually seat you right away after 9 pm.',
        todo: [
          '訂嵐山小火車（一個月前）',
          '訂京都車站附近的飯店',
          '查清水寺開門時間',
          '買一張 ICOCA 卡',
        ],
      },
    },
    packing: {
      title: '出發前行李清單',
      turns: [
        [
          '十一月的京都要帶厚外套嗎？',
          '早晚大約 8 度，白天 15 度上下。帶一件輕羽絨或刷毛外套就夠了，裡面穿長袖。',
        ],
        [
          '日本的插頭跟台灣一樣嗎？',
          '一樣是兩根扁腳的 A 型插頭，電壓 100V，跟台灣的 110V 差不多。手機和筆電的充電器多半支援 100–240V，直接插就能用，不用帶轉接頭。',
        ],
        [
          '西瓜卡跟 ICOCA 哪個好？',
          '兩張在關西都能用。ICOCA 在關西比較普遍，在京都車站的售票機就買得到。',
        ],
      ],
      extra: {
        table: [
          ['物品', '要不要帶', '備註'],
          ['輕羽絨', '要', '早晚 8 度'],
          ['轉接頭', '不用', '台灣插頭直接用'],
          ['交通卡', '到了再買', 'ICOCA'],
        ],
        summary: [
          '帶輕羽絨或刷毛外套，裡面穿長袖',
          '插頭一樣是 A 型，不用轉接頭',
          '交通卡到京都車站買 ICOCA',
        ],
        translation:
          'Both work in Kansai, but ICOCA is more common there. You can buy one from the ticket machines at Kyoto Station.',
        todo: ['輕羽絨外套', '長袖兩件', '充電器和行動電源', '護照和訂房確認信'],
      },
    },
    dinner: {
      title: '冰箱剩下的菜能煮什麼',
      turns: [
        [
          '冰箱裡有雞蛋、番茄、半顆洋蔥，晚餐煮什麼好？',
          '洋蔥番茄炒蛋最快，十分鐘就能上桌：先把蛋炒到半熟盛起來，再炒洋蔥和番茄炒出湯汁，最後把蛋倒回去拌勻。',
        ],
        [
          '還想要一碗湯',
          '剩下的番茄可以煮番茄蛋花湯：番茄炒軟後加水煮滾，淋上一顆蛋液，起鍋前加點鹽。',
        ],
        ['沒有蔥可以嗎？', '可以，起鍋前撒點黑胡椒或滴幾滴香油，一樣很香。'],
      ],
      extra: {
        table: [
          ['菜', '材料', '時間'],
          ['洋蔥番茄炒蛋', '雞蛋 3 顆、番茄 1 顆、洋蔥半顆', '10 分鐘'],
          ['番茄蛋花湯', '番茄 1 顆、雞蛋 1 顆', '8 分鐘'],
        ],
        summary: ['主菜做洋蔥番茄炒蛋', '湯煮番茄蛋花湯', '沒有蔥就用黑胡椒或香油提味'],
        translation:
          'Sure. A pinch of black pepper or a few drops of sesame oil right before serving smells just as good.',
        todo: ['煮飯', '炒蛋盛起', '炒番茄洋蔥', '煮蛋花湯'],
      },
    },
    week: {
      title: '一週便當菜單',
      turns: [
        [
          '幫我排一週的便當菜單，不要太麻煩',
          '週末一次備好三道主菜：滷雞腿、番茄燉牛腩、蒜炒綠花椰，分裝冷凍。平日每天拿一盒主菜，配一份新煮的白飯就好。',
        ],
        [
          '每天能控制在 100 元以內嗎？',
          '可以。雞腿和牛腩買大包裝、綠花椰挑當季的，算下來一份大約 70 元。',
        ],
      ],
      extra: {
        table: [
          ['星期', '主菜'],
          ['週一', '滷雞腿'],
          ['週二', '番茄燉牛腩'],
          ['週三', '滷雞腿'],
          ['週四', '番茄燉牛腩'],
          ['週五', '蒜炒綠花椰配雞腿'],
        ],
        summary: ['週末一次備好三道主菜，分裝冷凍', '平日只要煮飯', '一份大約 70 元'],
        translation:
          'Yes. Buy chicken legs and beef brisket in large packs and pick broccoli in season, and each lunch comes to about NT$70.',
        todo: ['買雞腿 6 支', '買牛腩 1 公斤', '買綠花椰 3 顆', '準備 10 個便當盒'],
      },
    },
    landlord: {
      title: '跟房東說熱水器壞了',
      turns: [
        [
          '熱水器壞了，要怎麼跟房東說比較好？',
          '先講清楚狀況和從什麼時候開始，再問對方哪天方便請師傅來修，最後說明自己可以配合的時間。',
        ],
        [
          '幫我寫一則 LINE 訊息',
          '陳先生您好，家裡的熱水器從昨晚開始點不著火，一直沒有熱水。想麻煩您這兩天安排師傅來看一下，我平日晚上和週末都在家，時間可以配合。謝謝！',
        ],
      ],
      extra: {
        table: [
          ['要說的', '怎麼說'],
          ['狀況', '從昨晚開始點不著火'],
          ['請求', '安排師傅來修'],
          ['配合', '平日晚上和週末都在家'],
        ],
        summary: ['先說狀況和開始的時間', '再請房東安排維修', '最後說明自己能配合的時間'],
        translation:
          "Hi Mr. Chen, the water heater hasn't been able to ignite since last night, so there's no hot water. Could you have someone come take a look in the next couple of days? I'm home on weekday evenings and weekends, so I can work around your schedule. Thanks!",
        todo: ['錄一段熱水器點不著的影片', '傳 LINE 給房東', '約好維修時間'],
      },
    },
    run: {
      title: '跑步膝蓋痛',
      turns: [
        [
          '最近跑步膝蓋外側會痛，還能繼續跑嗎？',
          '膝蓋外側痛常跟髂脛束太緊有關。建議先停跑三到五天，等不痛了再從短距離慢跑開始恢復。如果連走路都會痛，最好去看骨科或復健科。',
        ],
        [
          '有什麼伸展動作？',
          '- 用滾筒放鬆大腿外側，每邊兩分鐘\n- 站姿交叉腿側伸展，每邊 30 秒\n- 側躺抬腿練臀中肌，每邊 15 下',
        ],
      ],
      extra: {
        table: [
          ['動作', '時間或次數'],
          ['滾筒放鬆', '每邊 2 分鐘'],
          ['交叉腿側伸展', '每邊 30 秒'],
          ['側躺抬腿', '每邊 15 下'],
        ],
        summary: ['外側痛多半是髂脛束太緊', '先停跑三到五天', '每天滾筒放鬆加臀中肌訓練'],
        translation:
          '- Foam-roll the outer thigh, 2 minutes per side\n- Standing cross-leg side stretch, 30 seconds per side\n- Side-lying leg raises for the glutes, 15 reps per side',
        todo: ['停跑三天', '每天用滾筒放鬆', '每天側躺抬腿 3 組', '恢復後先跑 3 公里'],
      },
    },
    cat: {
      title: '貓咪最近不太吃飯',
      turns: [
        [
          '貓咪這兩天不太吃飼料，正常嗎？',
          '先觀察牠的精神、喝水和上廁所是否正常。如果精神不錯、只是挑嘴，可以換個口味試試；如果超過 24 小時完全不吃，要盡快帶去看獸醫。',
        ],
        [
          '換飼料要怎麼過渡？',
          '用七天慢慢換：前兩天新飼料佔四分之一，中間三天各一半，最後兩天新飼料佔四分之三。',
        ],
      ],
      extra: {
        table: [
          ['天數', '新飼料比例'],
          ['第 1–2 天', '25%'],
          ['第 3–5 天', '50%'],
          ['第 6–7 天', '75%'],
        ],
        summary: ['先看精神、喝水和上廁所', '超過 24 小時不吃就去看獸醫', '換飼料用七天慢慢過渡'],
        translation:
          'Switch over seven days: a quarter new food for the first two days, half for the next three, and three quarters for the last two.',
        todo: ['記錄今天吃了多少', '買一小包新口味', '照七天比例換飼料'],
      },
    },
    headphones: {
      title: '降噪耳機怎麼挑',
      turns: [
        [
          '通勤用的降噪耳機要怎麼挑？',
          '先訂預算，再看三點：降噪強度、配戴舒適度、續航力。搭捷運通勤的話降噪優先；如果每天要戴一兩個小時以上，舒適度更重要。',
        ],
        [
          '戴眼鏡會有影響嗎？',
          '會。耳罩式的耳罩會壓到鏡腳，影響密合和降噪效果；戴眼鏡的話入耳式比較友善。',
        ],
      ],
      extra: {
        table: [
          ['類型', '降噪', '戴眼鏡'],
          ['耳罩式', '較強', '會壓到鏡腳'],
          ['入耳式', '夠用', '不受影響'],
        ],
        summary: ['先訂預算', '搭捷運通勤優先看降噪', '戴眼鏡選入耳式'],
        translation:
          'Yes. Over-ear cups press on the arms of your glasses, which breaks the seal and weakens noise cancelling. In-ear buds are the easier choice if you wear glasses.',
        todo: ['訂好預算', '去門市試戴兩款', '比較續航力和充電盒大小'],
      },
    },
  },
  tree: [
    {
      folder: '旅行',
      open: true,
      kids: [{ folder: '京都', open: true, kids: [{ chat: 'kyoto' }, { chat: 'packing' }] }],
    },
    { folder: '下廚', kids: [{ chat: 'dinner' }, { chat: 'week' }] },
    { chat: 'landlord' },
    { chat: 'run' },
    { chat: 'cat' },
    { chat: 'headphones' },
  ],
  current: 'kyoto',
  promptList: [
    { name: '整理成表格', tag: '整理', text: '把上面的內容整理成一張表格。', reply: 'table' },
    { name: '總結成三點', tag: '整理', text: '把這段對話總結成三點。', reply: 'summary' },
    { name: '列成待辦清單', tag: '整理', text: '列一份可以打勾的待辦清單。', reply: 'todo' },
    {
      name: '翻成道地英文',
      tag: '翻譯',
      text: '把你上一則回答翻成道地的英文。',
      reply: 'translate',
    },
    { name: '說得再白話一點', tag: '學東西', text: '用一句白話再說一次。', reply: 'plain' },
  ],
  groups: [
    {
      title: '視覺體驗',
      items: [
        { icon: 'move-horizontal', name: '對話寬度', detail: '拉寬對話區，程式碼和表格不再折行' },
        { icon: 'a-large-small', name: '字體大小', detail: '單獨調整聊天字級' },
        { icon: 'clock-3', name: '訊息時間戳', detail: '每則訊息標上傳送時間' },
        { icon: 'workflow', name: 'Mermaid 圖表', detail: '流程圖、循序圖直接呈現' },
        { icon: 'snowflake,rain,sakura', name: '視覺特效', detail: '飄雪、下雨、櫻花' },
      ],
    },
    {
      title: '資料歸你',
      items: [
        { icon: 'file-down', name: '對話匯出', detail: 'Markdown、PDF、JSON、圖片' },
        { icon: 'microscope', name: 'Deep Research 匯出', detail: '連同思考過程和引用連結' },
        { icon: 'cloud', name: '雲端同步', detail: 'Google Drive；Safari 用 iCloud' },
        { icon: 'list-x', name: '批次刪除', detail: '勾選多個對話，一次刪掉' },
        { icon: 'image', name: '去除浮水印', detail: 'Nano Banana 生成的圖片無損還原' },
      ],
    },
    {
      title: '簡化操作',
      items: [
        { icon: 'quote', name: '引用回覆', detail: '選取一段，直接引用追問' },
        { icon: 'corner-down-left', name: '傳送行為', detail: 'Enter 換行，Ctrl+Enter 傳送' },
        { icon: 'star', name: '預設模型', detail: '新對話自動切到常用模型' },
        { icon: 'git-branch', name: '對話分支', detail: '從任一輪分岔，換個問法試試' },
        { icon: 'sigma', name: '公式複製', detail: '點一下就複製 LaTeX 或 Word 公式' },
      ],
    },
    {
      title: '開放生態',
      items: [
        { icon: 'puzzle', name: '外掛市集', detail: '官方和社群外掛，一鍵安裝' },
        { icon: 'globe', name: '多站通用', detail: 'Claude、ChatGPT、DeepSeek 也能用' },
        { icon: 'monitor', name: '本機 Web UI', detail: '提示詞庫也能用在 OpenCode 等本機介面' },
        { icon: 'code', name: '連接 IDE', detail: '把對話上下文同步給 VS Code' },
        { icon: 'panel-left-close', name: '側邊欄自動收起', detail: '滑鼠移開就收起，專心看對話' },
      ],
    },
  ],
};
