<p align="center">
  <img src="../prismerlogo.jpeg" alt="Prismer.AI" width="120" />
</p>

<h1 align="center">Prismer.AI</h1>

<p align="center">
  <strong>オープンソースの OpenAI Prism 代替</strong>
</p>

<p align="center">
  <a href="https://learn.prismer.ai/">Learn</a> ·
  <a href="https://paper.prismer.ai/library">論文閲覧</a> ·
  <a href="https://docs.prismer.ai">ドキュメント</a> ·
  <a href="../roadmap.md">ロードマップ</a>
</p>

<p align="center">
  <a href="https://github.com/LuminPulse-AI/Prismer/stargazers"><img src="https://img.shields.io/github/stars/LuminPulse-AI/Prismer?color=ffcb47&labelColor=black&style=flat-square" alt="Stars"></a>
  <a href="https://github.com/LuminPulse-AI/Prismer/blob/main/LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-blue?labelColor=black&style=flat-square" alt="License"></a>
  <a href="https://discord.gg/VP2HQHbHGn"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white&labelColor=black" alt="Discord"></a>
  <a href="https://x.com/PrismerAI"><img src="https://img.shields.io/twitter/follow/PrismerAI?style=flat-square&logo=x&labelColor=black" alt="X (Twitter)"></a>
  <a href="https://www.linkedin.com/company/prismer-ai"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
</p>

<p align="center">
  <a href="../../README.md"><img alt="English" src="https://img.shields.io/badge/English-d9d9d9"></a>
  <a href="./README.zh-CN.md"><img alt="简体中文" src="https://img.shields.io/badge/简体中文-d9d9d9"></a>
  <a href="./README.ja.md"><img alt="日本語" src="https://img.shields.io/badge/日本語-d9d9d9"></a>
  <a href="./README.fr.md"><img alt="Français" src="https://img.shields.io/badge/Français-d9d9d9"></a>
  <a href="./README.de.md"><img alt="Deutsch" src="https://img.shields.io/badge/Deutsch-d9d9d9"></a>
</p>

---

## 🚀 公開中のプロダクト

<table>
<tr>
<td align="center">
<a href="https://learn.prismer.ai/">
<img src="https://img.shields.io/badge/🎓_Learn-今すぐ試す-blue?style=for-the-badge&labelColor=black" alt="Learn">
</a>
<br/>
<sub>Prismer を効果的に使うための学習リソース</sub>
</td>
</tr>
<tr>
<td align="center">
<a href="https://paper.prismer.ai/library">
<img src="https://img.shields.io/badge/📖_論文閲覧-今すぐ試す-blue?style=for-the-badge&labelColor=black" alt="Paper Reading">
</a>
<br/>
<sub>引用グラフ付きAIネイティブPDFリーダー</sub>
</td>
</tr>
</table>

---

## Prismer.AI とは？

Prismer.AI は、論文を読むことから出版まで、学術ワークフロー全体をカバーする**オープンソースの研究プラットフォーム**です。

執筆（Overleaf）やメモ（Notion）のみを扱うツールとは異なり、Prismer.AI は以下を統合しています：

| 機能 | 説明 |
|------|------|
| 📖 **論文閲覧** | 引用グラフ付きAIネイティブPDFリーダー |
| 📊 **データ分析** | Python/R実行可能なJupyterノートブック |
| ✍️ **論文執筆** | リアルタイムプレビュー付きLaTeXエディタ |
| 🔍 **引用検証** | 学術データベースに対する参考文献の自動チェック |
| 🤖 **マルチエージェントシステム** | 研究のための専門AIエージェントの連携 |

---

## 機能比較

| 機能 | Prismer.AI | OpenAI Prism | Overleaf | Google Scholar |
|------|:----------:|:------------:|:--------:|:--------------:|
| 論文閲覧 | ✅ | ❌ | ❌ | ✅ |
| LaTeX執筆 | ✅ | ✅ | ✅ | ❌ |
| データ分析 | ✅ | ❌ | ❌ | ❌ |
| コード実行 | ✅ | ❌ | ❌ | ❌ |
| 引用検証 | ✅ | ❌ | ❌ | ❌ |
| マルチエージェント | ✅ | ❌ | ❌ | ❌ |
| オープンソース | ✅ | ❌ | ❌ | ❌ |
| セルフホスト | ✅ | ❌ | ❌ | ❌ |

---

## ✨ 主な機能

### 📖 論文リーダー

研究論文のためのAIネイティブPDFリーダー：
- 同期スクロール付きマルチドキュメントビュー
- 双方向引用グラフ
- 論文コンテキストを使ったAIチャット
- 図表抽出
- OCRデータ統合

### ✍️ LaTeX エディタ

モダンなLaTeXエディタ：
- リアルタイムKaTeXプレビュー
- マルチファイルプロジェクトサポート
- テンプレートライブラリ（IEEE、ACM、Nature、arXiv）
- 自動修正付きスマートエラー回復

### 🔍 引用検証

LLMは引用を捏造します。Prismer.AI は **Reviewer Agent** でこの問題を解決し、論文に引用が表示される前に、学術データベース（arXiv、Semantic Scholar、CrossRef）に対してすべての参考文献を検証します。

---

## 📦 オープンソースコンポーネント

すべてのコアコンポーネントはMITライセンスで、独立して使用できます：

| パッケージ | 説明 |
|-----------|------|
| `@prismer/paper-reader` | AIチャット付きPDFリーダー |
| `@prismer/latex-editor` | ライブプレビュー付きLaTeXエディタ |
| `@prismer/academic-tools` | arXiv、Semantic Scholar API |
| `@prismer/jupyter-kernel` | ブラウザネイティブノートブック |
| `@prismer/code-sandbox` | WebContainerコード実行 |
| `@prismer/agent-protocol` | マルチエージェント連携 |

👉 使用例は[コンポーネントドキュメント](../components.md)をご覧ください。

---

## 🛠️ セルフホスティング

近日公開。このリポジトリにStarを付けて通知を受け取りましょう！

```bash
# Dockerデプロイメント（近日公開）
docker run -d -p 3000:3000 prismer/prismer
```

---

## 🗺️ ロードマップ

| 完了 | 進行中 |
|------|--------|
| ✅ 論文リーダー | 🚧 Reviewer Agent |
| ✅ LaTeXエディタ | 🚧 npmパッケージ抽出 |
| ✅ マルチエージェントシステム | 🚧 ドキュメントサイト |
| | 🚧 セルフホスティングガイド |

詳細は[完全なロードマップ](../roadmap.md)をご覧ください。

---

## 🤝 コントリビューション

コントリビューションを歓迎します！まず[コントリビューションガイド](../../CONTRIBUTING.md)をお読みください。

<a href="https://github.com/LuminPulse-AI/Prismer/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=LuminPulse-AI/Prismer" />
</a>

---

## ⭐ Star履歴

[![Star History Chart](https://api.star-history.com/svg?repos=LuminPulse-AI/Prismer&type=Date)](https://star-history.com/#LuminPulse-AI/Prismer&Date)

---

## 📄 ライセンス

- **コンポーネント** (`@prismer/*`): [MITライセンス](../../LICENSE.md)
- **プラットフォーム**: Business Source License

---

<p align="center">
  <sub>研究者による、研究者のために構築。</sub>
</p>
