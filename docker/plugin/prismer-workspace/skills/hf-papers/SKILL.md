---
name: hf-papers
description: "Browse trending papers, search by keyword, and get paper details from Hugging Face Papers. Use when the user wants to find ML research, asks about recent AI papers, trending models, or mentions Hugging Face Papers."
metadata:
  openclaw:
    emoji: 🤗
    tags: [huggingface, research, academic, papers, trending]
    requires:
      bins: []
      os: [darwin, linux, win32]
---

# hf-papers

Browse, search, and analyze papers from the Hugging Face Papers platform.

## Process

1. **Discover** — Use `hf_daily_papers` to see what's trending today
2. **Search** — Use `hf_search_papers` to find papers on a topic
3. **Inspect** — Use `hf_paper_detail` to get full metadata for a specific paper
4. **Discuss** — Use `hf_paper_comments` to read community discussion
5. **Deep read** — Use `arxiv_fetch` (from arxiv-reader) with the paper's arXiv ID for full text

## Tools

- `hf_daily_papers` — Get trending papers. Params: `limit` (default: 20), `sort` (`upvotes` or `date`)
- `hf_search_papers` — Search by keyword. Params: `query` (required)
- `hf_paper_detail` — Get paper metadata. Params: `paper_id` (required, arXiv ID)
- `hf_paper_comments` — Get discussion comments. Params: `paper_id` (required)

**Example:**
```json
{ "query": "multimodal reasoning" }
```

See canonical skill at `/skills/hf-papers/` for full tool documentation and parameter details.
