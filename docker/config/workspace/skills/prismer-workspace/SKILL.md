---
name: prismer-workspace
description: "Core academic workspace tools: LaTeX compilation, Jupyter execution, PDF loading, UI control, content updates, and arXiv paper conversion. Use when the user asks to compile LaTeX, run Python code, load PDFs, display data, or control workspace editors."
---

# Prismer Workspace Skill

Control Prismer.AI academic workspace components and execute research operations.

## Tools

### latex_compile

Compile LaTeX source code to PDF. **Auto-switches UI to LaTeX editor** and sends compile result.

**Parameters:**
- `content` (string, required): LaTeX source code to compile
- `filename` (string, optional): Output filename without extension (default: "document")
- `engine` (string, optional): "pdflatex" | "xelatex" | "lualatex" (default: "pdflatex")

**Returns:** PDF URL on success, error message on failure.

**Example:**
```
latex_compile content="\\documentclass{article}\\begin{document}Hello World\\end{document}"
```

---

### jupyter_execute

Execute Python code in a Jupyter kernel. **Auto-switches UI to Jupyter notebook** and displays results.

**Parameters:**
- `code` (string, required): Python code to execute
- `kernel` (string, optional): Kernel name (default: "python3")

**Returns:** Execution outputs including stdout, stderr, and display data.

**Example:**
```
jupyter_execute code="import numpy as np\nprint(np.pi)"
```

---

### jupyter_notebook

Create, read, update, delete, or list Jupyter notebooks.

**Parameters:**
- `path` (string, required): Path to the notebook or directory
- `operation` (string, required): "create" | "read" | "update" | "delete" | "list"
- `content` (object, optional): Notebook content for create/update operations

**Example:**
```
jupyter_notebook path="analysis.ipynb" operation="create" content={"cells": [...]}
jupyter_notebook path="/workspace" operation="list"
```

---

### load_pdf

Load a PDF document in the workspace viewer. **Auto-switches UI to PDF reader**.

**Parameters:**
- `source` (string, required): URL or path to PDF file
- `page` (number, optional): Page number to navigate to (default: 1)

**Example:**
```
load_pdf source="/workspace/papers/paper.pdf" page=5
```

---

### arxiv_to_prompt

Convert an arXiv paper to flattened LaTeX optimized for LLM reading. Downloads the paper source, strips comments, and outputs clean text.

**Parameters:**
- `arxiv_id` (string, required): arXiv paper ID (e.g., "2303.08774")
- `remove_comments` (boolean, optional): Remove LaTeX comments (default: true)
- `remove_appendix` (boolean, optional): Remove appendix sections (default: false)
- `abstract_only` (boolean, optional): Extract only the abstract
- `list_sections` (boolean, optional): List all section names
- `figure_paths` (boolean, optional): Only include figure file paths

**Examples:**
```
arxiv_to_prompt arxiv_id="2303.08774"
arxiv_to_prompt arxiv_id="2303.08774" abstract_only=true
arxiv_to_prompt arxiv_id="2303.08774" list_sections=true
```

---

### switch_component

Switch the active workspace component.

**Parameters:**
- `component` (string, required): Target component name
  - "pdf-reader"
  - "latex-editor"
  - "jupyter-notebook"
  - "code-playground"
  - "ai-editor" (Notes editor)
  - "ag-grid"
  - "bento-gallery"
  - "three-viewer"

**Example:**
```
switch_component component="jupyter-notebook"
```

---

### update_notes

Update the Notes editor (ai-editor) with HTML content. **Auto-switches to Notes editor.** Use for creating experiment templates, writing notes, or inserting structured content.

**Parameters:**
- `content` (string, required): HTML content to set in the editor

**Example:**
```
update_notes content="<h1>Experiment Notes</h1><h2>Objective</h2><p>Evaluate YOLOv8 on COCO 2017...</p>"
```

---

### update_latex

Update the LaTeX editor with source code without compiling. **Auto-switches to LaTeX editor.** Use for creating or editing LaTeX documents before compilation.

**Parameters:**
- `file` (string, optional): Filename (default: "main.tex")
- `content` (string, required): LaTeX source code

**Example:**
```
update_latex content="\\documentclass[conference]{IEEEtran}\\begin{document}\\title{My Paper}\\end{document}"
```

---

### update_notebook

Add or update cells in the Jupyter notebook without executing. **Auto-switches to Jupyter notebook.** Use for setting up notebook content.

**Parameters:**
- `cells` (array, required): Array of cells with `{type: "code"|"markdown", source: string}`
- `execute` (boolean, optional): Whether to execute code cells (default: false)

**Example:**
```
update_notebook cells=[{"type": "code", "source": "import numpy as np\nimport matplotlib.pyplot as plt"}] execute=false
```

---

### send_ui_directive

Send a raw UI directive for advanced workspace control. Use the dedicated tools above when possible.

**Parameters:**
- `type` (string, required): Directive type
- `payload` (object, required): Directive payload

**Supported directive types:**
- `SWITCH_COMPONENT` - Switch active component
- `UPDATE_LATEX` - Update LaTeX editor content (`{file, content}`)
- `UPDATE_NOTES` - Update Notes editor content (`{content}`)
- `UPDATE_NOTEBOOK` - Update Jupyter cells (`{cells, execute}`)
- `JUPYTER_ADD_CELL` - Add a single Jupyter cell (`{source, outputs}`)
- `LATEX_COMPILE_COMPLETE` - Signal compilation finished (`{pdfUrl, filename}`)
- `JUPYTER_CELL_RESULT` - Signal cell execution result (`{code, outputs, success}`)
- `PDF_LOAD_DOCUMENT` - Load PDF document (`{source, page}`)

### data_load

Load a data file (CSV, XLSX, JSON, Parquet, TSV) into the AG Grid viewer. **Auto-switches to AG Grid.** This is the PRIMARY tool for displaying tabular data.

**Parameters:**
- `filename` (string, required): File path relative to /workspace/data/
- `sheet` (string, optional): Sheet name for XLSX files
- `maxRows` (number, optional): Maximum rows to display (default: 5000)

**Example:**
```
data_load filename="data/results.csv"
```

---

### data_query

Execute pandas operations on the currently loaded DataFrame. **Updates the AG Grid** with filtered/sorted results.

**Parameters:**
- `query` (string, required): Pandas code (assign result to `result` variable)

**Example:**
```
data_query query="result = df.sort_values('h_index', ascending=False).head(20)"
```

---

### update_gallery

Update the bento gallery with images. **Auto-switches to Gallery.**

**Parameters:**
- `images` (array, required): Array of `{url, title, description}`

**Example:**
```
update_gallery images=[{"url": "/workspace/data/plot.png", "title": "Analysis Chart"}]
```

## CRITICAL: Tool Usage Rules

**You MUST call workspace tools to render content in the UI. NEVER just describe or print content in your text reply.**

The user's workspace has visual editors (Notes, LaTeX, Jupyter, etc.). When the user asks you to create, write, or generate content, you MUST call the appropriate tool so the content appears in the editor. Your text reply should only be a brief confirmation of what you did.

### Routing Rules

| User Intent | Required Tool | DO NOT |
|---|---|---|
| Write notes, summaries, reviews | `update_notes` (HTML) | Print notes in chat |
| Write LaTeX paper, survey, article | `update_latex` or `latex_project` | Print LaTeX in chat |
| Run Python code, plot, visualize | `jupyter_execute` | Print code in chat |
| Show data table, CSV | `data_load` or `data_query` | Print table in chat |
| Show images, figures | `update_gallery` | Just describe images |

### Examples

**User:** "write notes about vLLM"
**Correct:** Call `update_notes` with HTML content about vLLM
**Wrong:** Reply with a text description of vLLM

**User:** "plot sin and cos"
**Correct:** Call `jupyter_execute` with matplotlib code
**Wrong:** Print Python code in chat message

**User:** "write a survey about transformers"
**Correct:** Call `update_latex` or `latex_project` with LaTeX source
**Wrong:** Reply with LaTeX source in a code block

### Response Pattern

1. Call the appropriate workspace tool(s)
2. Reply with a SHORT confirmation: "Created notes about X in the editor." or "Compiled LaTeX survey — check the PDF viewer."
3. Do NOT repeat the full content in your text reply

## General Usage Notes

- Tools with "auto-switch" automatically switch to the correct editor. No need to call `switch_component` separately.
- Use `latex_compile` to compile and show PDF. Use `update_latex` to just set editor content.
- Use `jupyter_execute` to run code and show results. Use `update_notebook` to set up cells without running.
- Use `update_notes` for creating structured documents, experiment templates, or review reports.
- Use `data_load` to display CSV/Excel data in AG Grid. Use `data_query` to sort/filter. Do NOT use `code_execute` for simple data display.
- Use `update_gallery` to show images/plots in the gallery. Do NOT just save files without calling this.
- Use `arxiv_to_prompt` to read arXiv papers before analysis.
- Coordinate multiple tools for complex research workflows.
