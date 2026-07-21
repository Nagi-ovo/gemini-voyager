# 貢献ガイド

> [!CAUTION]
> **本プロジェクトは現在、新機能の PR を受け付けていません。** どうしても実装したい機能がある場合は、以下のプロセスに従ってください：
>
> 1. **まず Issue を作成して**、メンテナーとアイデアやアプローチについて議論してください
> 2. **承認と確実な実装計画が決まってから**、コードを書いて PR を提出してください
>
> 事前の議論なしに提出された新機能の PR は、レビューなしにクローズされます。ご理解のほどよろしくお願いいたします。

> [!IMPORTANT]
> **プロジェクトの状態: 低頻度メンテナンス。** 返信が遅れる可能性があります。テスト付きのPRが優先されます。

Voyager への貢献をご検討いただきありがとうございます！🚀

このドキュメントでは、貢献のためのガイドラインと手順を説明します。バグ修正、ドキュメントの改善、翻訳などの貢献を歓迎します。新機能については、まず Issue で議論してください。

## AI 支援 PR ポリシー

**AI を利用した貢献を歓迎しますが、各 PR は提出者自身がレビューし、検証する必要があります。**

AI ツールは有用ですが、明確な目的、絞られた範囲、実際の検証を欠くコピー＆ペーストの貢献は、メンテナーの時間を浪費します。

- PR の目的、範囲、動作の変更、検証結果には提出者が責任を負います。Agent が生成したすべての行を完全に理解する必要はありませんが、PR が何を解決し、なぜその方法が妥当なのかを説明できなければなりません。
- コーディング前に、要件、影響範囲、期待する動作、検証方法を Agent と明確にしてください。
- PR は一つの問題または一貫した変更に絞り、無関係な変更をまとめないでください。
- 検証を最優先し、変更後は実際のフローを自分で試してください。UI や動作の変更では、可能であれば約 15 分間実際に使用してください。
- 検証後に PR を提出し、スクリーンショット、画面録画、変更前後の比較などの視覚的な証拠を添えてください。

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

- **Bun 1.3.12**（`packageManager` および CI と統一）
- 共有ランタイムの変更を実環境で確認するための Chrome と Firefox
- Chromium、権限、Manifest、パッケージングに関わる変更を確認するための Edge
- Safari に影響する変更をマージ前に確認するための Safari/macOS

リスクマトリクスと正確な手順は [ブラウザの読み込みとスモークテスト](BROWSER_TESTING.md) を参照してください。環境がない場合は `Needs <browser> test` と担当者を記録してください。AI による推測はテストの証拠にはなりません。

`bun run build:edge` と `bun run verify:pr` には `zip` CLI が必要です。Windows では WSL を使用するか、実行できなかった項目と補完する担当者を PR に記載してください。

### クイックスタート

```bash
# リポジトリをクローン
git clone https://github.com/Nagi-ovo/voyager.git
cd voyager

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

`community-only` ラベルが付いていない未割り当ての Issue では、`/claim` とコメントすると自動的に担当者へ割り当てられます。ボットが割り当てを確認します。

### 3. コミュニティ限定 Issue

`community-only` ラベルの Issue は、確認済みの Voyager コミュニティメンバー専用です：

1. コミュニティメンバーが `/claim` とコメントします。
2. メンテナーがメンバー資格を確認し、`/approve @username` とコメントします。
3. ボットによる割り当て後に実装や PR の作成を開始してください。

このラベルを付けると、`help wanted` と `good first issue` は自動的に削除されます。その他のコントリビューターは [Voyager Discord](https://discord.gg/TEUFxdMbGb) に参加するか、`community-only` のない Issue を選択してください。

### 4. 必要に応じて担当を解除

Issue に取り組めなくなった場合は、`/unclaim` とコメントして、他の人のために解放してください。

### 5. 貢献のチェックボックス

Issue を作成する際、「I am willing to contribute code」チェックボックスをオンにして、機能の実装や修正に興味があることを示すことができます。

---

## 開発環境のセットアップ

### 依存関係のインストール

```bash
bun install
```

### 利用可能なコマンド

| コマンド                 | 説明                                                                         |
| ------------------------ | ---------------------------------------------------------------------------- |
| `bun run dev`            | Chrome 開発モードを開始（ホットリロード）                                    |
| `bun run dev:firefox`    | Firefox 開発モードを開始                                                     |
| `bun run dev:safari`     | Safari 開発モードを開始（macOS のみ）                                        |
| `bun run build`          | Chrome 用のプロダクションビルド                                              |
| `bun run build:edge`     | Edge の独立ビルドとパッケージ作成                                            |
| `bun run build:all`      | Chrome + Firefox + Safari（Edge は含まない）                                 |
| `bun run build:browsers` | Chrome + Edge + Firefox + Safari                                             |
| `bun run lint`           | ESLint を実行して自動修正                                                    |
| `bun run typecheck`      | TypeScript の型チェックを実行                                                |
| `bun run test`           | テストスイートを実行                                                         |
| `bun run verify:pr`      | 標準のローカル自動検証（macOS ネイティブと実ブラウザでの動作確認は含まない） |

### 拡張機能の読み込み

通常の Chrome 開発では `bun run dev:chrome` を実行し、`chrome://extensions/` から `dist_chrome_dev` を読み込みます。Chrome、Edge、Firefox、Safari の正確な成果物、読み込みと再読み込みの手順、合格基準は [ブラウザの読み込みとスモークテスト](BROWSER_TESTING.md) を参照してください。

---

## 変更の実施

### 作業を始める前に

1. `main` から**ブランチを作成**します：

   ```bash
   git checkout -b feature/your-feature-name
   # または
   git checkout -b fix/your-bug-fix
   ```

2. **Issue をリンクする** - 新機能については、**Issue を作成し、実装方針に対するメンテナーの明示的な承認を待ってください**。`/claim` や担当者への割り当ては責任者を示すだけで、新機能の承認を意味しません。PR から該当 Issue をリンクしてください。
3. **必ず PR を使用する** - リポジトリへのすべての変更はトピックブランチから `main` 宛ての PR として提出し、`main` に直接コミットをプッシュしないでください。

### コミット前チェックリスト

送信する前に、必ず以下を実行してください：

```bash
bun run format     # コードの整形
bun run lint       # 安全な Lint 修正を適用
bun run verify:pr  # 標準のローカル自動検証（macOS ネイティブと実ブラウザでの動作確認は含まない）
```

以下を確認してください：

1. 変更内容が期待通りに機能すること。
2. 既存の機能に影響を与えていないこと。
3. PR に [ブラウザテストマトリクス](BROWSER_TESTING.md) が求めるブラウザバージョン、成果物、結果、証拠を記録していること。

---

## テスト戦略

ファイル種別を理由に一律でテストを省略せず、最も回帰しやすいインターフェースを検証してください：

1. **ロジックと状態**：コアサービス、ストレージ、パーサー、ユーティリティ、複雑な UI 状態には自動テストが必要です。
2. **Content Script / DOM**：セレクター、マウントとクリーンアップ、SPA ナビゲーション、第三者 DOM との契約を変更する場合は、最小限の DOM fixture を使った回帰テストを追加してください。
3. **実ブラウザ**：自動テストは、拡張機能の読み込みや実際のフロー確認の代わりにはなりません。[ブラウザテストマトリクス](BROWSER_TESTING.md) に従ってください。表示だけの変更では、新しい単体テストが有用でない理由を説明できます。

---

## Pull Request の送信

### PR ガイドライン

1. **タイトル**: 明確で説明的なタイトルを使用してください（例："feat: add dark mode toggle" または "fix: timeline scroll sync"）
2. **説明**: どのような変更を行ったか、およびその理由を説明してください
3. **ユーザーへの影響**: ユーザーにどのような影響があるかを説明してください
4. **視覚的証拠 (厳格)**: UI の変更や新機能については、**必ず**スクリーンショットまたは画面録画を提供してください。**スクリーンショットなし = レビュー/返信しません。**
5. **Issue の参照**: 関連する Issue をリンクしてください（例："Closes #123"）
6. **テストとロジック**: 動作変更には関連する自動回帰テストが必要です。有用なテストがない場合は、その理由と変更ロジックを明確に説明してください。背景説明のない「魔法のような」修正は受け付けません。
7. **ブラウザごとの証拠**: Chrome、Edge、Firefox、Safari の状態を個別に記録してください。必要なブラウザを利用できない場合は `Needs <browser> test` と担当者を記載し、ビルド成功を読み込み済みまたは実際のフローでのテスト済みとして報告しないでください。

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

Voyager は、以下の機能で Gemini AI チャット体験を向上させます：

- タイムラインナビゲーション
- フォルダ整理
- プロンプトヴォルト
- チャットのエクスポート
- UI カスタマイズ

> [!NOTE]
> **Voyager の機能セットはすでに十分に充実していると考えています。** ニッチすぎる、あるいは過度に個人的な機能を追加しても、ソフトウェアの改善にはつながらず、メンテナンスの負担が増えるだけです。その機能が本当に必要不可欠で、大多数のユーザーにとって有益であると確信できない限り、Feature Request の送信を再検討してください。

**範囲外**: サイトのスクレイピング、ネットワーク傍受、アカウントの自動化。

---

## ヘルプを得る

- 💬 [GitHub Discussions](https://github.com/Nagi-ovo/voyager/discussions) - 質問する
- 🐛 [Issues](https://github.com/Nagi-ovo/voyager/issues) - バグを報告する
- 📖 [ドキュメント](https://voyager.nagi.fun/) - ドキュメントを読む

---

## ライセンス

貢献することにより、あなたの貢献が [GPLv3 ライセンス](../LICENSE) の下でライセンスされることに同意したものとみなされます。
