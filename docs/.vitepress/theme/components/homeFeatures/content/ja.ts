import type { HomeFeaturesContent } from '../types';

export const ja: HomeFeaturesContent = {
  timeline: {
    eyebrow: 'タイムライン',
    title: 'スクロールせず、ひとっ飛び。',
    body: '右側の点ひとつひとつが、あなたの質問です。カーソルを合わせれば中身がわかり、クリックすればそこへジャンプ。レールの上で少し止まるとリストボタンが現れ、会話全体の一覧を開いて検索もできます。',
    hint: '試してみて：点をクリック · 長押しでスター · レールにカーソルを合わせて一覧を開く',
    overview: '会話の一覧を開く',
    searchPlaceholder: 'この会話を検索',
    noMatch: '「{q}」に一致する質問はありません',
  },
  folders: {
    eyebrow: 'フォルダ',
    title: '思考に家を与える。',
    body: 'Gemini のサイドバーにそのまま溶け込みます。2階層まで入れ子にでき、スター付きは上に固定、検索もできます。',
    hint: '試してみて：別の会話をクリック · フォルダへドラッグ · 「猫」で検索',
    heading: 'フォルダ',
    searchPlaceholder: 'フォルダとチャットを検索',
    newFolder: '新しいフォルダ',
    noMatch: '「{q}」に一致するフォルダやチャットはありません',
    star: 'スター',
  },
  prompts: {
    eyebrow: 'プロンプトライブラリ',
    title: 'ひらめきを、逃さない。',
    body: 'よく使うプロンプトは一度保存すれば、Gemini・ChatGPT・Claude・DeepSeek のどこでも呼び出せます。',
    hint: '試してみて：1つ選ぶと左の入力欄に入るので、そのまま送信',
    add: '追加',
    searchPlaceholder: 'プロンプトまたはタグを検索',
    all: 'すべて',
    saved: '保存済み',
    settings: '設定',
    noMatch: '「{q}」に一致するプロンプトはありません',
  },
  composer: {
    placeholder: '右のライブラリからプロンプトを選択',
    send: '送信',
    ball: 'プロンプトライブラリを開く',
  },
  demo: { replay: 'もう一度', close: 'デモを終了' },
  replyLeads: {
    table: '表にまとめました：',
    summary: '3つのポイントにまとめると：',
    todo: 'ひとつずつチェックしていきましょう：',
    plain: 'ひと言でいうと：',
  },
  chats: {
    kyoto: {
      title: '京都2泊3日の回り方',
      star: true,
      starred: [3],
      turns: [
        [
          '11月に京都へ行きます。3日間でどう回るのがいい？',
          '11月はちょうど紅葉シーズン。エリアごとに1日ずつ回るのがおすすめです：\n- 1日目 東山：清水寺、二年坂、八坂神社\n- 2日目 嵐山：竹林の小径、天龍寺、トロッコ列車\n- 3日目 伏見稲荷、午後は市内に戻って錦市場',
        ],
        [
          '清水寺が空いている時間は？',
          '開門直後の朝6時から7時ごろがいちばん空いています。朝日が差し込む清水の舞台もきれいです。9時を過ぎると団体客が増えてきます。',
        ],
        [
          'トロッコ列車は予約したほうがいい？',
          '紅葉シーズンは、1か月前の発売開始に合わせて公式サイトで予約しておくと安心です。保津川の渓谷を眺めるなら右側の席がおすすめ。',
        ],
        [
          'どのエリアに泊まると移動がラク？',
          '京都駅か四条河原町のあたりです。京都駅は伏見や嵐山へのアクセスがよく、河原町は夜ごはんや街歩きに便利です。',
        ],
        [
          '並ばずに入れるラーメン屋ってある？',
          '12時と18時のピークを外せば、たいていの店は並ばずに入れます。河原町周辺の地元の小さな店なら、夜9時以降はほぼ待たずに入れます。',
        ],
      ],
      extra: {
        table: [
          ['日', '午前', '午後'],
          ['1日目', '清水寺', '二年坂・八坂神社'],
          ['2日目', '竹林の小径', '天龍寺・トロッコ列車'],
          ['3日目', '伏見稲荷', '錦市場'],
        ],
        summary: [
          '紅葉シーズンは東山・嵐山・伏見を1日ずつ',
          '清水寺は朝6〜7時、トロッコ列車は1か月前に予約',
          '京都駅か河原町に泊まり、食事はピークを外す',
        ],
        translation:
          'Skip the noon and 6 pm peaks and most ramen shops have no line. Around Kawaramachi, small local places usually let you walk straight in after 9 pm.',
        todo: [
          'トロッコ列車を予約（1か月前）',
          '京都駅近くのホテルを予約',
          '清水寺の拝観時間を確認',
          '交通系 IC カードをチャージ',
        ],
      },
    },
    packing: {
      title: '旅行の持ち物リスト',
      turns: [
        [
          '11月の京都、厚手のコートはいる？',
          '朝晩は8度前後、日中は15度くらいです。薄手のダウンかフリースに長袖で十分です。',
        ],
        [
          'Suica は京都のバスや地下鉄でも使える？',
          '使えます。交通系 IC カードは全国で相互利用できるので、京都の市バスや地下鉄、JR でもそのままタッチで乗れます。',
        ],
        [
          '紅葉シーズンにスーツケースで市バスに乗っても大丈夫？',
          'かなり混むので避けたほうが無難です。京都駅のコインロッカーや手荷物預かりを使うか、ホテルに先に送っておくと身軽に回れます。',
        ],
      ],
      extra: {
        table: [
          ['持ち物', '必要？', 'メモ'],
          ['薄手のダウン', '必要', '朝晩は8度'],
          ['交通系 IC', 'いつもの', 'Suica で OK'],
          ['スーツケース', '預ける', '京都駅かホテルへ'],
        ],
        summary: [
          '薄手のダウンかフリースに長袖で十分',
          'Suica は京都でもそのまま使える',
          '大きな荷物は預けるか先に送る',
        ],
        translation:
          "It's best to avoid it, since the buses get very crowded. Use the coin lockers or baggage storage at Kyoto Station, or send your bags to the hotel ahead of time so you can travel light.",
        todo: [
          '薄手のダウン',
          '長袖2枚',
          '充電器とモバイルバッテリー',
          '新幹線のチケットとホテルの予約確認',
        ],
      },
    },
    dinner: {
      title: '冷蔵庫の残り物で晩ごはん',
      turns: [
        [
          '冷蔵庫に卵とトマト、玉ねぎ半分があるけど、晩ごはん何作ろう？',
          'トマトと卵の炒め物なら10分でできます。卵を半熟に炒めていったん取り出し、玉ねぎとトマトを炒めて水分が出てきたら、卵を戻してさっと混ぜれば完成です。',
        ],
        [
          'スープも一品ほしい',
          '残りのトマトでかき玉スープはどうでしょう。トマトを炒めて水を加えて煮立て、溶き卵を回し入れ、最後に塩で味を調えます。',
        ],
        [
          'ネギがなくても大丈夫？',
          '大丈夫です。仕上げに黒こしょうかごま油を少し垂らせば、十分に香りが立ちます。',
        ],
      ],
      extra: {
        table: [
          ['料理', '材料', '時間'],
          ['トマトと卵の炒め物', '卵3個、トマト1個、玉ねぎ半分', '10分'],
          ['トマトのかき玉スープ', 'トマト1個、卵1個', '8分'],
        ],
        summary: [
          '主菜はトマトと卵の炒め物',
          'スープはトマトのかき玉スープ',
          'ネギがなければ黒こしょうかごま油で香りづけ',
        ],
        translation:
          "That's fine. A little black pepper or a few drops of sesame oil at the end gives plenty of aroma.",
        todo: ['ご飯を炊く', '卵を炒めて取り出す', 'トマトと玉ねぎを炒める', 'かき玉スープを作る'],
      },
    },
    week: {
      title: '1週間の作り置き弁当',
      turns: [
        [
          '1週間分のお弁当メニューを考えて。手間がかからないやつで',
          '週末に主菜を3品まとめて作り、小分けにして冷凍しておきましょう。鶏の照り焼き、豚こまの生姜焼き、ブロッコリーのおかか和えです。平日は朝1品取り出して、炊きたてのご飯と一緒に詰めるだけ。',
        ],
        [
          '1日500円以内に抑えられる？',
          '大丈夫です。鶏もも肉と豚こまは大容量パック、ブロッコリーは旬のものを選べば、1食あたり300円前後に収まります。',
        ],
      ],
      extra: {
        table: [
          ['曜日', '主菜'],
          ['月', '鶏の照り焼き'],
          ['火', '豚こまの生姜焼き'],
          ['水', '鶏の照り焼き'],
          ['木', '豚こまの生姜焼き'],
          ['金', 'ブロッコリーのおかか和えと照り焼き'],
        ],
        summary: ['週末に主菜を3品作って冷凍', '平日はご飯を炊くだけ', '1食あたり300円前後'],
        translation:
          'Yes. Buy chicken thighs and thin-sliced pork in value packs and pick broccoli in season, and each lunch comes to about 300 yen.',
        todo: ['鶏もも肉1kg', '豚こま600g', 'ブロッコリー3株', '保存容器10個'],
      },
    },
    landlord: {
      title: '給湯器の故障を管理会社に伝える',
      turns: [
        [
          '給湯器が壊れた。管理会社にどう伝えればいい？',
          'いつから、どんな症状なのかをまず伝え、修理の手配をお願いしたうえで、在宅できる時間を添えるとスムーズです。',
        ],
        [
          'メールの文面を書いて',
          'ご担当者様\n\nいつもお世話になっております。メゾン桜302号室の佐藤です。昨夜から給湯器が点火せず、お湯が出ない状態です。お手数ですが、近日中に修理の手配をお願いできますでしょうか。平日の夜と土日は在宅しております。よろしくお願いいたします。',
        ],
      ],
      extra: {
        table: [
          ['伝えること', '書き方'],
          ['症状', '昨夜から点火しない'],
          ['お願い', '修理の手配'],
          ['在宅時間', '平日の夜と土日'],
        ],
        summary: [
          'まず症状といつからかを伝える',
          '修理の手配をお願いする',
          '在宅できる時間を添える',
        ],
        translation:
          "Dear Property Manager,\n\nThis is Sato in Room 302 at Maison Sakura. The water heater hasn't ignited since last night, so there's no hot water. Could you please arrange a repair in the next few days? I'm home on weekday evenings and weekends. Thank you for your help.",
        todo: ['リモコンのエラーコードを控える', '管理会社にメールする', '修理の日程を決める'],
      },
    },
    run: {
      title: 'ランニングで膝が痛い',
      turns: [
        [
          '最近、走ると膝の外側が痛い。まだ走っても大丈夫？',
          '膝の外側の痛みは、腸脛靭帯の張り（いわゆるランナー膝）が原因のことが多いです。まず3〜5日は走るのを休み、痛みが引いたら短い距離のジョグから再開しましょう。歩くだけでも痛むなら、整形外科を受診してください。',
        ],
        [
          'おすすめのストレッチは？',
          '- フォームローラーで太ももの外側をほぐす（左右2分ずつ）\n- 立ったまま脚を交差させて体側を伸ばす（左右30秒ずつ）\n- 横向きに寝て脚を上げ、中殿筋を鍛える（左右15回ずつ）',
        ],
      ],
      extra: {
        table: [
          ['メニュー', '時間・回数'],
          ['フォームローラー', '左右2分ずつ'],
          ['クロスレッグストレッチ', '左右30秒ずつ'],
          ['サイドレッグレイズ', '左右15回ずつ'],
        ],
        summary: [
          '膝の外側の痛みは腸脛靭帯の張りが多い',
          'まず3〜5日は走らない',
          '毎日フォームローラーと中殿筋トレーニング',
        ],
        translation:
          '- Foam-roll the outer thigh, 2 minutes per side\n- Standing cross-leg side stretch, 30 seconds per side\n- Side-lying leg raises for the glutes, 15 reps per side',
        todo: [
          '3日間ランニングを休む',
          '毎日フォームローラーでほぐす',
          'サイドレッグレイズを毎日3セット',
          '再開は3km のジョグから',
        ],
      },
    },
    cat: {
      title: '猫があまりごはんを食べない',
      turns: [
        [
          'うちの猫、ここ2日くらいキャットフードをあまり食べない。大丈夫かな？',
          'まずは元気があるか、水を飲んでいるか、トイレがいつも通りかを見てください。元気でただ好き嫌いをしているだけなら、味を変えてみるのも手です。24時間以上まったく食べない場合は、早めに動物病院へ。',
        ],
        [
          'フードの切り替えはどうすればいい？',
          '7日かけて少しずつ切り替えます。最初の2日は新しいフードを4分の1、次の3日は半分、最後の2日は4分の3にしましょう。',
        ],
      ],
      extra: {
        table: [
          ['日数', '新しいフードの割合'],
          ['1〜2日目', '25%'],
          ['3〜5日目', '50%'],
          ['6〜7日目', '75%'],
        ],
        summary: [
          '元気・飲水・トイレをまず確認',
          '24時間以上食べなければ動物病院へ',
          'フードは7日かけて切り替える',
        ],
        translation:
          'Switch over seven days: a quarter new food for the first two days, half for the next three, and three quarters for the last two.',
        todo: ['今日食べた量をメモする', '新しい味を小袋で買う', '7日間の割合で切り替える'],
      },
    },
    headphones: {
      title: 'ノイキャンの選び方',
      turns: [
        [
          '通勤用のノイズキャンセリング、どう選べばいい？',
          'まず予算を決めて、ノイキャンの強さ、着け心地、バッテリー持ちの3点を比べましょう。電車通勤ならノイキャン重視、1日1〜2時間以上着けるなら着け心地が大事です。',
        ],
        [
          'メガネをかけていても大丈夫？',
          '影響はあります。ヘッドホンのイヤーパッドがメガネのつるを押さえて隙間ができ、ノイキャンが弱くなります。メガネならイヤホン型のほうが快適です。',
        ],
      ],
      extra: {
        table: [
          ['タイプ', 'ノイキャン', 'メガネとの相性'],
          ['ヘッドホン', '強め', 'つるが当たる'],
          ['イヤホン', '十分', '影響なし'],
        ],
        summary: ['まず予算を決める', '電車通勤ならノイキャン重視', 'メガネならイヤホン型'],
        translation:
          'It does. Over-ear pads press on the arms of your glasses and leave a gap, which weakens the noise cancelling. Earbuds are more comfortable if you wear glasses.',
        todo: ['予算を決める', '店頭で2機種を試す', 'バッテリー持ちとケースの大きさを比べる'],
      },
    },
  },
  tree: [
    {
      folder: '旅行',
      open: true,
      kids: [{ folder: '京都', open: true, kids: [{ chat: 'kyoto' }, { chat: 'packing' }] }],
    },
    { folder: '料理', kids: [{ chat: 'dinner' }, { chat: 'week' }] },
    { chat: 'landlord' },
    { chat: 'run' },
    { chat: 'cat' },
    { chat: 'headphones' },
  ],
  current: 'kyoto',
  promptList: [
    { name: '表にまとめる', tag: '整理', text: '上の内容を表にまとめて。', reply: 'table' },
    {
      name: '3つのポイントで要約',
      tag: '整理',
      text: 'この会話を3つのポイントにまとめて。',
      reply: 'summary',
    },
    {
      name: 'チェックリストにする',
      tag: '整理',
      text: 'チェックできる ToDo リストにして。',
      reply: 'todo',
    },
    {
      name: '自然な英語に翻訳',
      tag: '翻訳',
      text: '直前の回答を自然な英語に訳して。',
      reply: 'translate',
    },
    {
      name: 'もっとかんたんに',
      tag: '学び',
      text: 'もっとかんたんな言葉で言い直して。',
      reply: 'plain',
    },
  ],
  groups: [
    {
      title: '見た目を整える',
      items: [
        {
          icon: 'move-horizontal',
          name: 'チャット幅',
          detail: '会話欄を広げて、コードも表も折り返さない',
        },
        { icon: 'a-large-small', name: 'フォントサイズ', detail: 'チャットの文字サイズだけを調整' },
        {
          icon: 'clock-3',
          name: 'メッセージタイムスタンプ',
          detail: '各メッセージに送信時刻を表示',
        },
        {
          icon: 'workflow',
          name: 'Mermaid ダイアグラム',
          detail: 'フローチャートやシーケンス図をその場で描画',
        },
        { icon: 'snowflake,rain,sakura', name: 'ビジュアルエフェクト', detail: '雪、雨、桜' },
      ],
    },
    {
      title: 'データはあなたのもの',
      items: [
        { icon: 'file-down', name: '会話のエクスポート', detail: 'Markdown・PDF・JSON・画像' },
        {
          icon: 'microscope',
          name: 'Deep Research エクスポート',
          detail: '思考過程と引用リンクもまとめて',
        },
        { icon: 'cloud', name: 'クラウド同期', detail: 'Google ドライブ、Safari では iCloud' },
        { icon: 'list-x', name: '一括削除', detail: '選んだ会話をまとめて削除' },
        { icon: 'image', name: '透かし除去', detail: 'Nano Banana の生成画像をロスレスで復元' },
      ],
    },
    {
      title: '手数を減らす',
      items: [
        { icon: 'quote', name: '引用返信', detail: '一部を選んで、そのまま引用して質問' },
        { icon: 'corner-down-left', name: '送信動作', detail: 'Enter で改行、Ctrl+Enter で送信' },
        { icon: 'star', name: 'デフォルトモデル', detail: '新しい会話をいつものモデルで開始' },
        {
          icon: 'git-branch',
          name: '会話の分岐',
          detail: '好きなターンから分岐して、別の聞き方を試す',
        },
        { icon: 'sigma', name: '数式コピー', detail: 'クリックで LaTeX や Word の数式をコピー' },
      ],
    },
    {
      title: '開かれたエコシステム',
      items: [
        {
          icon: 'puzzle',
          name: 'プラグインマーケット',
          detail: '公式とコミュニティのプラグインをワンクリックで',
        },
        { icon: 'globe', name: 'マルチサイト対応', detail: 'Claude・ChatGPT・DeepSeek でも使える' },
        {
          icon: 'monitor',
          name: 'ローカル Web UI',
          detail: 'OpenCode などのローカル UI でもプロンプトライブラリを',
        },
        { icon: 'code', name: 'IDE 連携', detail: '会話のコンテキストを VS Code に同期' },
        {
          icon: 'panel-left-close',
          name: 'サイドバー自動非表示',
          detail: 'マウスを離すと自動で閉じ、会話に集中',
        },
      ],
    },
  ],
};
