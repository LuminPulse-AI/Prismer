<p align="center">
  <img src="../../docker/screenshots/onboarding.png" alt="OpenPrismer" width="600" />
</p>

<h1 align="center">OpenPrismer Docker</h1>

<p align="center">
  <strong>セルフホスト型 AI 学術研究プラットフォーム</strong>
</p>

<p align="center">
  <a href="#-クイックスタート">クイックスタート</a> ·
  <a href="#-機能">機能</a> ·
  <a href="#-設定">設定</a> ·
  <a href="#-api-リファレンス">API リファレンス</a>
</p>

<p align="center">
  <a href="https://github.com/LuminPulse-AI/Prismer/stargazers"><img src="https://img.shields.io/github/stars/LuminPulse-AI/Prismer?color=ffcb47&labelColor=black&style=flat-square" alt="Stars"></a>
  <a href="https://github.com/LuminPulse-AI/Prismer/blob/main/LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-blue?labelColor=black&style=flat-square" alt="License"></a>
  <a href="https://discord.gg/VP2HQHbHGn"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=flat-square&logo=discord&logoColor=white&labelColor=black" alt="Discord"></a>
  <a href="https://x.com/PrismerAI"><img src="https://img.shields.io/twitter/follow/PrismerAI?style=flat-square&logo=x&labelColor=black" alt="X (Twitter)"></a>
  <a href="https://www.linkedin.com/company/prismer-ai"><img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
</p>

<p align="center">
  <a href="../../docker/README.md"><img alt="English" src="https://img.shields.io/badge/English-d9d9d9"></a>
  <a href="./README-docker.zh-CN.md"><img alt="简体中文" src="https://img.shields.io/badge/简体中文-d9d9d9"></a>
  <a href="./README-docker.ja.md"><img alt="日本語" src="https://img.shields.io/badge/日本語-d9d9d9"></a>
  <a href="./README-docker.fr.md"><img alt="Français" src="https://img.shields.io/badge/Français-d9d9d9"></a>
  <a href="./README-docker.de.md"><img alt="Deutsch" src="https://img.shields.io/badge/Deutsch-d9d9d9"></a>
</p>

---

## 概要

OpenPrismer は、以下を統合した**完全コンテナ化された学術研究環境**です：

- **AI チャット**（Google、Anthropic、OpenAI、Venice、OpenRouter 対応）
- **Python/Jupyter** によるデータ分析・可視化
- **LaTeX/TeX Live** による論文コンパイル
- **Coq/Z3** による形式検証

すべてのサービスが単一の Docker コンテナで動作し、Web UI を提供します。

---

## 🚀 クイックスタート

### 1. イメージの取得と実行

```bash
docker run -d \
  --name openprismer \
  -p 3000:3000 \
  -v openprismer-data:/workspace \
  ghcr.io/prismer-ai/openprismer:latest
```

### 2. ブラウザで開く

**http://localhost:3000** にアクセス

### 3. AI プロバイダの設定

初回起動時、AI プロバイダを選択し API キーを入力してください：

| プロバイダ | モデル | 備考 |
|------------|--------|------|
| **Google AI** | Gemini 2.5 Flash/Pro | 速度重視で推奨 |
| **Anthropic** | Claude Opus 4.5、Sonnet | 複雑な推論向け |
| **OpenAI** | GPT-4o、o1 | ChatGPT 系 |
| **Venice AI** | Claude、Llama（匿名） | プライバシー重視 |
| **OpenRouter** | 100+ モデル | 統一 API |

API キーはローカルにのみ保存され、当方サーバーには送信されません。

---

## ✨ 機能

### AI 研究アシスタント

次のような AI エージェントとチャットできます：
- 学術論文の検索（arXiv、Semantic Scholar）
- データ分析用 Python コードの実行
- matplotlib/seaborn による可視化の生成
- LaTeX 文書の PDF コンパイル
- Coq/Z3 による証明の検証

<p align="center">
  <img src="../../docker/screenshots/jupyter.png" alt="Jupyter 可視化" width="700" />
</p>

### PDF プレビュー付き LaTeX エディタ

コンテナ内の TeX Live でリアルタイムコンパイル：
- **pdflatex**、**xelatex**、**lualatex** エンジン
- IEEE、ACM、Nature テンプレート
- 即時 PDF プレビュー

<p align="center">
  <img src="../../docker/screenshots/latex.png" alt="LaTeX エディタ" width="700" />
</p>

### Jupyter ノートブック

科学計算用 Python スタックをプリインストール：
- numpy、scipy、pandas、polars
- matplotlib、seaborn、plotly
- scikit-learn、pytorch、transformers
- sympy（記号計算）

### 形式検証

- **Coq** 証明アシスタント
- **Z3** SMT ソルバ

---

## ⚙️ 設定

### 環境変数

| 変数 | デフォルト | 説明 |
|------|------------|------|
| `FRONTEND_PORT` | `3000` | Web UI ポート |
| `LATEX_PORT` | `8080` | LaTeX サーバ（内部） |
| `PROVER_PORT` | `8081` | Prover サーバ（内部） |
| `JUPYTER_PORT` | `8888` | Jupyter サーバ（内部） |
| `GATEWAY_PORT` | `18900` | Agent ゲートウェイ（内部） |

### ボリュームマウント

| パス | 説明 |
|------|------|
| `/workspace/projects` | プロジェクトファイル |
| `/workspace/notebooks` | Jupyter ノートブック |
| `/workspace/output` | 生成物（PDF、画像など） |

### Docker Compose

```yaml
version: '3.8'

services:
  openprismer:
    image: ghcr.io/prismer-ai/openprismer:latest
    ports:
      - "3000:3000"
    volumes:
      - openprismer-data:/workspace
    restart: unless-stopped

volumes:
  openprismer-data:
```

---

## 🔨 ソースからビルド

```bash
# クローン
git clone https://github.com/LuminPulse-AI/Prismer.git
cd Prismer/docker

# ビルド
docker build -t openprismer .

# 実行
docker run -d --name openprismer -p 3000:3000 -v openprismer-data:/workspace openprismer
```

---

## 📡 API リファレンス

### チャット API

```bash
POST /api/v1/chat
Content-Type: application/json

{
  "session_id": "optional-session-id",
  "content": "Plot a sine wave",
  "stream": true,
  "config": {
    "provider": "google",
    "model": "gemini-2.5-flash",
    "api_key": "your-api-key"
  }
}
```

### LaTeX コンパイル

```bash
POST /api/v1/services/latex
Content-Type: application/json

{
  "source_content": "\\documentclass{article}\\begin{document}Hello\\end{document}",
  "engine": "pdflatex"
}
```

### ファイル API

```bash
# ディレクトリ一覧
GET /api/v1/files?path=/projects

# ファイル内容取得
GET /api/v1/files?path=/output/document.pdf

# ファイルアップロード
POST /api/v1/files
Content-Type: multipart/form-data
```

### アーティファクト API

```bash
# 生成アーティファクト一覧
GET /api/v1/artifacts

# アーティファクト削除
DELETE /api/v1/artifacts?path=/output/old.pdf
```

---

## 🏗️ アーキテクチャ

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser (:3000)                            │
├──────────────────────────────────────────────────────────────┤
│                 Next.js 15 Frontend                           │
│              React 19 + Tailwind CSS 4                        │
├───────────┬───────────┬───────────┬───────────┬──────────────┤
│  LaTeX    │  Prover   │  Jupyter  │  OpenClaw │    Files     │
│  :8080    │  :8081    │  :8888    │  :18900   │    API       │
├───────────┴───────────┴───────────┴───────────┴──────────────┤
│              Academic Base Image                              │
│     Python 3.12 | TeX Live | Coq | Z3 | Node.js 22           │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔧 トラブルシューティング

### コンテナが起動しない

```bash
# ログ確認
docker logs openprismer

# ポート空き確認
lsof -i :3000
```

### LaTeX コンパイルが失敗する

サポートされているエンジンを使用してください：
- `pdflatex`（デフォルト）
- `xelatex`（Unicode/フォント用）
- `lualatex`（Lua スクリプト用）

### Python パッケージが足りない

コンテナには科学計算スタックが含まれています。追加する場合：

```bash
docker exec -it openprismer pip install package-name
```

---

## 📄 ライセンス

MIT License - [LICENSE](../../LICENSE.md) を参照

---

<p align="center">
  <sub>Built for researchers, by researchers.</sub>
</p>
