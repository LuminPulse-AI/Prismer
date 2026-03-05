---
name: latex-compiler
description: Compile LaTeX documents to PDF using pdflatex, xelatex, or lualatex with template support
---

# latex-compiler

Compile LaTeX documents to PDF directly from the workspace. Supports multiple engines, bibliography processing, and starter templates.

## Description

This skill wraps the container's LaTeX server (port 8080) which provides pdflatex, xelatex, and lualatex compilation. It supports bibliography processing via biber, multi-pass compilation for cross-references, and includes starter templates for common document types.

## Usage Examples

- "Compile this LaTeX document to PDF"
- "Preview the PDF output of my paper"
- "What LaTeX templates are available?"
- "Give me the IEEE template"
- "Compile this with xelatex for Chinese support"

## Process

1. **Choose template** — Use `latex_templates` to see available templates, then `latex_get_template` to get starter content
2. **Write LaTeX** — Edit the source document
3. **Compile** — Use `latex_compile` to generate the PDF (saved in container)
4. **Preview** — Use `latex_preview` to get an inline base64 PDF for display

## Tools

### latex_compile

Compile LaTeX source to PDF. The PDF is saved inside the container.

**Parameters:**
- `content` (string, required): Full LaTeX source code
- `filename` (string, optional): Output filename stem (default: `document`)
- `engine` (string, optional): `pdflatex` | `xelatex` | `lualatex` (default: `pdflatex`)
- `bibliography` (string, optional): BibTeX/BibLaTeX content (triggers biber)
- `runs` (number, optional): Compilation passes (default: 2 for cross-references)

**Returns:** `{ success, pdf_path, log, errors, warnings, compile_id }`

**Example:**
```json
{ "content": "\\documentclass{article}\\begin{document}Hello\\end{document}", "engine": "pdflatex" }
```

### latex_preview

Compile LaTeX source and return the PDF as base64 for inline preview.

**Parameters:**
- `content` (string, required): Full LaTeX source code
- `filename` (string, optional): Output filename stem (default: `document`)
- `engine` (string, optional): `pdflatex` | `xelatex` | `lualatex` (default: `pdflatex`)
- `bibliography` (string, optional): BibTeX/BibLaTeX content (triggers biber)

**Returns:** `{ success, pdf_base64, pdf_path, log, errors, warnings, compile_id }`

**Example:**
```json
{ "content": "\\documentclass{article}\\begin{document}Hello\\end{document}" }
```

### latex_templates

List available LaTeX templates and supported engines.

**Parameters:** None

**Returns:** `{ templates: string[], engines: string[] }`

### latex_get_template

Get the LaTeX source of a starter template.

**Parameters:**
- `name` (string, required): Template name — `article`, `article-zh`, `beamer`, `ieee`

**Returns:** `{ name, content }`

**Example:**
```json
{ "name": "ieee" }
```

## Notes

- Chinese documents (`article-zh`) require `xelatex` or `lualatex` engine
- Compilation timeout is 120 seconds per run
- Multi-pass compilation (default 2 runs) resolves cross-references and TOC
- If `bibliography` is provided, biber runs automatically between passes
- PDFs are saved to `/home/user/output/reports/` inside the container
