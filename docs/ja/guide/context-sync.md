# 記憶の搬送：コンテキスト同期（実験的）

**異なる次元、シームレスな共有**

ウェブでロジックを推敲し、IDEでコードを実装する。 Gemini Voyager は次元の壁を打ち破り、IDEにウェブ側の「思考プロセス」を即座に共有します。

## 繰り返しの横断にさよなら

開発者にとって最大の悩み：ウェブで解決策を徹底的に話し合った後、VS Code/Trae/Cursorに戻ると、見知らぬ人のように要件を再説明しなければならないこと。 利用制限やレスポンス速度の関係で、ウェブは「脳」、IDEは「手」となります。 Voyager は、それらに一つの魂を共有させます。

## 極簡な3ステップ、同じ呼吸で

1. **CoBridgeのインストールと起動**：
   **CoBridge** 拡張機能をインストールします。これはウェブインターフェースとローカルIDEを接続する中核的な架け橋です。
   - **[マーケットプレイスからインストール](https://open-vsx.org/extension/windfall/co-bridge)**

   ![CoBridge拡張機能](/assets/CoBridge-extension.png)

   インストール後、右側のアイコンをクリックしてサーバーを起動します。
   ![CoBridgeサーバー起動](/assets/CoBridge-on.png)

2. **接続の確立**：
   - Voyagerの設定で「コンテキスト同期」を有効にします。
   - ポート番号を合わせます。「IDE オンライン」と表示されれば接続完了です。

   ![コンテキスト同期コンソール](/assets/context-sync-console.png)

3. **ワンクリック同期**：**"IDEに同期"**をクリックします。複雑な**データテーブル**も、直感的な**参考画像**も、瞬時にIDEへ同期されます。

   ![同期完了](/assets/sync-done.png)

## IDEへの定着

同期が完了すると、IDEのルートディレクトリに `.cobridge/AI_CONTEXT.md` が追加されます。 Trae、Cursor、Copilotのいずれであっても、それぞれのRuleファイルを介してこの「記憶」を自動的に読み取ります。

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

## その原則

- **ゼロ汚染**：CoBridgeは自動的に `.gitignore` を処理し、プライベートな会話がGitリポジトリにプッシュされないようにします。
- **実用的**：完全なMarkdown形式で、IDE内のAIが取扱説明書を読むようにスムーズに理解できます。
- **ヒント**：会話が古い場合は、まず [タイムライン] で上にスクロールして、ウェブ側に記憶を「思い出させて」から同期すると、より効果的です。

---

## いざ、起動へ

**クラウドで整った思考を、今こそローカルで具現化させましょう。**

- **[CoBridge拡張機能をインストール](https://open-vsx.org/extension/windfall/co-bridge)**：次元の扉を開き、一クリックで「同期する呼吸」を体感してください。
- **[GitHubリポジトリを訪ねる](https://github.com/Winddfall/CoBridge)**：CoBridgeの深層ロジックを探索し、この「魂を同期させる」プロジェクトにStarを贈りましょう。

> **AIはこれでもう物忘れしない、手にした瞬間から即戦力。**
