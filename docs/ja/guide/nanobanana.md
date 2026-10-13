# Image Refinement（透かし除去）

::: tip Safari サポート
v1.6.0 以降、**Image Refinement** は Safari でそのまま動作し、透かしのないフルサイズの画像をダウンロードできます。Chrome、Edge、Firefox、Safari は、現在同じ組み込みの仕組みを共有しています。
:::

**AI 画像を、純粋な姿に。**

Gemini™ が生成する画像には、既定で目に見える透かしが入っています。これは安全のための仕組みですが、創作の場面では、まっさらな素材が必要になることもあります。

## 劣化のない復元

Image Refinement は **Reverse Alpha Blending（逆アルファブレンディング）** というアルゴリズムを使います。

- **AI による再描画ではありません**: 従来の透かし除去は、AI で該当部分を塗りつぶすことが多く、画素の細部が失われてしまいます。
- **画素単位での復元**: 数学的な計算で、半透明の透かしの層を正確に取り除き、元の画素を 100% 復元します。
- **画質の劣化はありません**: 処理後の画像は、透かしのない部分では元の画像とまったく同じです。

## 使い方

Voyager のポップアップを開き、**Image Refinement オプション** を見つけてください。どちらのスイッチも、オンにするまではオフです。

- **ダウンロード時に透かしを除去**（推奨）: Gemini のダウンロードボタンをクリックすると、保存されるファイルから透かしが除かれます。ダウンロードボタンに小さな 🍌 バッジが表示されていれば有効です。ボタン自体は引き続き Gemini のものです。
- **プレビュー時に透かしを除去**（不安定）: 画面に表示される画像も処理します。処理が遅く、処理中に画像が一瞬ちらつくことがあります。

## Gemini 自身の設定

Gemini には、目に見える透かしを切り替える公式の設定が追加されつつあります。**設定 → Media watermark → Off** です。アカウントにこの項目がある場合は、そちらを使い、Voyager の透かし除去はオフにしてください。Gemini の設定のほうが確実です。Voyager はこれについて一度だけ案内を表示し、最近の画像にすでに透かしがない場合もお知らせします。まだこの項目が見つからない場合は、Voyager を引き続き使ってください。どちらの方法でも、SynthID と C2PA のメタデータは残ります。

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="Image Refinement のデモ" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 謝辞

この機能は、[journey-ad (Jad)](https://github.com/journey-ad) 氏の [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) プロジェクトに基づいています。このプロジェクトは、[allenk](https://github.com/allenk) 氏による [元の C++ 実装](https://github.com/allenk/GeminiWatermarkTool) を JavaScript に移植したものです。コミュニティへの貢献に感謝します。🧡
保持している MIT ライセンスの表示は、[THIRD_PARTY_NOTICES.md](https://github.com/voyager-crew/voyager/blob/main/THIRD_PARTY_NOTICES.md) で確認できます。

## プライバシーとセキュリティ

すべての処理は **ブラウザの中で** 行われます。画像が第三者のサーバーにアップロードされることはありません。プライバシーと創作の安全を守ります。
