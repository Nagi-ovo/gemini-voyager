# NanoBanana オプション

::: warning ブラウザの互換性
現在、**NanoBanana** ウォーターマーク除去機能は、ブラウザの API の制限により **Safari ではサポートされていません**。この機能を使用する必要がある場合は、**Chrome** または **Firefox** を使用することをお勧めします。

Safari ユーザーは、ダウンロードした画像を [banana.ovo.re](https://banana.ovo.re/) などのツールサイトにアップロードして手動で除去することも可能です（ただし、画像の解像度の違いにより、すべての画像で成功するとは限りません）。
:::

**AI 画像、あるべき純粋な姿へ。**

Gemini が生成する画像には、デフォルトで目に見える透かしが入っています。これは安全上の理由によるものですが、創作活動においては、完全にクリーンな素材が必要な場合もあるでしょう。

## 無劣化復元

NanoBanana は **逆アルファブレンドアルゴリズム (Reverse Alpha Blending)** を採用しています。

- **AI による再描画なし**: 従来の透かし除去ツールが多用する AI による塗りつぶしは、画像の細部を破壊してしまいます。
- **ピクセル精度の復元**: 私たちは計算によって、ピクセル上の透かしの透明層を正確に取り除き、オリジナルのピクセルを 100% 復元します。
- **品質劣化ゼロ**: 処理前後の画像は、透かし以外の部分において完全に一致します。

## 使い方

1. **機能を有効化**: Gemini Voyager の設定パネル末尾にある「NanoBanana オプション」を見つけ、「NanoBanana 透かし除去」をオンにします。
2. **自動処理**: これ以降、あなたが生成するすべての画像に対し、バックグラウンドで自動的に透かし除去処理が行われます。
3. **直接ダウンロード**:
   - 処理済みの画像にマウスを乗せると、🍌 ボタンが表示されます。
   - **🍌 ボタンは標準のダウンロードボタンを完全に置き換えます**。クリックするだけで、100% 透かしのない画像を直接ダウンロードできます。

<div style="text-align: center; margin-top: 30px;">
  <img src="/assets/nanobanana.png" alt="NanoBanana Example" style="border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-width: 100%;"/>
</div>

## 特別謝辞

本機能は、[journey-ad (Jad)](https://github.com/journey-ad) 氏が開発した [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) プロジェクトに基づいています。このプロジェクトは、[allenk](https://github.com/allenk) 氏による [GeminiWatermarkTool C++ 版](https://github.com/allenk/GeminiWatermarkTool) の JavaScript 移植版です。オープンソースコミュニティへの多大なる貢献に感謝します。🧡

## プライバシーとセキュリティ

すべての透かし除去処理は、あなたの **ブラウザ内でローカル** に完了します。画像がいかなる第三者のサーバーにアップロードされることはなく、あなたのプライバシーと創作の安全は守られます。
