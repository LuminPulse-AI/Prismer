export type SkillCategory =
  | 'latex'
  | 'jupyter'
  | 'pdf'
  | 'citation'
  | 'data'
  | 'writing'
  | 'general';

export interface SkillTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  category: SkillCategory;
  author?: string;
  repository?: string;
  tools: SkillTool[];
  dependencies: string[];
  builtin?: boolean;
}

export const BUILTIN_SKILLS: SkillManifest[] = [
  {
    id: 'prismer-workspace',
    name: 'Prismer Workspace',
    version: '1.0.0',
    description:
      'Core academic workspace tools including LaTeX compilation, Jupyter execution, PDF processing, and UI control',
    category: 'general',
    author: 'Prismer Team',
    builtin: true,
    tools: [
      { name: 'latex_compile', description: 'Compile LaTeX document to PDF', parameters: {} },
      { name: 'latex_preview', description: 'Preview LaTeX output', parameters: {} },
      { name: 'jupyter_execute', description: 'Execute Jupyter notebook cell', parameters: {} },
      { name: 'jupyter_create_cell', description: 'Create new Jupyter cell', parameters: {} },
      { name: 'pdf_extract_text', description: 'Extract text from PDF document', parameters: {} },
      { name: 'pdf_get_sections', description: 'Get PDF document sections', parameters: {} },
      { name: 'ui_show_component', description: 'Show UI component in workspace', parameters: {} },
      { name: 'ui_send_directive', description: 'Send UI directive to frontend', parameters: {} },
      { name: 'arxiv_to_prompt', description: 'Convert arXiv paper to LLM prompt', parameters: {} },
    ],
    dependencies: [],
  },
  {
    id: 'find-skills',
    name: 'Find Skills',
    version: '1.0.0',
    description: 'Discover and manage skills for Prismer.AI workspace',
    category: 'general',
    author: 'Prismer Team',
    builtin: true,
    tools: [
      { name: 'skill_search', description: 'Search for skills', parameters: {} },
      { name: 'skill_info', description: 'Get skill details', parameters: {} },
      { name: 'skill_install', description: 'Install a skill', parameters: {} },
      { name: 'skill_list', description: 'List installed skills', parameters: {} },
      { name: 'skill_uninstall', description: 'Uninstall a skill', parameters: {} },
      { name: 'skill_update', description: 'Update skills', parameters: {} },
    ],
    dependencies: [],
  },
  {
    id: 'arxiv-reader',
    name: 'arXiv Reader',
    version: '1.0.0',
    description:
      'Read and analyze arXiv papers. Fetch full LaTeX source, list sections, or extract abstracts.',
    category: 'pdf',
    author: 'Prismer Team',
    builtin: true,
    tools: [
      { name: 'arxiv_fetch', description: 'Fetch full flattened LaTeX source of an arXiv paper', parameters: {} },
      { name: 'arxiv_sections', description: 'List all sections and subsections of an arXiv paper', parameters: {} },
      { name: 'arxiv_abstract', description: 'Extract just the abstract from an arXiv paper', parameters: {} },
    ],
    dependencies: [],
  },
];

export const CLOUD_SKILLS_CATALOG: SkillManifest[] = [
  {
    id: 'latex-cite',
    name: 'LaTeX Citation Manager',
    version: '1.2.0',
    description:
      'Manage citations and bibliography in LaTeX documents. Supports BibTeX, BibLaTeX, and natbib.',
    category: 'citation',
    author: 'Prismer Community',
    repository: 'https://github.com/prismer/skill-latex-cite',
    tools: [
      { name: 'cite_search', description: 'Search for citations in databases', parameters: {} },
      { name: 'cite_format', description: 'Format citation in various styles', parameters: {} },
      { name: 'bib_manage', description: 'Manage bibliography entries', parameters: {} },
    ],
    dependencies: ['prismer-workspace'],
  },
  {
    id: 'bib-sync',
    name: 'Bibliography Sync',
    version: '1.0.0',
    description: 'Sync bibliography with Zotero, Mendeley, or EndNote.',
    category: 'citation',
    author: 'Prismer Community',
    tools: [
      { name: 'bib_connect', description: 'Connect to reference manager', parameters: {} },
      { name: 'bib_sync', description: 'Sync bibliography', parameters: {} },
      { name: 'bib_import', description: 'Import references', parameters: {} },
    ],
    dependencies: ['prismer-workspace'],
  },
  {
    id: 'stats-helper',
    name: 'Statistics Helper',
    version: '2.0.0',
    description:
      'Statistical analysis assistance for academic research. Suggests appropriate tests and interprets results.',
    category: 'data',
    author: 'Prismer Community',
    tools: [
      { name: 'stats_suggest', description: 'Suggest statistical test', parameters: {} },
      { name: 'stats_interpret', description: 'Interpret statistical results', parameters: {} },
      { name: 'stats_visualize', description: 'Create statistical visualization', parameters: {} },
    ],
    dependencies: ['prismer-workspace'],
  },
  {
    id: 'method-gen',
    name: 'Methodology Generator',
    version: '1.1.0',
    description: 'Generate methodology sections for academic papers based on research design.',
    category: 'writing',
    author: 'Prismer Community',
    tools: [
      { name: 'method_outline', description: 'Generate methodology outline', parameters: {} },
      { name: 'method_draft', description: 'Draft methodology section', parameters: {} },
    ],
    dependencies: ['prismer-workspace'],
  },
  {
    id: 'figure-export',
    name: 'Figure Export',
    version: '1.0.0',
    description: 'Export figures from PDFs and Jupyter notebooks in publication-ready formats.',
    category: 'pdf',
    author: 'Prismer Community',
    tools: [
      { name: 'figure_extract', description: 'Extract figure from document', parameters: {} },
      { name: 'figure_convert', description: 'Convert figure format', parameters: {} },
      { name: 'figure_optimize', description: 'Optimize for publication', parameters: {} },
    ],
    dependencies: ['prismer-workspace'],
  },
  {
    id: 'table-formatter',
    name: 'Table Formatter',
    version: '1.0.0',
    description: 'Format data tables for LaTeX, Markdown, or HTML output.',
    category: 'latex',
    author: 'Prismer Community',
    tools: [
      { name: 'table_format', description: 'Format table', parameters: {} },
      { name: 'table_convert', description: 'Convert table between formats', parameters: {} },
    ],
    dependencies: ['prismer-workspace'],
  },
  {
    id: 'equation-helper',
    name: 'Equation Helper',
    version: '1.0.0',
    description: 'Help write and format mathematical equations in LaTeX.',
    category: 'latex',
    author: 'Prismer Community',
    tools: [
      { name: 'eq_format', description: 'Format equation', parameters: {} },
      { name: 'eq_convert', description: 'Convert equation notation', parameters: {} },
      { name: 'eq_number', description: 'Number equations', parameters: {} },
    ],
    dependencies: ['prismer-workspace'],
  },
  {
    id: 'data-loader',
    name: 'Data Loader',
    version: '1.0.0',
    description: 'Load and preview various data formats in Jupyter notebooks.',
    category: 'jupyter',
    author: 'Prismer Community',
    tools: [
      { name: 'data_load', description: 'Load data file', parameters: {} },
      { name: 'data_preview', description: 'Preview data structure', parameters: {} },
      { name: 'data_convert', description: 'Convert data format', parameters: {} },
    ],
    dependencies: ['prismer-workspace'],
  },
];
