# Deep Research のエクスポート

Deep Research が生成した最終レポートをエクスポートしたり、その完全な「思考」の過程を Markdown ファイルとして保存したりできます。

## 1. レポートのエクスポート（PDF / 画像）

Deep Research が生成したレポートは、整った書式の PDF や、共有しやすい 1 枚の画像としてエクスポートできます（Markdown と JSON の形式にも対応しています）。レポートの **Share & Export** メニューを開き、**レポートを保存** を選んでください。

![レポートのエクスポート](/assets/deep-research-report-export.png)

## 2. 思考過程のエクスポート（Markdown）

最終レポートに加えて、Deep Research の会話にある「思考」の内容を、完全な形でエクスポートすることもできます。

### 機能

- **ワンクリックでエクスポート**: レポートの **Share & Export** メニューに、ダウンロードの項目が表示されます。
- **構造化された形式**: 思考のフェーズ、思考の項目、参照したウェブサイトを、元の順序のまま保持します。
- **読みやすい見出し**: セクションの見出しは英語です。Voyager の言語を別の言語に設定している場合は、各見出しに英語とその言語が並んで表示されます。
- **自動的な命名**: ファイルにはタイムスタンプが付くため、整理しやすくなります（例：`deep-research-thinking-20251228-172535.md`）。

### 使い方

1. Gemini™ で Deep Research の会話を開きます。
2. レポートの **Share & Export** ボタンをクリックします。
3. **思考内容をダウンロード** を選びます。
4. Markdown ファイルが自動的にダウンロードされます。

![Deep Research の思考過程のエクスポート](/assets/deepresearch_download_thinking.png)

### エクスポートされるファイルの形式

エクスポートされる Markdown ファイルには、次の内容が含まれます。

- **タイトル**: 会話のタイトル
- **メタデータ**: エクスポートした日時と、思考フェーズの総数
- **思考フェーズ**: 各フェーズには次の内容が含まれます。
  - 思考の項目（見出しと内容）
  - 参照したウェブサイト（リンクとタイトル）

#### 構造の例

```markdown
# Deep Research Conversation Title

**Exported At:** 2025-12-28 17:25:35
**Total Phases:** 3

---

## Thinking Phase 1

### Thought Title 1

Thought content...

### Thought Title 2

Thought content...

#### Researched Websites

- [domain.com](https://example.com) - Page Title
- [another.com](https://another.com) - Another Title

---

## Thinking Phase 2

...
```

## プライバシー

抽出と書式の整形は、すべてブラウザの中で **100% ローカル** に行われます。データが外部のサーバーに送信されることはありません。
