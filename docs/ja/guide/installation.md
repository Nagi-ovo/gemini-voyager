# インストール

道はいくつかあります。お好きな方法を選んでください。

> ⚠️ プロンプトマネージャーは Gemini Enterprise 版で唯一対応している機能です。

## 1. 公式ストア（推奨）

最も簡単な方法で、自動更新に対応しています。

**Chrome / Brave / Opera / Vivaldi：**

[<img src="https://img.shields.io/badge/Chrome_ウェブストア-ダウンロード-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome ウェブストアからインストール" height="40"/>](https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol)

**Microsoft Edge：**

[<img src="https://img.shields.io/badge/Microsoft_Edge-ダウンロード-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Microsoft Edge Add-ons からインストール" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/gemini-voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

**Firefox：**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-ダウンロード-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Firefox Add-ons からインストール" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. 手動インストール（最新版）

ストアの審査は時間がかかります。最新機能をいち早く試したい方は、こちらをどうぞ。

**Chrome / Edge / Brave / Opera：**

1. [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) から最新の `gemini-voyager-chrome-vX.Y.Z.zip` をダウンロードします。
2. 解凍します。
3. 拡張機能ページ (`chrome://extensions`) を開きます。
4. **デベロッパーモード**（右上）をオンにします。
5. **パッケージ化されていない拡張機能を読み込む** をクリックし、先ほど解凍したフォルダを選択します。

**Firefox：**

1. [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) から最新の `gemini-voyager-firefox-vX.Y.Z.xpi` をダウンロードします。
2. アドオン管理ページ (`about:addons`) を開きます。
3. ダウンロードした `.xpi` ファイルをドラッグ＆ドロップしてインストールします（または右上の歯車アイコン ⚙️ -> **ファイルからアドオンをインストール**）。

> 💡 XPI ファイルは Mozilla 公式の署名済みであり、すべての Firefox バージョンで恒久的にインストール可能です。

## 3. Safari (macOS)

1. [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) から `gemini-voyager-safari-vX.Y.Z.zip` をダウンロードします。
2. 解凍します。
3. ターミナルで以下のコマンドを実行します（Xcode が必要です）：
   ```bash
   xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
   ```
4. Xcode で実行します。
5. Safari の設定 > 拡張機能で有効にします。

---

_コードに貢献したいですか？ 開発者の方は [貢献ガイド](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/CONTRIBUTING.md) へどうぞ。_
