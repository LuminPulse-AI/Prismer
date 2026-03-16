<p align="center">
  <img src="../../docker/screenshots/onboarding.png" alt="OpenPrismer" width="600" />
</p>

<h1 align="center">OpenPrismer Docker</h1>

<p align="center">
  <strong>Selbstgehostete KI-gestützte akademische Forschungsplattform</strong>
</p>

<p align="center">
  <a href="#-schnellstart">Schnellstart</a> ·
  <a href="#-funktionen">Funktionen</a> ·
  <a href="#-konfiguration">Konfiguration</a> ·
  <a href="#-api-referenz">API-Referenz</a>
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

## Überblick

OpenPrismer ist eine **vollständig containerisierte akademische Forschungsumgebung** mit:

- **KI-Chat** mit Multi-Provider-Unterstützung (Google, Anthropic, OpenAI, Venice, OpenRouter)
- **Python/Jupyter** für Datenanalyse und Visualisierung
- **LaTeX/TeX Live** für die Paper-Kompilierung
- **Coq/Z3** für formale Verifikation

Alle Dienste laufen in einem einzigen Docker-Container mit Web-UI.

---

## 🚀 Schnellstart

### 1. Image ziehen und starten

```bash
docker run -d \
  --name openprismer \
  -p 3000:3000 \
  -v openprismer-data:/workspace \
  ghcr.io/prismer-ai/openprismer:latest
```

### 2. Browser öffnen

**http://localhost:3000** im Browser aufrufen.

### 3. KI-Provider konfigurieren

Beim ersten Start Provider wählen und API-Schlüssel eingeben:

| Provider | Modelle | Hinweise |
|----------|---------|----------|
| **Google AI** | Gemini 2.5 Flash/Pro | Empfohlen für Geschwindigkeit |
| **Anthropic** | Claude Opus 4.5, Sonnet | Für komplexe Reasoning-Aufgaben |
| **OpenAI** | GPT-4o, o1 | ChatGPT-Modelle |
| **Venice AI** | Claude, Llama (anonymisiert) | Datenschutzorientiert |
| **OpenRouter** | 100+ Modelle | Einheitliche API |

Der API-Schlüssel wird nur lokal gespeichert und nicht an unsere Server gesendet.

---

## ✨ Funktionen

### KI-Forschungsassistent

Chat mit einem KI-Agenten, der:
- Akademische Papers durchsuchen kann (arXiv, Semantic Scholar)
- Python-Code für Datenanalyse ausführt
- Visualisierungen mit matplotlib/seaborn erstellt
- LaTeX-Dokumente zu PDF kompiliert
- Beweise mit Coq/Z3 verifiziert

<p align="center">
  <img src="../../docker/screenshots/jupyter.png" alt="Jupyter-Visualisierung" width="700" />
</p>

### LaTeX-Editor mit PDF-Vorschau

LaTeX mit Echtzeit-Kompilierung über die TeX-Live-Installation im Container:
- **pdflatex**, **xelatex**, **lualatex**-Engines
- IEEE-, ACM-, Nature-Vorlagen
- Sofortige PDF-Vorschau

<p align="center">
  <img src="../../docker/screenshots/latex.png" alt="LaTeX-Editor" width="700" />
</p>

### Jupyter-Notebooks

Vollständiger wissenschaftlicher Python-Stack vorinstalliert:
- numpy, scipy, pandas, polars
- matplotlib, seaborn, plotly
- scikit-learn, pytorch, transformers
- sympy für symbolische Mathematik

### Formale Verifikation

- **Coq**-Beweisassistent
- **Z3**-SMT-Solver

---

## ⚙️ Konfiguration

### Umgebungsvariablen

| Variable | Standard | Beschreibung |
|----------|----------|--------------|
| `FRONTEND_PORT` | `3000` | Web-UI-Port |
| `LATEX_PORT` | `8080` | LaTeX-Server (intern) |
| `PROVER_PORT` | `8081` | Prover-Server (intern) |
| `JUPYTER_PORT` | `8888` | Jupyter-Server (intern) |
| `GATEWAY_PORT` | `18900` | Agent-Gateway (intern) |

### Volume-Mounts

| Pfad | Beschreibung |
|------|--------------|
| `/workspace/projects` | Projektdateien |
| `/workspace/notebooks` | Jupyter-Notebooks |
| `/workspace/output` | Erzeugte Artefakte (PDFs, Bilder) |

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

## 🔨 Aus Quellcode bauen

```bash
# Klonen
git clone https://github.com/LuminPulse-AI/Prismer.git
cd Prismer/docker

# Bauen
docker build -t openprismer .

# Starten
docker run -d --name openprismer -p 3000:3000 -v openprismer-data:/workspace openprismer
```

---

## 📡 API-Referenz

### Chat-API

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

### LaTeX-Kompilierung

```bash
POST /api/v1/services/latex
Content-Type: application/json

{
  "source_content": "\\documentclass{article}\\begin{document}Hello\\end{document}",
  "engine": "pdflatex"
}
```

### Dateien-API

```bash
# Verzeichnis auflisten
GET /api/v1/files?path=/projects

# Dateiinhalt abrufen
GET /api/v1/files?path=/output/document.pdf

# Datei hochladen
POST /api/v1/files
Content-Type: multipart/form-data
```

### Artefakte-API

```bash
# Erzeugte Artefakte auflisten
GET /api/v1/artifacts

# Artefakt löschen
DELETE /api/v1/artifacts?path=/output/old.pdf
```

---

## 🏗️ Architektur

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

## 🔧 Fehlerbehebung

### Container startet nicht

```bash
# Logs prüfen
docker logs openprismer

# Portverfügbarkeit prüfen
lsof -i :3000
```

### LaTeX-Kompilierung schlägt fehl

Einen der unterstützten Engines verwenden:
- `pdflatex` (Standard)
- `xelatex` (für Unicode/Schriften)
- `lualatex` (für Lua-Skripte)

### Python-Pakete fehlen

Der Container enthält einen vollständigen wissenschaftlichen Stack. Für weitere Pakete:

```bash
docker exec -it openprismer pip install package-name
```

---

## 📄 Lizenz

MIT-Lizenz – siehe [LICENSE](../../LICENSE.md)

---

<p align="center">
  <sub>Built for researchers, by researchers.</sub>
</p>
