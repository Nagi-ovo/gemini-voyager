# インストール

::: info ニュース
🍎 **Safari ネイティブ拡張機能が登場！** 完全無料でワンクリックインストールが可能です。
:::

方法を選択してください。

> ⚠️ プロンプトマネージャーは Gemini™ Enterprise 版で唯一対応している機能です。

## 1. 公式ストア（推奨）

最も簡単な方法で、自動更新に対応しています。

**Chrome / Edge / Brave / Opera / Vivaldi：**

[<img src="https://img.shields.io/badge/Chrome_ウェブストア-ダウンロード-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome ウェブストアからインストール" height="40"/>](https://chromewebstore.google.com/detail/iifacdnjakkhjjiengaffnegbndgingi?utm_source=github&utm_medium=docs&utm_campaign=organic_growth&utm_content=ja)

**Microsoft Edge：**

[<img src="https://img.shields.io/badge/Microsoft_Edge-ダウンロード-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Microsoft Edge Add-ons からインストール" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

> **Edge ユーザー：**モバイルやタブレットで Edge が必要なユーザーのため、Voyager は [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne) 版の保守と公開を継続します。審査が遅れる場合は Chrome Web Store 版または GitHub の手動パッケージも利用できます。

**Firefox：**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-ダウンロード-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Firefox Add-ons からインストール" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. 手動インストール（最新版）

ストアの審査は時間がかかります。最新機能をいち早く試したい方は、こちらをどうぞ。

**Chrome / Edge / Brave / Opera：**

1. [GitHub Releases](https://github.com/voyager-crew/voyager/releases) から最新の `voyager-chrome-vX.Y.Z.zip` をダウンロードします。
2. 解凍します。
3. 拡張機能ページ (`chrome://extensions`) を開きます。
4. **デベロッパーモード**（右上）をオンにします。
5. **パッケージ化されていない拡張機能を読み込む** をクリックし、先ほど解凍したフォルダを選択します。

**Firefox：**

1. [Releases](https://github.com/voyager-crew/voyager/releases) から最新の `voyager-firefox-vX.Y.Z.xpi` をダウンロードします。
2. アドオン管理ページ (`about:addons`) を開きます。
3. ダウンロードした `.xpi` ファイルをドラッグ＆ドロップしてインストールします（または右上の歯車アイコン ⚙️ -> **ファイルからアドオンをインストール**）。

> 💡 XPI ファイルは Mozilla 公式の署名済みであり、すべての Firefox バージョンで恒久的にインストール可能です。

## 3. Safari (macOS)

Safari が直接配布に対応しました！署名済みアプリをダウンロードできます：

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

1. <SafariDownloadLink>最新の Safari バージョン (.dmg)</SafariDownloadLink>をダウンロードします。
2. ダブルクリックして開き、指示に従ってインストールします。
3. ダブルクリックしてアプリを起動します。
4. **Safari の設定 > 機能拡張**で有効にします。

> 💡 Safari ビルドが直接署名配布に対応しました。Xcode 変換は不要です！
>
> ✅ **Safari 正式サポート**：v1.6.0 以降、ウォーターマーク除去、画像エクスポート、Google Drive / iCloud 同期、応答完了通知、Sparkle 自動更新に対応しています。

---

_コードに貢献したいですか？ 開発者の方は [貢献ガイド](https://github.com/voyager-crew/voyager/blob/main/.github/CONTRIBUTING.md) へどうぞ。_
