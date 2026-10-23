# ChatGPT ローカルブリッジ

「ChatGPT · ローカルブリッジ」は Voyager の公式プラグインです。初期状態ではオフです。

オンにしてペアリングすると、Voyager はこのコンピューター上のローカルプログラムに、ChatGPT のページ操作をひとそろい提供します。プログラムがやりたいことを伝えると、Voyager が自分で開いたタブで、ブラウザでいつもログインしている ChatGPT を使って実行します。ChatGPT から見れば、あなたのブラウザからのごく普通のチャットです。

## 提供する操作

- 会話を開く：新しい会話、または既存の会話
- モデルを選ぶ：チャットモードでのみ選択し、ChatGPT を Work モードに切り替えることはありません
- プロンプトを送る（添付ファイル付きも可）
- 回答を待って読み取る
- 既存の会話の最新の回答を読み取る
- プロジェクトの一覧と作成
- プロジェクトのファイルの一覧、アップロード、削除（削除はすぐに反映され、元に戻せません）
- ページデータ（Voyager が ChatGPT のページを見分けるためのサイトデータ）を、次の定期チェックを待たずにすぐ取り直す

## 動作のルール

**ローカルだけ。** ブリッジがローカルプログラムとやり取りするのは `127.0.0.1` 経由だけで、ペアリングが済んでからです。

**専用のタブ。** 各ジョブは Voyager が開いた ChatGPT のタブで実行され、終わるとタブは閉じます。

**既定では一度に 1 ジョブ。** ジョブは既定では 1 つずつ順に動きます。ポップアップの **ローカルブリッジ** カードで **ジョブを並行実行** をオンにし、**同時に実行するジョブ数**（2〜10、既定は 3）を選ぶと、それぞれ専用のタブで同時に動きます。入力やクリックは引き続き順番です。並行実行には 0.4.0 より新しい Voyager CLI が必要で、それ以前の `voyager serve` では一度に 1 ジョブずつ動きます。

**ログインと認証はあなた自身で。** ChatGPT がログインや認証チャレンジを求めたら、ブリッジは止まってそう伝えます。回避しようとはしません。

**プランも表示。** どの結果にも、ページが最後に報告した ChatGPT のプラン（`Pro Lite ($100)`、`Pro ($200)` など）が含まれます。

**ブラウザ。** Chrome でテスト済みです。Edge 版と Firefox 版の Voyager にもブリッジは入っていますが、Safari 版にはありません。

## リファレンス実装：Voyager CLI

[Voyager CLI](https://github.com/voyager-crew/voyager-cli)（npm `@voyager-crew/cli`、コマンド `voyager`）は、これらの操作の上に作られたリファレンスクライアントです。ターミナルから ChatGPT に質問したり、コーディングエージェントに任せたりできます。

### 3 ステップで接続

1. CLI をインストールします（Node.js 20.3 以降が必要）。

   ```sh
   npm install -g @voyager-crew/cli
   ```

2. Voyager のポップアップで **プラグイン** を開き、**ChatGPT · ローカルブリッジ** をオンにして chatgpt.com へのアクセスを許可します。
3. 一度だけペアリングします。

   ```sh
   voyager pair
   ```

   表示された 8 文字のコードを、ポップアップの「ローカルブリッジ」の設定に入力します。

### 使用例

```sh
voyager ask "このスタックトレースを説明して" --attach crash.log
voyager ask --chat <link|id> "エッジケースは？"     # 既存の会話で続けて質問
voyager read <link|id>                              # 会話の最新の回答を保存
voyager project upload "Thesis" ./thesis            # プロジェクト内のどのチャットからも読める
voyager ask --project "Thesis" "論証がいちばん弱いのはどこ？"
voyager ask --drive ./paper.pdf "手法の部分を要約して"  # Google Drive に置き、ChatGPT 自身の Drive アプリに読ませる
voyager ask --repo owner/name "CI が落ちるのはなぜ？"   # ChatGPT 自身の GitHub アプリにリポジトリを読ませる
```

回答は `response.md` として保存されます。既定ではチャットモードの GPT-6 Pro を使います。

どちらも ChatGPT 自身の Google Drive アプリと GitHub アプリを使うので、先に ChatGPT で連携しておいてください。プロンプトに文を足すだけなので、新しいバージョンの Voyager は要りません。`--drive` は rclone で `VOYAGER_DRIVE_REMOTE`（例：`gdrive:Voyager`）の下に新しいフォルダを作ってアップロードします。この remote は ChatGPT の Drive アプリと同じ Google アカウントである必要があります。`--attach` の 64 MiB の上限はなく、ファイルは Drive に残ります。`--repo` は ChatGPT に新しい `chatgpt/*` ブランチにだけコミットするよう頼みますが、これはお願いであって制限ではありません。アプリは GitHub のインストール範囲内ならどこにでも書き込めます。ChatGPT がリポジトリにアクセスできないと、voyager は終了コード 3 で止まります。[GitHub のインストール設定](https://github.com/settings/installations)でリポジトリを追加してください。

長い回答の待ち方、各終了コードの意味、すべてのコマンドは [CLI の README](https://github.com/voyager-crew/voyager-cli#readme) を参照してください。Claude Code や Codex などのエージェント向けの説明は [SKILL.md](https://github.com/voyager-crew/voyager-cli/blob/main/skills/voyager/SKILL.md) にあります。

## 注意事項と免責

- Voyager と Voyager CLI はコミュニティによるオープンソースプロジェクトで、OpenAI とは無関係であり、OpenAI の承認も受けていません。
- ブリッジは、あなた自身がログインしているブラウザで Web 版 ChatGPT を自動操作します。OpenAI の[利用規約](https://openai.com/policies/terms-of-use/)は、自動的またはプログラムによる出力の抽出を制限しています。規約に沿うかどうかはご自身で判断したうえでお使いください。その結果アカウントに制限がかかっても、自己責任となります。
- 同種のツールも同じ扱いです。たとえば [oracle](https://github.com/steipete/oracle) は、ブラウザモードを明示的に有効にする実験的機能とし、リスクを避けたい人には API を勧めています。確実な方法が必要なら、OpenAI API をお使いください。
- ブリッジは、ご自身のコンピューターでご自身の便利のために使うものです。接続するのはご自身のアカウントだけにし、他人へのサービス提供、アカウントの共有、利用枠の転売には使わず、合法的な目的にのみ使用してください。
