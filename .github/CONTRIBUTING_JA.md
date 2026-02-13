# 貢献ガイド

> [!IMPORTANT]
> **プロジェクトの状態: 低頻度メンテナンス。** 返信が遅れる可能性があります。テスト付きのPRが優先されます。

Gemini Voyager への貢献をご検討いただきありがとうございます！🚀

このドキュメントでは、貢献のためのガイドラインと手順を説明します。バグ修正、新機能、ドキュメントの改善、翻訳など、あらゆる貢献を歓迎します。

## 🚫 AI ポリシー

**手動で検証されていない AI 生成の PR は明示的に拒否します。**

AI ツールは優れたアシスタントですが、「怠惰な」コピー＆ペーストの貢献はメンテナの時間を浪費します。

- **低品質な AI PR** は、議論なしに即座にクローズされます。
- ロジックの**説明がない PR** や、必要なテストが不足している PR は拒否されます。
- あなたは提出するすべてのコード行を理解し、責任を負う必要があります。

## 目次

- [はじめに](#はじめに)
- [Issue の担当](#issue-の担当)
- [開発環境のセットアップ](#開発環境のセットアップ)
- [変更の実施](#変更の実施)
- [Pull Request の送信](#pull-request-の送信)
- [コードスタイル](#コードスタイル)
- [Gem サポートの追加](#gem-サポートの追加)
- [ライセンス](#ライセンス)

---

## はじめに

### 前提条件

- **Bun** 1.0+（必須）
- テスト用の Chromium ベースのブラウザ（Chrome, Edge, Brave など）

### クイックスタート

```bash
# リポジトリをクローン
git clone https://github.com/Nagi-ovo/gemini-voyager.git
cd gemini-voyager

# 依存関係をインストール
bun install

# 開発モードを開始
bun run dev
```

---

## Issue の担当

重複作業を避け、貢献を調整するために：

### 1. 既存の作業を確認

開始する前に、Issue の **Assignees** セクションを見て、すでに誰かが担当していないか確認してください。

### 2. Issue を担当する

未割り当ての Issue に `/claim` とコメントすると、自動的にあなた自身が担当者に割り当てられます。ボットが割り当てを確認します。

### 3. 必要に応じて担当を解除

Issue に取り組めなくなった場合は、`/unclaim` とコメントして、他の人のために解放してください。

### 4. 貢献のチェックボックス

Issue を作成する際、「I am willing to contribute code」チェックボックスをオンにして、機能の実装や修正に興味があることを示すことができます。

---

## 開発環境のセットアップ

### 依存関係のインストール

```bash
bun install
```

### 利用可能なコマンド

| コマンド              | 説明                                      |
| --------------------- | ----------------------------------------- |
| `bun run dev`         | Chrome 開発モードを開始（ホットリロード） |
| `bun run dev:firefox` | Firefox 開発モードを開始                  |
| `bun run dev:safari`  | Safari 開発モードを開始（macOS のみ）     |
| `bun run build`       | Chrome 用のプロダクションビルド           |
| `bun run build:all`   | 全ブラウザ用のプロダクションビルド        |
| `bun run lint`        | ESLint を実行して自動修正                 |
| `bun run typecheck`   | TypeScript の型チェックを実行             |
| `bun run test`        | テストスイートを実行                      |

### 拡張機能の読み込み

1. `bun run dev` を実行して開発ビルドを開始します
2. Chrome を開き、`chrome://extensions/` に移動します
3. 「デベロッパー モード」を有効にします
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、`dist_chrome` フォルダを選択します

---

## 変更の実施

### 作業を始める前に

1. `main` から**ブランチを作成**します：

   ```bash
   git checkout -b feature/your-feature-name
   # または
   git checkout -b fix/your-bug-fix
   ```

2. **Issue をリンクする** - 新機能の実装については、**まず議論のために Issue を提出する必要があります**。事前の議論なしに提出された新機能の PR はクローズされます。PR を送信する際は、その Issue をリンクしてください。

3. **変更を集中させる** - PR ごとに1つの機能または修正

### コミット前チェックリスト

送信する前に、必ず以下を実行してください：

```bash
bun run lint       # リンティングの問題を修正
bun run format     # コードの整形
bun run typecheck  # 型をチェック
bun run build      # ビルドが成功することを確認
bun run test       # テストを実行
```

以下を確認してください：

1. 変更内容が期待通りに機能すること。
2. 既存の機能に影響を与えていないこと。

---

## テスト戦略

私たちは「ROI に基づく」テスト戦略に従います：**DOM ではなくロジックをテストしてください。**

1. **必須 (Logic)**: コアサービス (ストレージ、バックアップ)、データパーサー、ユーティリティ。ここでは TDD が必須です。
2. **推奨 (State)**: 複雑な UI 状態 (例: フォルダ Reducer)。
3. **スキップ (Fragile)**: 直接的な DOM 操作 (Content Scripts) や純粋な UI コンポーネント。代わりに防御的プログラミングを使用してください。

---

## Pull Request の送信

### PR ガイドライン

1. **タイトル**: 明確で説明的なタイトルを使用してください（例："feat: add dark mode toggle" または "fix: timeline scroll sync"）
2. **説明**: どのような変更を行ったか、およびその理由を説明してください
3. **ユーザーへの影響**: ユーザーにどのような影響があるかを説明してください
4. **視覚的証拠 (厳格)**: UI の変更や新機能については、**必ず**スクリーンショットまたは画面録画を提供してください。**スクリーンショットなし = レビュー/返信しません。**
5. **Issue の参照**: 関連する Issue をリンクしてください（例："Closes #123"）

### コミットメッセージの形式

[Conventional Commits](https://www.conventionalcommits.org/) に従ってください：

- `feat:` - 新機能
- `fix:` - バグ修正
- `docs:` - ドキュメントの変更
- `chore:` - メンテナンス作業
- `refactor:` - コードのリファクタリング
- `test:` - テストの追加または更新

---

## コードスタイル

### 一般的なガイドライン

- ネストされた条件分岐よりも**早期リターンを優先**
- **説明的な名前を使用** - 略語は避ける
- **マジックナンバーを避ける** - 名前付き定数を使用
- **既存のスタイルに合わせる** - 好みよりも一貫性

### TypeScript の規約

- **PascalCase**: クラス、インターフェース、型、Enum、React コンポーネント
- **camelCase**: 関数、変数、メソッド
- **UPPER_SNAKE_CASE**: 定数

### インポートの順序

1. React および関連するインポート
2. サードパーティライブラリ
3. 内部の絶対インポート（`@/...`）
4. 相対インポート（`./...`）
5. 型のみのインポート

```typescript
import React, { useState } from 'react';

import { marked } from 'marked';

import { Button } from '@/components/ui/Button';
import { StorageService } from '@/core/services/StorageService';
import type { FolderData } from '@/core/types/folder';

import { parseData } from './parser';
```

---

## Gem サポートの追加

新しい Gem（公式 Google Gems またはカスタム Gems）のサポートを追加するには：

1. `src/pages/content/folder/gemConfig.ts` を開きます
2. `GEM_CONFIG` 配列に新しいエントリを追加します：

```typescript
{
  id: 'your-gem-id',           // URL から取得: /gem/your-gem-id/...
  name: 'Your Gem Name',       // 表示名
  icon: 'material_icon_name',  // Google Material Symbols アイコン
}
```

### Gem ID の見つけ方

- Gem との会話を開きます
- URL を確認します: `https://gemini.google.com/app/gem/[GEM_ID]/...`
- 設定で `[GEM_ID]` の部分を使用します

### アイコンの選択

有効な [Google Material Symbols](https://fonts.google.com/icons) アイコン名を使用してください：

| アイコン       | 使用例               |
| -------------- | -------------------- |
| `auto_stories` | 学習、教育           |
| `lightbulb`    | アイデア、ブレスト   |
| `work`         | キャリア、専門職     |
| `code`         | プログラミング、技術 |
| `analytics`    | データ、分析         |

---

## プロジェクトの範囲

Gemini Voyager は、以下の機能で Gemini AI チャット体験を向上させます：

- タイムラインナビゲーション
- フォルダ整理
- プロンプトヴォルト
- チャットのエクスポート
- UI カスタマイズ

**範囲外**: サイトのスクレイピング、ネットワーク傍受、アカウントの自動化。

---

## ヘルプを得る

- 💬 [GitHub Discussions](https://github.com/Nagi-ovo/gemini-voyager/discussions) - 質問する
- 🐛 [Issues](https://github.com/Nagi-ovo/gemini-voyager/issues) - バグを報告する
- 📖 [ドキュメント](https://gemini-voyager.vercel.app/) - ドキュメントを読む

---

## ライセンス

貢献することにより、あなたの貢献が [GPLv3 ライセンス](../LICENSE) の下でライセンスされることに同意したものとみなされます。
