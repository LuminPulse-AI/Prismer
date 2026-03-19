---
name: latex-compiler
description: "Compile LaTeX documents to PDF using pdflatex, xelatex, or lualatex with template support. Use when the user asks to compile .tex files, build a LaTeX document, generate PDF from LaTeX, or typeset an academic paper."
_source: Canonical source at /skills/latex-compiler/SKILL.md
---

# latex-compiler

Compile LaTeX documents to PDF directly from the workspace. Supports multiple engines, bibliography processing, and starter templates.

## Process

1. **Choose template** — Use `latex_templates` to see available templates, then `latex_get_template` to get starter content
2. **Write LaTeX** — Edit the source document
3. **Compile** — Use `latex_compile` to generate the PDF. If compilation fails, check the `errors` field and fix syntax issues before recompiling
4. **Preview** — Use `latex_preview` to get an inline base64 PDF for display

## Tools

- `latex_compile` — Compile LaTeX source to PDF. Params: `content` (required), `filename`, `engine`, `bibliography`, `runs`
- `latex_preview` — Compile and return PDF as base64. Params: `content` (required), `filename`, `engine`, `bibliography`
- `latex_templates` — List available templates and engines. No params.
- `latex_get_template` — Get template source. Params: `name` (required: `article`, `article-zh`, `beamer`, `ieee`)

**Example:**
```json
{ "content": "\\documentclass{article}\\begin{document}Hello\\end{document}", "engine": "pdflatex" }
```

See [canonical skill](/skills/latex-compiler/SKILL.md) for full tool documentation and parameter details.
