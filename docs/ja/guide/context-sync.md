# 記憶の搬送：コンテキスト同期（実験的）

**異なる次元を、シームレスにつなぐ**

ロジックの検討はウェブで、コードの実装は IDE で。Voyager は次元の壁を取り払い、ウェブでの「思考のプロセス」を IDE にすぐ渡せるようにします。

## タブの行き来はもう不要

開発者にとって最大の悩みは、ウェブで解決策を十分に話し合ったあと、VS Code、Trae、Cursor に戻ると、要件をまた一から説明し直さなければならないことです。利用上限や応答速度の都合で、ウェブは「頭脳」、IDE は「手」になります。Voyager は、両者に同じ中身を共有させます。

## 同期は 3 ステップ

1. **CoBridge をインストールして起動する**:
   VS Code または互換性のあるエディタに **CoBridge** 拡張機能をインストールします。これは、ウェブのインターフェースとローカルの IDE をつなぐ中核のブリッジです。
   - **[Open VSX からインストール](https://open-vsx.org/extension/windfall/co-bridge)**

   ![CoBridge 拡張機能](/assets/CoBridge-extension.png)

   インストールしたら、**任意の作業ディレクトリを開き**、右側のアイコンをクリックしてサーバーを起動します。
   ![CoBridge のサーバーが起動した状態](/assets/CoBridge-on.png)

2. **接続を確立する**:
   - Voyager のポップアップにある **コンテキスト同期** セクションで、**同期モード** を **手動** に設定します。
   - **サーバーポート** を、CoBridge が使っているポートと一致させます。「IDE オンライン」と表示されれば、接続は完了です。

   ![コンテキスト同期のコンソール](/assets/context-sync-console.png)

3. **ワンクリックで同期する**: **"IDE に同期"** をクリックします。複雑な**データテーブル**でも、直感的な**参考画像**でも、すべて瞬時に IDE へ同期されます。

   ![同期完了](/assets/sync-done.png)

## IDE に定着させる

同期が終わると、IDE の作業ディレクトリに `.cobridge/AI_CONTEXT.md` が現れます。Trae、Cursor、Copilot のどれを使っていても、それぞれのルールファイルを通じて、この「記憶」を自動的に読み取ります。

```
your-project/
├── .cobridge/
│   ├── images/
│   │   ├── context_img_1_1.png
│   │   └── context_img_1_2.png
│   └── AI_CONTEXT.md
├── .github/
│   └── copilot-instructions.md
├── .gitignore
├── .traerules
└── .cursorrules
```

## 設計の原則

- **リポジトリを汚さない**: CoBridge は `.gitignore` を自動で処理するため、プライベートな会話が Git リポジトリにプッシュされることはありません。
- **業界の慣習に沿う**: 完全な Markdown 形式なので、IDE 内の AI が取扱説明書を読むように、スムーズに理解できます。
- **ヒント**: 会話が少し前のものであれば、まず [タイムライン](/ja/guide/timeline) を使って上にスクロールしてください。ウェブ側に文脈を読み込ませてから同期すると、結果がよくなります。

---

## 準備完了

**ロジックはクラウドで整いました。あとは、ローカルで根を張らせるだけです。**

- **[CoBridge 拡張機能をインストール](https://open-vsx.org/extension/windfall/co-bridge)**: 次元の扉を見つけ、ワンクリックで「同期の呼吸」を始めましょう。
- **[GitHub リポジトリ](https://github.com/Winddfall/CoBridge)**: CoBridge の仕組みを深く知るか、この「魂を同期させる」プロジェクトに Star を付けてください。

> **LLM が記憶を失うことは、もうありません。箱から出した瞬間から、すぐに戦力になります。**
