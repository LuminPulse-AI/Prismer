---
name: arxiv-reader
description: Read and analyze arXiv papers by fetching LaTeX source, listing sections, or extracting abstracts
metadata:
  openclaw:
    emoji: 📄
    tags: [arxiv, research, academic, papers, latex]
    requires:
      bins: []
      os: [darwin, linux, win32]
---

# arxiv-reader

Read and analyze arXiv papers directly from the workspace. Converts LaTeX source into clean text suitable for LLM analysis.

## Description

This skill fetches arXiv papers, flattens LaTeX includes, and returns clean text. It works in two modes:

- **Standalone mode** (default): Downloads directly from arXiv using Node.js built-ins. No Docker or Python required.
- **Container mode**: Delegates to the arXiv server (port 8082) if available, for faster processing.

Results are cached locally (`~/.cache/arxiv-reader/` in standalone, `/workspace/.cache/arxiv/` in container) for fast repeat access.

## Usage Examples

- "Read the paper 2301.00001 from arXiv"
- "What sections does paper 2405.12345 have?"
- "Get the abstract of 2312.09876"
- "Fetch paper 2301.00001 without the appendix"

## Process

1. **Quick look** — Use `arxiv_abstract` to get a paper's abstract before committing to a full read
2. **Survey structure** — Use `arxiv_sections` to understand the paper's outline
3. **Deep read** — Use `arxiv_fetch` to get the full flattened LaTeX for analysis

## Tools

### arxiv_fetch

Fetch the full flattened LaTeX source of an arXiv paper.

**Parameters:**
- `arxiv_id` (string, required): arXiv paper ID (e.g. `2301.00001` or `2301.00001v2`)
- `remove_comments` (boolean, optional): Strip LaTeX comments (default: true)
- `remove_appendix` (boolean, optional): Remove appendix sections (default: false)
- `figure_paths` (boolean, optional): Replace figures with file paths only (default: false)

**Returns:** `{ content: string, arxiv_id: string, cached: boolean }`

**Example:**
```json
{ "arxiv_id": "2301.00001", "remove_appendix": true }
```

### arxiv_sections

List all sections and subsections of an arXiv paper.

**Parameters:**
- `arxiv_id` (string, required): arXiv paper ID

**Returns:** `{ arxiv_id: string, sections: string[] }`

**Example:**
```json
{ "arxiv_id": "2301.00001" }
```

### arxiv_abstract

Extract just the abstract from an arXiv paper.

**Parameters:**
- `arxiv_id` (string, required): arXiv paper ID

**Returns:** `{ arxiv_id: string, abstract: string }`

**Example:**
```json
{ "arxiv_id": "2301.00001" }
```

## Notes

- All results are cached locally — repeat requests are instant
- Works standalone (no Docker required) or with the container arXiv server
- Paper IDs support version suffixes (e.g. `2301.00001v2`)
- Very large papers may take 10-30 seconds on first fetch
- `arxiv_abstract` uses the arXiv Atom API for fast metadata retrieval in standalone mode
