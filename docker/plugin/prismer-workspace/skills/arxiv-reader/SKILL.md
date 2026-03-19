---
name: arxiv-reader
description: "Read and analyze arXiv papers by fetching LaTeX source, listing sections, or extracting abstracts. Use when the user mentions arXiv, research papers, preprints, paper IDs like 2301.xxxxx, or wants to read academic publications."
_source: Canonical source at /skills/arxiv-reader/SKILL.md
---

# arxiv-reader

Read and analyze arXiv papers directly from the workspace. Converts LaTeX source into clean text suitable for LLM analysis.

## Process

1. **Quick look** — Use `arxiv_abstract` to get a paper's abstract before committing to a full read
2. **Survey structure** — Use `arxiv_sections` to understand the paper's outline
3. **Deep read** — Use `arxiv_fetch` to get the full flattened LaTeX for analysis

## Tools

- `arxiv_fetch` — Fetch full flattened LaTeX source. Params: `arxiv_id` (required), `remove_comments`, `remove_appendix`, `figure_paths`
- `arxiv_sections` — List all sections and subsections. Params: `arxiv_id` (required)
- `arxiv_abstract` — Extract just the abstract. Params: `arxiv_id` (required)

**Example:**
```json
{ "arxiv_id": "2301.00001", "remove_appendix": true }
```

See [canonical skill](/skills/arxiv-reader/SKILL.md) for full tool documentation and parameter details.
