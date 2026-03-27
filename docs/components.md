# Open Source Components

Prismer.AI is built on modular, reusable components. Each package can be used independently in your own projects.

<p align="center">
  <img src="component_collection.gif" alt="Component Collection Demo" width="800" />
</p>

## Live Products

| Product | URL | Status |
|---------|-----|--------|
| OpenClaw | [luminpulse.ai](https://luminpulse.ai/) | ✅ Live |

---

## @prismer/paper-reader

AI-native PDF reader for research papers.

```tsx
import { PaperReader } from '@prismer/paper-reader';

<PaperReader
  source={{ type: 'arxiv', id: '2301.00234' }}
  onCitationClick={(citation) => openInLibrary(citation)}
  enableAIChat={true}
/>
```

**Features:**
- Multi-document view with synchronized scrolling
- OCR data integration for enhanced search
- Bi-directional citation graph
- AI chat with paper context
- Figure/table extraction

---

## @prismer/latex-editor

Modern LaTeX editor with real-time preview and AI assistance.

```tsx
import { LaTeXEditor } from '@prismer/latex-editor';

<LaTeXEditor
  template="ieee"
  bibliography={bibtexContent}
  onCompile={(pdf) => savePDF(pdf)}
  aiAssist={{
    model: 'claude-3-opus',
    features: ['autocomplete', 'refine', 'translate']
  }}
/>
```

**Features:**
- Real-time KaTeX preview
- Multi-file project support
- Smart error recovery with auto-fix
- Template library (IEEE, ACM, Nature, arXiv)
- Integrated BibTeX management

---

## @prismer/academic-tools

Unified API for academic data sources.

```typescript
import { ArxivSearch, SemanticScholar, CitationVerifier } from '@prismer/academic-tools';

// Search papers
const papers = await ArxivSearch.query({
  query: 'transformer attention mechanism',
  category: 'cs.LG',
  maxResults: 20
});

// Verify citations (anti-hallucination)
const verification = await CitationVerifier.verify(bibtexContent);
if (!verification.allValid) {
  console.log('Invalid citations:', verification.invalid);
}
```

**Supported Sources:**
- arXiv API
- Semantic Scholar
- CrossRef DOI
- Google Scholar (via proxy)
- OpenAlex

---

## @prismer/jupyter-kernel

Browser-native Jupyter notebook with Python/R execution.

```tsx
import { JupyterNotebook } from '@prismer/jupyter-kernel';

<JupyterNotebook
  kernel="python3"
  initialCells={cells}
  onCellExecute={(cell, output) => trackExperiment(cell, output)}
  variables={{ data: experimentData }}
/>
```

**Features:**
- Full Python/R kernel support
- Variable inspector
- Plot rendering (matplotlib, plotly, seaborn)
- Cell-level execution tracking
- Integration with paper figures

---

## @prismer/code-sandbox

Secure code execution environment powered by WebContainer.

```tsx
import { CodePlayground } from '@prismer/code-sandbox';

<CodePlayground
  template="react"
  files={projectFiles}
  onFileChange={(files) => syncToCloud(files)}
/>
```

**Features:**
- Browser-native Node.js runtime
- React/Vue/Vanilla templates
- Real-time preview
- Terminal access
- Package installation (npm)

---

## @prismer/agent-protocol

Open protocol for academic AI agents.

```typescript
import { AgentOrchestrator, LiteratureAgent, DataAgent, ReviewerAgent } from '@prismer/agent-protocol';

const orchestrator = new AgentOrchestrator({
  agents: [
    new LiteratureAgent(),  // Paper discovery & citation
    new DataAgent(),        // Analysis & visualization
    new ReviewerAgent(),    // Verification & review
  ],
  tools: [arxivSearch, latexCompile, pythonExecute],
});

const result = await orchestrator.run({
  task: 'Analyze attention patterns in transformer models',
  outputDir: './research-output'
});
```

**Agent Types:**
| Agent | Purpose |
|-------|---------|
| `BuildAgent` | Task execution & code generation |
| `PlanAgent` | Research planning & design |
| `LiteratureAgent` | Paper discovery & citation management |
| `DataAgent` | Data analysis & statistics |
| `PaperAgent` | LaTeX writing & document preparation |
| `VizAgent` | Visualization & figure generation |
| `ReviewerAgent` | Citation verification & quality review |
