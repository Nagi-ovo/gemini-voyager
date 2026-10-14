# Image Refinement（透かし除去）

::: tip Safari サポート
v1.6.0 以降、**Image Refinement** は Safari で直接動作し、フルサイズのウォーターマークなし画像をダウンロードできます。Chrome、Edge、Firefox、Safari で同じ組み込みフローを利用できます。
:::

**AI 画像、あるべき純粋な姿へ。**

Gemini™ が生成する画像には、デフォルトで目に見える透かしが入っています。これは安全上の理由によるものですが、創作活動においては、完全にクリーンな素材が必要な場合もあるでしょう。

## 無劣化復元

Image Refinement は **逆アルファブレンドアルゴリズム (Reverse Alpha Blending)** を採用しています。

- **AI による再描画なし**: 従来の透かし除去ツールが多用する AI による塗りつぶしは、画像の細部を破壊してしまいます。
- **ピクセル精度の復元**: 私たちは計算によって、ピクセル上の透かしの透明層を正確に取り除き、オリジナルのピクセルを 100% 復元します。
- **品質劣化ゼロ**: 処理前後の画像は、透かし以外の部分において完全に一致します。

## 使い方

Voyager のポップアップを開き、**Image Refinement オプション** を見つけてください。2 つのスイッチはどちらもデフォルトでオフです：

- **ダウンロード時に透かしを除去**（推奨）: Gemini のダウンロードボタンをクリックすると、保存されるファイルから透かしが取り除かれます。ダウンロードボタンに小さな 🍌 バッジが付いていれば有効です。ボタン自体は Gemini 標準のままです。
- **プレビュー時に透かしを除去**（不安定）: 画面に表示される画像もクリーンにします。処理は遅めで、処理中に画像が一瞬ちらつくことがあります。

## Gemini 自身の設定

Gemini には、目に見える透かしを切り替える公式の設定が追加されつつあります。**設定 → Media watermark → Off** です。アカウントにこの項目がある場合は、そちらを使い、Voyager の透かし除去はオフにしてください。Gemini の設定のほうが確実です。Voyager はこれについて一度だけ案内を表示し、最近の画像にすでに透かしがない場合もお知らせします。まだこの項目が見つからない場合は、Voyager を引き続き使ってください。どちらの方法でも、SynthID と C2PA のメタデータは残ります。

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Image Refinement Example" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 特別謝辞

本機能は、[journey-ad (Jad)](https://github.com/journey-ad) 氏が開発した [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) プロジェクトに基づいています。このプロジェクトは、[allenk](https://github.com/allenk) 氏による [GeminiWatermarkTool C++ 版](https://github.com/allenk/GeminiWatermarkTool) の JavaScript 移植版です。オープンソースコミュニティへの多大なる貢献に感謝します。🧡
保持している第三者の MIT notice は [THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md) に記載しています。

## プライバシーとセキュリティ

すべての透かし除去処理は、あなたの **ブラウザ内でローカル** に完了します。画像がいかなる第三者のサーバーにアップロードされることはなく、あなたのプライバシーと創作の安全は守られます。
