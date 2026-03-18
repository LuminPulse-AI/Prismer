<p align="center">
  <img src="../../docker/screenshots/onboarding.png" alt="OpenPrismer" width="600" />
</p>

<h1 align="center">OpenPrismer Docker</h1>

<p align="center">
  <strong>Plateforme de recherche académique auto-hébergée propulsée par l'IA</strong>
</p>

<p align="center">
  <a href="#-démarrage-rapide">Démarrage rapide</a> ·
  <a href="#-fonctionnalités">Fonctionnalités</a> ·
  <a href="#-configuration">Configuration</a> ·
  <a href="#-référence-api">Référence API</a>
</p>

<p align="center">
  <a href="https://github.com/Prismer-AI/Prismer/stargazers"><img src="https://img.shields.io/github/stars/Prismer-AI/Prismer?color=ffcb47&labelColor=black&style=flat-square" alt="Stars"></a>
  <a href="https://github.com/Prismer-AI/Prismer/blob/main/LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-blue?labelColor=black&style=flat-square" alt="License"></a>
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

## Vue d'ensemble

OpenPrismer est un **environnement de recherche académique entièrement conteneurisé** qui regroupe :

- **Chat IA** avec support multi-fournisseurs (Google, Anthropic, OpenAI, Venice, OpenRouter)
- **Python/Jupyter** pour l'analyse et la visualisation de données
- **LaTeX/TeX Live** pour la compilation d'articles
- **Coq/Z3** pour la vérification formelle

Tous les services tournent dans un seul conteneur Docker avec une interface web.

---

## 🚀 Démarrage rapide

### 1. Télécharger et lancer

```bash
docker run -d \
  --name openprismer \
  -p 3000:3000 \
  -v openprismer-data:/workspace \
  ghcr.io/prismer-ai/openprismer:latest
```

### 2. Ouvrir le navigateur

Accédez à **http://localhost:3000**

### 3. Configurer le fournisseur IA

Au premier lancement, choisissez votre fournisseur IA et saisissez votre clé API :

| Fournisseur | Modèles | Notes |
|-------------|---------|-------|
| **Google AI** | Gemini 2.5 Flash/Pro | Recommandé pour la vitesse |
| **Anthropic** | Claude Opus 4.5, Sonnet | Idéal pour le raisonnement complexe |
| **OpenAI** | GPT-4o, o1 | Modèles ChatGPT |
| **Venice AI** | Claude, Llama (anonymisé) | Axé confidentialité |
| **OpenRouter** | 100+ modèles | API unifiée |

Votre clé API est stockée localement et n'est jamais envoyée à nos serveurs.

---

## ✨ Fonctionnalités

### Assistant de recherche IA

Discutez avec un agent IA qui peut :
- Rechercher des articles académiques (arXiv, Semantic Scholar)
- Exécuter du code Python pour l'analyse de données
- Générer des visualisations avec matplotlib/seaborn
- Compiler des documents LaTeX en PDF
- Vérifier des preuves avec Coq/Z3

<p align="center">
  <img src="../../docker/screenshots/jupyter.png" alt="Visualisation Jupyter" width="700" />
</p>

### Éditeur LaTeX avec aperçu PDF

Écrivez du LaTeX avec compilation en temps réel via TeX Live du conteneur :
- Moteurs **pdflatex**, **xelatex**, **lualatex**
- Modèles IEEE, ACM, Nature
- Aperçu PDF instantané

<p align="center">
  <img src="../../docker/screenshots/latex.png" alt="Éditeur LaTeX" width="700" />
</p>

### Notebooks Jupyter

Stack Python scientifique préinstallée :
- numpy, scipy, pandas, polars
- matplotlib, seaborn, plotly
- scikit-learn, pytorch, transformers
- sympy pour les mathématiques symboliques

### Vérification formelle

- Assistant de preuve **Coq**
- Solveur SMT **Z3**

---

## ⚙️ Configuration

### Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `FRONTEND_PORT` | `3000` | Port de l'interface web |
| `LATEX_PORT` | `8080` | Serveur LaTeX (interne) |
| `PROVER_PORT` | `8081` | Serveur Prover (interne) |
| `JUPYTER_PORT` | `8888` | Serveur Jupyter (interne) |
| `GATEWAY_PORT` | `18900` | Passerelle Agent (interne) |

### Volumes

| Chemin | Description |
|--------|-------------|
| `/workspace/projects` | Fichiers de projet |
| `/workspace/notebooks` | Notebooks Jupyter |
| `/workspace/output` | Artéfacts générés (PDF, images) |

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

## 🔨 Compilation depuis les sources

```bash
# Cloner
git clone https://github.com/Prismer-AI/Prismer.git
cd Prismer/docker

# Construire
docker build -t openprismer .

# Lancer
docker run -d --name openprismer -p 3000:3000 -v openprismer-data:/workspace openprismer
```

---

## 📡 Référence API

### API Chat

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

### Compilation LaTeX

```bash
POST /api/v1/services/latex
Content-Type: application/json

{
  "source_content": "\\documentclass{article}\\begin{document}Hello\\end{document}",
  "engine": "pdflatex"
}
```

### API Fichiers

```bash
# Lister un répertoire
GET /api/v1/files?path=/projects

# Contenu d'un fichier
GET /api/v1/files?path=/output/document.pdf

# Envoi de fichier
POST /api/v1/files
Content-Type: multipart/form-data
```

### API Artéfacts

```bash
# Lister les artéfacts générés
GET /api/v1/artifacts

# Supprimer un artéfact
DELETE /api/v1/artifacts?path=/output/old.pdf
```

---

## 🏗️ Architecture

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

## 🔧 Dépannage

### Le conteneur ne démarre pas

```bash
# Consulter les logs
docker logs openprismer

# Vérifier que les ports sont libres
lsof -i :3000
```

### Échec de compilation LaTeX

Utilisez l'un des moteurs supportés :
- `pdflatex` (par défaut)
- `xelatex` (Unicode/polices)
- `lualatex` (scripts Lua)

### Paquets Python manquants

Le conteneur inclut une stack scientifique complète. Pour en ajouter :

```bash
docker exec -it openprismer pip install package-name
```

---

## 📄 Licence

Licence MIT - Voir [LICENSE](../../LICENSE.md)

---

<p align="center">
  <sub>Built for researchers, by researchers.</sub>
</p>
