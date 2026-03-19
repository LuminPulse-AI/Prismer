---
name: peer-review
description: "Conduct thorough academic peer reviews with structured feedback using load_pdf and arxiv_to_prompt. Use when the user asks to review a paper, provide manuscript feedback, critique research, or write a referee report."
---

# Peer Review Skill

## Description
Conduct thorough academic peer reviews with structured, constructive feedback.

## Tools Used
- `load_pdf` - Load PDF papers in the workspace viewer (auto-switches to PDF reader)
- `arxiv_to_prompt` - Convert arXiv papers to readable text for analysis
- `update_notes` - Write review reports to the Notes editor

## Capabilities

### Paper Analysis
- Extract and summarize main contributions
- Identify methodology and approach
- Evaluate experimental design
- Assess writing quality

### Comparative Analysis
- Find related prior work
- Identify novelty claims
- Check citation completeness
- Verify originality

### Feedback Generation
- Structured review reports
- Specific, actionable comments
- Line-by-line annotations
- Summary recommendations

## Review Process

### Phase 1: Initial Read
1. Read abstract and introduction
2. Understand claimed contributions
3. Skim methodology and results
4. Form initial impression

### Phase 2: Detailed Analysis
1. Carefully read methodology
2. Evaluate experimental design
3. Check result validity
4. Assess reproducibility

### Phase 3: Comparative Check
1. Search for related work
2. Verify novelty claims
3. Check citation coverage
4. Identify missing references

### Phase 4: Report Writing
1. Summarize paper
2. List strengths
3. Detail weaknesses
4. Provide recommendations

## Feedback Templates

### Major Issue
```
[MAJOR] Section X, Page Y
Issue: [Clear description]
Impact: [Why this matters]
Suggestion: [How to address]
```

### Minor Issue
```
[MINOR] Section X
Observation: [Description]
Suggestion: [Improvement]
```

### Question
```
[QUESTION] Section X
The authors claim [X]. Could you clarify:
- [Specific question]
- [Related concern]
```

## Review Report Structure

```markdown
# Paper Review: [Title]

## Summary
[2-3 sentence overview]

## Strengths
1. [Strength with explanation]
2. [Strength with explanation]

## Weaknesses
### Major Issues
1. [Issue with suggestion]

### Minor Issues
1. [Issue with suggestion]

## Questions for Authors
1. [Question]

## Detailed Comments
[Section-by-section feedback]

## Recommendation
[ ] Accept
[ ] Minor Revision
[ ] Major Revision
[ ] Reject

Confidence: [1-5]
```

## Tool Examples

### Load and read an arXiv paper for review
```
arxiv_to_prompt arxiv_id="2303.08774"
```

### Load a PDF submission
```
load_pdf source="/workspace/papers/submission.pdf"
```

### Write the review report
```
update_notes content="<h1>Paper Review: [Title]</h1><h2>Summary</h2><p>...</p><h2>Strengths</h2><ol><li>...</li></ol><h2>Weaknesses</h2><h3>Major Issues</h3><ol><li>...</li></ol><h2>Recommendation</h2><p>Minor Revision — Confidence: 4/5</p>"
```

## Best Practices

1. **Be Constructive**: Focus on improvement, not criticism
2. **Be Specific**: Point to exact locations and issues
3. **Be Fair**: Acknowledge strengths before weaknesses
4. **Verify completeness**: Before writing the final report, confirm you have reviewed all major sections and identified at least 3 strengths
