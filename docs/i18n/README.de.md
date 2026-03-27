<p align="center">
  <img src="../prismerlogo.jpeg" alt="Prismer.AI" width="120" />
</p>

<h1 align="center">Prismer.AI</h1>

<p align="center">
  <strong>Open Source Alternative zu OpenAI Prism</strong>
</p>

<p align="center">
  <a href="https://learn.prismer.ai/">Learn</a> ·
  <a href="https://luminpulse.ai/">Paper-Leser</a> ·
  <a href="https://docs.prismer.ai">Dokumentation</a> ·
  <a href="../roadmap.md">Roadmap</a>
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

## 🚀 Live-Produkte

<table>
<tr>
<td align="center">
<a href="https://learn.prismer.ai/">
<img src="https://img.shields.io/badge/🎓_Learn-Jetzt_testen-blue?style=for-the-badge&labelColor=black" alt="Learn">
</a>
<br/>
<sub>Lernressourcen, um Prismer effizient zu nutzen</sub>
</td>
</tr>
<tr>
<td align="center">
<a href="https://luminpulse.ai/">
<img src="https://img.shields.io/badge/📖_Paper_Leser-Jetzt_testen-blue?style=for-the-badge&labelColor=black" alt="Paper Reading">
</a>
<br/>
<sub>KI-nativer PDF-Reader mit Zitationsgraphen</sub>
</td>
</tr>
</table>

---

## Was ist Prismer.AI?

Prismer.AI ist eine **Open-Source-Forschungsplattform**, die den gesamten akademischen Workflow abdeckt — vom Lesen von Papers bis zur Veröffentlichung.

Im Gegensatz zu Tools, die nur Schreiben (Overleaf) oder Notizen (Notion) behandeln, integriert Prismer.AI:

| Funktion | Beschreibung |
|----------|--------------|
| 📖 **Paper-Leser** | KI-nativer PDF-Reader mit Zitationsgraphen |
| 📊 **Datenanalyse** | Jupyter-Notebooks mit Python/R-Ausführung |
| ✍️ **Paper-Schreiben** | LaTeX-Editor mit Echtzeit-Vorschau |
| 🔍 **Zitationsverifikation** | Automatische Überprüfung von Referenzen in akademischen Datenbanken |
| 🤖 **Multi-Agenten-System** | Orchestrierung spezialisierter KI-Agenten für die Forschung |

---

## Vergleich

| Funktion | Prismer.AI | OpenAI Prism | Overleaf | Google Scholar |
|----------|:----------:|:------------:|:--------:|:--------------:|
| Paper-Leser | ✅ | ❌ | ❌ | ✅ |
| LaTeX-Schreiben | ✅ | ✅ | ✅ | ❌ |
| Datenanalyse | ✅ | ❌ | ❌ | ❌ |
| Code-Ausführung | ✅ | ❌ | ❌ | ❌ |
| Zitationsverifikation | ✅ | ❌ | ❌ | ❌ |
| Multi-Agent | ✅ | ❌ | ❌ | ❌ |
| Open Source | ✅ | ❌ | ❌ | ❌ |
| Self-Hosted | ✅ | ❌ | ❌ | ❌ |

---

## ✨ Hauptfunktionen

### 📖 Paper-Reader

KI-nativer PDF-Reader für Forschungsarbeiten:
- Multi-Dokument-Ansicht mit synchronisiertem Scrollen
- Bidirektionaler Zitationsgraph
- KI-Chat mit Paper-Kontext
- Abbildungs-/Tabellenextraktion
- OCR-Datenintegration

### ✍️ LaTeX-Editor

Moderner LaTeX-Editor:
- Echtzeit-KaTeX-Vorschau
- Multi-Datei-Projektunterstützung
- Vorlagenbibliothek (IEEE, ACM, Nature, arXiv)
- Intelligente Fehlerbehebung mit Auto-Fix

### 🔍 Zitationsverifikation

LLMs erfinden Zitate. Prismer.AI löst dieses Problem mit einem **Reviewer Agent**, der jede Referenz gegen akademische Datenbanken (arXiv, Semantic Scholar, CrossRef) validiert, bevor sie in Ihrem Paper erscheint.

---

## 📦 Open-Source-Komponenten

Alle Kernkomponenten sind MIT-lizenziert und können unabhängig verwendet werden:

| Paket | Beschreibung |
|-------|--------------|
| `@prismer/paper-reader` | PDF-Reader mit KI-Chat |
| `@prismer/latex-editor` | LaTeX-Editor mit Live-Vorschau |
| `@prismer/academic-tools` | arXiv, Semantic Scholar APIs |
| `@prismer/jupyter-kernel` | Browser-native Notebooks |
| `@prismer/code-sandbox` | WebContainer Code-Ausführung |
| `@prismer/agent-protocol` | Multi-Agent-Orchestrierung |

👉 Siehe [Komponenten-Dokumentation](../components.md) für Verwendungsbeispiele.

---

## 🛠️ Self-Hosting

Demnächst verfügbar. Geben Sie diesem Repo einen Stern, um benachrichtigt zu werden!

```bash
# Docker-Deployment (demnächst)
docker run -d -p 3000:3000 prismer/prismer
```

---

## 🗺️ Roadmap

| Fertig | In Arbeit |
|--------|-----------|
| ✅ Paper-Reader | 🚧 Reviewer Agent |
| ✅ LaTeX-Editor | 🚧 npm-Paket-Extraktion |
| ✅ Multi-Agent-System | 🚧 Dokumentationsseite |
| | 🚧 Self-Hosting-Anleitung |

Siehe [vollständige Roadmap](../roadmap.md) für Details.

---

## 🤝 Mitwirken

Beiträge sind willkommen! Bitte lesen Sie zuerst unseren [Beitragsguide](../../CONTRIBUTING.md).

<a href="https://github.com/Prismer-AI/Prismer/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Prismer-AI/Prismer" />
</a>

---

## ⭐ Star-Verlauf

[![Star History Chart](https://api.star-history.com/svg?repos=Prismer-AI/Prismer&type=Date)](https://star-history.com/#Prismer-AI/Prismer&Date)

---

## 📄 Lizenz

- **Komponenten** (`@prismer/*`): [MIT-Lizenz](../../LICENSE.md)
- **Plattform**: Business Source License

---

<p align="center">
  <sub>Von Forschern gebaut, für Forscher.</sub>
</p>
