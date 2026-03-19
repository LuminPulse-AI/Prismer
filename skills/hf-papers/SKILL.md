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

Browse, search, and analyze papers from the Hugging Face Papers platform. Get trending papers, search by topic, and retrieve detailed metadata including community engagement and linked resources.

## Description

This skill wraps the Hugging Face Papers public API. It provides access to daily trending papers, keyword search, paper details (abstract, authors, upvotes, GitHub repos, project pages), and discussion comments. No authentication required.

For full paper text, use the returned arXiv ID with the `arxiv-reader` skill.

Results are cached locally (`~/.cache/hf-papers/`) for fast repeat access.

## Usage Examples

- "What are today's trending papers on Hugging Face?"
- "Search Hugging Face Papers for diffusion models"
- "Get details for paper 2401.12345 on HF"
- "Show me comments on HF paper 2405.67890"

## Process

1. **Discover** — Use `hf_daily_papers` to see what's trending today
2. **Search** — Use `hf_search_papers` to find papers on a topic
3. **Inspect** — Use `hf_paper_detail` to get full metadata for a specific paper
4. **Discuss** — Use `hf_paper_comments` to read community discussion
5. **Deep read** — Use `arxiv_fetch` (from arxiv-reader) with the paper's arXiv ID for full text

## Tools

### hf_daily_papers

Get today's trending papers from Hugging Face.

**Parameters:**
- `limit` (number, optional): Max papers to return (default: 20, max: 100)
- `sort` (string, optional): Sort by `upvotes` or `date` (default: `upvotes`)

**Returns:** `{ papers: [{ id, title, summary, upvotes, authors, publishedAt, githubRepo?, projectPage?, ai_summary?, ai_keywords? }], count: number }`

**Example:**
```json
{ "limit": 10, "sort": "upvotes" }
```

### hf_search_papers

Search Hugging Face Papers by keyword.

**Parameters:**
- `query` (string, required): Search query

**Returns:** `{ papers: [{ id, title, summary, upvotes, authors, publishedAt, githubRepo?, projectPage?, ai_summary? }], query: string, count: number }`

**Example:**
```json
{ "query": "multimodal reasoning" }
```

### hf_paper_detail

Get detailed metadata for a specific paper.

**Parameters:**
- `paper_id` (string, required): Paper ID (arXiv ID, e.g. `2401.12345`)

**Returns:** `{ id, title, summary, authors, publishedAt, upvotes, numComments, githubRepo?, githubStars?, projectPage?, ai_summary?, ai_keywords?, organization? }`

**Example:**
```json
{ "paper_id": "2401.12345" }
```

### hf_paper_comments

Get discussion comments for a paper.

**Parameters:**
- `paper_id` (string, required): Paper ID (arXiv ID)

**Returns:** `{ paper_id, comments: [{ author, content, createdAt }], count: number }`

**Example:**
```json
{ "paper_id": "2401.12345" }
```

## Notes

- All results are cached locally — repeat requests are instant (15-minute TTL for daily/search, 1-hour for details)
- Paper IDs are arXiv IDs — use with `arxiv-reader` skill for full LaTeX text
- No authentication required; uses HF public API
- Daily papers update throughout the day as the community submits and upvotes
