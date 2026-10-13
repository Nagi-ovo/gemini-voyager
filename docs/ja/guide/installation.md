# インストール

::: info ニュース
🍎 **Safari ネイティブ拡張機能が登場！** 完全無料で、ワンクリックでインストールできます。
:::

インストール方法を選んでください。

> ⚠️ 注意：Gemini™ Enterprise に対応している機能はプロンプトマネージャーだけです。

## 1. 拡張機能ストア（推奨）

最も簡単な方法です。更新も自動で行われます。

**Chrome / Edge / Brave / Opera / Vivaldi：**

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Download-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome Web Store からインストール" height="40"/>](https://chromewebstore.google.com/detail/iifacdnjakkhjjiengaffnegbndgingi?utm_source=github&utm_medium=docs&utm_campaign=organic_growth&utm_content=ja)

**Microsoft Edge：**

[<img src="https://img.shields.io/badge/Microsoft_Edge-Download-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Microsoft Edge Add-ons からインストール" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

> **Edge ユーザーの方：** Voyager は、特にモバイルやタブレットで Edge を使う方のために、[Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne) でも引き続き提供しています。審査に時間がかかる場合でも、Chrome Web Store と GitHub の手動パッケージは利用できます。

**Firefox：**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-Download-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Firefox Add-ons からインストール" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. 手動インストール（最新機能）

ウェブストアの審査には時間がかかることがあります。最新版をすぐに使いたい場合は、手動でインストールしてください。

**Chrome / Edge / Brave / Opera の場合：**

1. [GitHub Releases](https://github.com/voyager-crew/voyager/releases) から最新の `voyager-chrome-vX.Y.Z.zip` をダウンロードします。
2. ファイルを解凍します。
3. ブラウザの拡張機能ページ（`chrome://extensions`）を開きます。
4. 右上の **デベロッパーモード** をオンにします。
5. **パッケージ化されていない拡張機能を読み込む** をクリックし、解凍したフォルダを選びます。

**Firefox の場合：**

1. [Releases](https://github.com/voyager-crew/voyager/releases) から最新の `voyager-firefox-vX.Y.Z.xpi` をダウンロードします。
2. アドオン管理画面（`about:addons`）を開きます。
3. `.xpi` ファイルをドラッグ＆ドロップしてインストールします（または歯車アイコン ⚙️ をクリックして **ファイルからアドオンをインストール** を選びます）。

> 💡 XPI ファイルは Mozilla の公式署名を受けており、すべての Firefox バージョンに永続的にインストールできます。

## 3. Safari（macOS）

Safari でも直接配布に対応しました。署名済みのアプリをダウンロードしてください。

::: warning `Gemini Voyager.app` からのアップグレード
アプリ本体の名前が `Voyager.app` に変わりました。macOS はファイル名が異なるアプリを置き換えないため、両方を残さないでください。

1. 旧拡張機能で、お使いの Gemini と AI Studio のタブを開き、**クラウド同期 > クラウドにアップロード** を実行します。ハイライトの同期を使っている場合は、アップロードの前にハイライト同期を有効にしてください。
2. 独立した予備として、プロンプトライブラリをローカルの JSON ファイルにエクスポートします。
3. Safari とアプリ本体を終了します。
4. `/Applications/Gemini Voyager.app` をゴミ箱に入れます。Safari の **アンインストール** ボタンは押さず、Safari の拡張機能データ、ウェブサイトのデータ、コンテナは消去しないでください。
5. `Voyager.app` を `/Applications` にコピーし、一度開きます。求められたら Safari で Voyager を有効にします。
6. フォルダ、プロンプト、設定、スターを確認します。不足しているものがあれば、**ドライブからマージ**を使うか、プロンプトの JSON をインポートしてください。

Voyager は既存のアプリと拡張機能のバンドル ID を引き継いでいるため、macOS と Safari は同じ製品として認識し続けます。上記のバックアップ手順は、古い手動インストールに備えた念のための措置です。
:::

1. <SafariDownloadLink>Safari の最新版（.dmg）</SafariDownloadLink>をダウンロードします。
2. ダブルクリックして開き、案内に従ってインストールします。
3. ダブルクリックしてアプリを起動します。
4. **Safari の設定 > 機能拡張** で拡張機能を有効にします。

> 💡 Safari ビルドは直接配布用に署名されるようになりました。Xcode での変換は不要です！
>
> ✅ **Safari の公式サポート**：v1.6.0 以降、ウォーターマークの除去、画像のエクスポート、Google Drive / iCloud 同期、応答完了の通知、Sparkle による更新に対応しています。

---

_開発環境を整えたい方は、[貢献ガイド](https://github.com/voyager-crew/voyager/blob/main/.github/CONTRIBUTING.md) をご覧ください。_
