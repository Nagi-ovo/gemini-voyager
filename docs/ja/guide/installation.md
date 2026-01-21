# インストール

道はいくつかあります。お好きな方法を選んでください。

## 1. 極めてシンプル（Chrome ウェブストア）
Chrome, Edge, Brave, Opera ユーザーに推奨。
最も簡単で、自動更新され、心配無用です。

[<img src="https://img.shields.io/badge/Chrome_ウェブストア-ダウンロード-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome ウェブストアからインストール" height="40"/>](https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol)

1. 上のボタンをクリックします。
2. **Chrome に追加** をクリックします。
3. 完了。

## 2. 手動インストール（最新版）
ストアの審査は時間がかかります。最新機能をいち早く試したい方は、こちらをどうぞ。

**Chrome / Edge / Brave / Opera：**
1. [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) から最新の `gemini-voyager-chrome-vX.Y.Z.zip` をダウンロードします。
2. 解凍します。
3. 拡張機能ページ (`chrome://extensions`) を開きます。
4. **デベロッパーモード**（右上）をオンにします。
5. **パッケージ化されていない拡張機能を読み込む** をクリックし、先ほど解凍したフォルダを選択します。

## 3. Firefox

**方法 1：Firefox Add-ons ストア（推奨）**

[![Firefox Add-ons からインストール](https://img.shields.io/badge/Firefox_Add--ons-ダウンロード-FF7139?style=for-the-badge&logo=firefox&logoColor=white)](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

最も簡単な方法です。公式ストアからインストールし、自動更新されます。

**方法 2：XPI ファイル（手動インストール）**
1. [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) から最新の `gemini-voyager-firefox-vX.Y.Z.xpi` をダウンロードします。
2. アドオン管理ページ (`about:addons`) を開きます。
3. ダウンロードした `.xpi` ファイルをドラッグ＆ドロップしてインストールします（または右上の歯車アイコン ⚙️ -> **ファイルからアドオンをインストール**）。

> 💡 XPI ファイルは Mozilla 公式の署名済みであり、すべての Firefox バージョンで恒久的にインストール可能です。

## 4. Safari (macOS)
1. [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases) から `gemini-voyager-safari-vX.Y.Z.zip` をダウンロードします。
2. 解凍します。
3. ターミナルで以下のコマンドを実行します（Xcode が必要です）：
   ```bash
   xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
   ```
4. Xcode で実行します。
5. Safari の設定 > 拡張機能で有効にします。

---
*コードに貢献したいですか？開発者の方は [貢献ガイド](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/CONTRIBUTING.md) へどうぞ。*
