<p align="center">
  <img src="../prismerlogo.jpeg" alt="Prismer.AI" width="120" />
</p>

<h1 align="center">Prismer.AI</h1>

<p align="center">
  <strong>Alternative Open Source à OpenAI Prism</strong>
</p>

<p align="center">
  <a href="https://learn.prismer.ai/">Learn</a> ·
  <a href="https://paper.prismer.ai/library">Lecture de Papers</a> ·
  <a href="https://docs.prismer.ai">Documentation</a> ·
  <a href="../roadmap.md">Feuille de Route</a>
</p>

<p align="center">
  <a href="https://github.com/Prismer-AI/Prismer/stargazers"><img src="https://img.shields.io/github/stars/Prismer-AI/Prismer?color=ffcb47&labelColor=black&style=flat-square" alt="Stars"></a>
  <a href="https://github.com/Prismer-AI/Prismer/blob/main/LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-blue?labelColor=black&style=flat-square" alt="License"></a>
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

## 🚀 Produits en Ligne

<table>
<tr>
<td align="center">
<a href="https://learn.prismer.ai/">
<img src="https://img.shields.io/badge/🎓_Learn-Essayer-blue?style=for-the-badge&labelColor=black" alt="Learn">
</a>
<br/>
<sub>Cours et ressources d'apprentissage pour utiliser Prismer efficacement</sub>
</td>
</tr>
<tr>
<td align="center">
<a href="https://paper.prismer.ai/library">
<img src="https://img.shields.io/badge/📖_Lecture_Papers-Essayer-blue?style=for-the-badge&labelColor=black" alt="Paper Reading">
</a>
<br/>
<sub>Lecteur PDF natif IA avec graphes de citations</sub>
</td>
</tr>
</table>

---

## Qu'est-ce que Prismer.AI ?

Prismer.AI est une **plateforme de recherche open source** qui couvre l'ensemble du flux de travail académique — de la lecture d'articles à la publication.

Contrairement aux outils qui ne gèrent que l'écriture (Overleaf) ou la prise de notes (Notion), Prismer.AI intègre :

| Fonctionnalité | Description |
|----------------|-------------|
| 📖 **Lecture de Papers** | Lecteur PDF natif IA avec graphes de citations |
| 📊 **Analyse de Données** | Notebooks Jupyter avec exécution Python/R |
| ✍️ **Rédaction de Papers** | Éditeur LaTeX avec aperçu en temps réel |
| 🔍 **Vérification des Citations** | Vérification automatique des références dans les bases académiques |
| 🤖 **Système Multi-Agent** | Orchestration d'agents IA spécialisés pour la recherche |

---

## Comparaison

| Fonctionnalité | Prismer.AI | OpenAI Prism | Overleaf | Google Scholar |
|----------------|:----------:|:------------:|:--------:|:--------------:|
| Lecture de Papers | ✅ | ❌ | ❌ | ✅ |
| Rédaction LaTeX | ✅ | ✅ | ✅ | ❌ |
| Analyse de Données | ✅ | ❌ | ❌ | ❌ |
| Exécution de Code | ✅ | ❌ | ❌ | ❌ |
| Vérification Citations | ✅ | ❌ | ❌ | ❌ |
| Multi-Agent | ✅ | ❌ | ❌ | ❌ |
| Open Source | ✅ | ❌ | ❌ | ❌ |
| Auto-hébergé | ✅ | ❌ | ❌ | ❌ |

---

## ✨ Fonctionnalités Clés

### 📖 Lecteur de Papers

Lecteur PDF natif IA pour les articles de recherche :
- Vue multi-documents avec défilement synchronisé
- Graphe de citations bidirectionnel
- Chat IA avec contexte du paper
- Extraction de figures/tableaux
- Intégration de données OCR

### ✍️ Éditeur LaTeX

Éditeur LaTeX moderne :
- Aperçu KaTeX en temps réel
- Support de projets multi-fichiers
- Bibliothèque de modèles (IEEE, ACM, Nature, arXiv)
- Récupération d'erreurs intelligente avec correction automatique

### 🔍 Vérification des Citations

Les LLMs fabriquent des citations. Prismer.AI résout ce problème avec un **Reviewer Agent** qui valide chaque référence contre les bases de données académiques (arXiv, Semantic Scholar, CrossRef) avant qu'elle n'apparaisse dans votre paper.

---

## 📦 Composants Open Source

Tous les composants principaux sont sous licence MIT et peuvent être utilisés indépendamment :

| Package | Description |
|---------|-------------|
| `@prismer/paper-reader` | Lecteur PDF avec chat IA |
| `@prismer/latex-editor` | Éditeur LaTeX avec aperçu en direct |
| `@prismer/academic-tools` | APIs arXiv, Semantic Scholar |
| `@prismer/jupyter-kernel` | Notebooks natifs navigateur |
| `@prismer/code-sandbox` | Exécution de code WebContainer |
| `@prismer/agent-protocol` | Orchestration multi-agent |

👉 Voir la [Documentation des Composants](../components.md) pour des exemples d'utilisation.

---

## 🛠️ Auto-hébergement

Bientôt disponible. Mettez une étoile à ce repo pour être notifié !

```bash
# Déploiement Docker (bientôt disponible)
docker run -d -p 3000:3000 prismer/prismer
```

---

## 🗺️ Feuille de Route

| Terminé | En Cours |
|---------|----------|
| ✅ Lecteur de Papers | 🚧 Reviewer Agent |
| ✅ Éditeur LaTeX | 🚧 Extraction packages npm |
| ✅ Système multi-agent | 🚧 Site de documentation |
| | 🚧 Guide d'auto-hébergement |

Voir la [feuille de route complète](../roadmap.md) pour les détails.

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Veuillez d'abord lire notre [Guide de Contribution](../../CONTRIBUTING.md).

<a href="https://github.com/Prismer-AI/Prismer/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Prismer-AI/Prismer" />
</a>

---

## ⭐ Historique des Stars

[![Star History Chart](https://api.star-history.com/svg?repos=Prismer-AI/Prismer&type=Date)](https://star-history.com/#Prismer-AI/Prismer&Date)

---

## 📄 Licence

- **Composants** (`@prismer/*`): [Licence MIT](../../LICENSE.md)
- **Plateforme**: Business Source License

---

<p align="center">
  <sub>Construit pour les chercheurs, par des chercheurs.</sub>
</p>
