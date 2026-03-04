/**
 * find-skills - Skill discovery and management for Prismer.AI
 *
 * This skill enables users and agents to discover, search, and install
 * skills that extend the capabilities of the workspace.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// Skill Types (local definitions to avoid circular dependencies)
// ============================================================

interface Skill {
  name: string;
  description: string;
  version?: string;
  tools: SkillToolDef[];
  initialize?: () => Promise<void>;
}

interface SkillToolDef {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute: (params: any) => Promise<unknown>;
}

interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
  default?: unknown;
}

// ============================================================
// Types
// ============================================================

interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  category: SkillCategory;
  author?: string;
  repository?: string;
  tools: Array<{ name: string; description: string; parameters: Record<string, ToolParameter> }>;
  dependencies: string[];
}

type SkillCategory =
  | 'latex'
  | 'jupyter'
  | 'pdf'
  | 'citation'
  | 'data'
  | 'writing'
  | 'general';

interface SkillSearchResult {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  version: string;
  installed: boolean;
  builtin: boolean;
}

interface SkillInstallResult {
  success: boolean;
  skillId: string;
  version: string;
  message: string;
  setupInstructions?: string[];
}

// ============================================================
// Constants
// ============================================================

const WORKSPACE_SKILLS_DIR = '/workspace/skills';
const BUILTIN_SKILLS_DIR = '/home/user/.openclaw/workspace/skills';
const SKILL_REGISTRY_URL =
  process.env.PRISMER_SKILL_REGISTRY_URL || '';

// Built-in skills that are always available
const BUILTIN_SKILLS: SkillManifest[] = [
  {
    id: 'prismer-workspace',
    name: 'Prismer Workspace',
    version: '1.0.0',
    description:
      'Core academic workspace tools including LaTeX compilation, Jupyter execution, PDF processing, and UI control',
    category: 'general',
    author: 'Prismer Team',
    tools: [
      { name: 'latex_compile', description: 'Compile LaTeX to PDF', parameters: {} },
      { name: 'jupyter_execute', description: 'Execute Python code in Jupyter', parameters: {} },
      { name: 'jupyter_notebook', description: 'Manage Jupyter notebooks', parameters: {} },
      { name: 'load_pdf', description: 'Load PDF in viewer', parameters: {} },
      { name: 'switch_component', description: 'Switch workspace component', parameters: {} },
      { name: 'send_ui_directive', description: 'Send UI directive', parameters: {} },
      { name: 'arxiv_to_prompt', description: 'Convert arXiv paper to prompt', parameters: {} },
      { name: 'update_notes', description: 'Update Notes editor content', parameters: {} },
      { name: 'update_latex', description: 'Update LaTeX editor content', parameters: {} },
      { name: 'update_notebook', description: 'Update Jupyter notebook cells', parameters: {} },
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
    tools: [
      { name: 'skill_search', description: 'Search for skills', parameters: {} },
      { name: 'skill_info', description: 'Get skill details', parameters: {} },
      { name: 'skill_install', description: 'Install a skill', parameters: {} },
      { name: 'skill_list', description: 'List installed skills', parameters: {} },
      { name: 'skill_uninstall', description: 'Uninstall a skill', parameters: {} },
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
    tools: [
      { name: 'arxiv_fetch', description: 'Fetch full flattened LaTeX source of an arXiv paper', parameters: {} },
      { name: 'arxiv_sections', description: 'List all sections and subsections of an arXiv paper', parameters: {} },
      { name: 'arxiv_abstract', description: 'Extract just the abstract from an arXiv paper', parameters: {} },
    ],
    dependencies: [],
  },
];

// Sample cloud skills for demo (in production, fetched from registry)
const CLOUD_SKILLS_CATALOG: SkillManifest[] = [
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
      { name: 'cite_search', description: 'Search citations', parameters: {} },
      { name: 'cite_format', description: 'Format citation', parameters: {} },
      { name: 'bib_manage', description: 'Manage bibliography', parameters: {} },
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
      { name: 'stats_interpret', description: 'Interpret results', parameters: {} },
      { name: 'stats_visualize', description: 'Create statistical plot', parameters: {} },
    ],
    dependencies: ['prismer-workspace'],
  },
  {
    id: 'method-gen',
    name: 'Methodology Generator',
    version: '1.1.0',
    description:
      'Generate methodology sections for academic papers based on research design.',
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
    description:
      'Export figures from PDFs and Jupyter notebooks in publication-ready formats.',
    category: 'pdf',
    author: 'Prismer Community',
    tools: [
      { name: 'figure_extract', description: 'Extract figure from document', parameters: {} },
      { name: 'figure_convert', description: 'Convert figure format', parameters: {} },
      { name: 'figure_optimize', description: 'Optimize for publication', parameters: {} },
    ],
    dependencies: ['prismer-workspace'],
  },
];

// ============================================================
// Helper Functions
// ============================================================

function ensureSkillsDirectory(): void {
  if (!fs.existsSync(WORKSPACE_SKILLS_DIR)) {
    fs.mkdirSync(WORKSPACE_SKILLS_DIR, { recursive: true });
  }
}

function getInstalledSkills(): SkillManifest[] {
  ensureSkillsDirectory();
  const installed: SkillManifest[] = [];

  try {
    const dirs = fs.readdirSync(WORKSPACE_SKILLS_DIR);
    for (const dir of dirs) {
      const manifestPath = path.join(WORKSPACE_SKILLS_DIR, dir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        installed.push(manifest);
      }
    }
  } catch {
    // Directory doesn't exist or is empty
  }

  return installed;
}

function isSkillInstalled(skillId: string): boolean {
  const installed = getInstalledSkills();
  return installed.some((s) => s.id === skillId);
}

function isBuiltinSkill(skillId: string): boolean {
  return BUILTIN_SKILLS.some((s) => s.id === skillId);
}

async function fetchCloudSkills(
  query?: string,
  category?: SkillCategory
): Promise<SkillManifest[]> {
  // In production, this would fetch from SKILL_REGISTRY_URL
  // For now, filter the local catalog

  let results = [...CLOUD_SKILLS_CATALOG];

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }

  if (category) {
    results = results.filter((s) => s.category === category);
  }

  return results;
}

// ============================================================
// Tool Implementations
// ============================================================

async function skillSearch(params: {
  query?: string;
  category?: SkillCategory;
  limit?: number;
}): Promise<SkillSearchResult[]> {
  const { query, category, limit = 10 } = params;

  // Get all skills from different sources
  const builtinResults: SkillSearchResult[] = BUILTIN_SKILLS.filter((s) => {
    if (category && s.category !== category) return false;
    if (query) {
      const q = query.toLowerCase();
      return (
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      );
    }
    return true;
  }).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    version: s.version,
    installed: true,
    builtin: true,
  }));

  const installedSkills = getInstalledSkills();
  const installedResults: SkillSearchResult[] = installedSkills
    .filter((s) => {
      if (category && s.category !== category) return false;
      if (query) {
        const q = query.toLowerCase();
        return (
          s.id.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      version: s.version,
      installed: true,
      builtin: false,
    }));

  const cloudSkills = await fetchCloudSkills(query, category);
  const installedIds = new Set([
    ...BUILTIN_SKILLS.map((s) => s.id),
    ...installedSkills.map((s) => s.id),
  ]);

  const cloudResults: SkillSearchResult[] = cloudSkills
    .filter((s) => !installedIds.has(s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      version: s.version,
      installed: false,
      builtin: false,
    }));

  // Combine and limit results
  const allResults = [...builtinResults, ...installedResults, ...cloudResults];
  return allResults.slice(0, limit);
}

async function skillInfo(params: { skillId: string }): Promise<SkillManifest | null> {
  const { skillId } = params;

  // Check built-in skills
  const builtin = BUILTIN_SKILLS.find((s) => s.id === skillId);
  if (builtin) return builtin;

  // Check installed skills
  const installed = getInstalledSkills().find((s) => s.id === skillId);
  if (installed) return installed;

  // Check cloud catalog
  const cloudSkills = await fetchCloudSkills();
  const cloud = cloudSkills.find((s) => s.id === skillId);
  if (cloud) return cloud;

  return null;
}

async function skillInstall(params: {
  skillId: string;
  version?: string;
}): Promise<SkillInstallResult> {
  const { skillId, version } = params;

  // Check if already installed
  if (isBuiltinSkill(skillId)) {
    return {
      success: false,
      skillId,
      version: '',
      message: `${skillId} is a built-in skill and cannot be reinstalled.`,
    };
  }

  if (isSkillInstalled(skillId)) {
    return {
      success: false,
      skillId,
      version: '',
      message: `${skillId} is already installed. Use skill_update to update.`,
    };
  }

  // Find skill in cloud catalog
  const cloudSkills = await fetchCloudSkills();
  const skill = cloudSkills.find((s) => s.id === skillId);

  if (!skill) {
    return {
      success: false,
      skillId,
      version: '',
      message: `Skill ${skillId} not found in registry.`,
    };
  }

  // Install skill (create directory and manifest)
  ensureSkillsDirectory();
  const skillDir = path.join(WORKSPACE_SKILLS_DIR, skillId);

  try {
    fs.mkdirSync(skillDir, { recursive: true });

    // Write manifest
    const manifest: SkillManifest = {
      ...skill,
      version: version || skill.version,
    };
    fs.writeFileSync(
      path.join(skillDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Write placeholder implementation
    fs.writeFileSync(
      path.join(skillDir, 'index.ts'),
      `// ${skill.name} implementation\n// TODO: Implement skill tools\n\nexport default {};\n`
    );

    return {
      success: true,
      skillId,
      version: manifest.version,
      message: `Successfully installed ${skill.name} v${manifest.version}`,
      setupInstructions: [
        `Skill installed to ${skillDir}`,
        'Restart the workspace to load the skill',
        `Available tools: ${skill.tools.map((t) => t.name).join(', ')}`,
      ],
    };
  } catch (error) {
    return {
      success: false,
      skillId,
      version: '',
      message: `Failed to install ${skillId}: ${error}`,
    };
  }
}

async function skillList(params: {
  category?: SkillCategory;
  includeBuiltin?: boolean;
}): Promise<SkillSearchResult[]> {
  const { category, includeBuiltin = true } = params;

  const results: SkillSearchResult[] = [];

  // Add built-in skills
  if (includeBuiltin) {
    const builtins = BUILTIN_SKILLS.filter((s) => !category || s.category === category).map(
      (s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        version: s.version,
        installed: true,
        builtin: true,
      })
    );
    results.push(...builtins);
  }

  // Add installed skills
  const installed = getInstalledSkills()
    .filter((s) => !category || s.category === category)
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      version: s.version,
      installed: true,
      builtin: false,
    }));
  results.push(...installed);

  return results;
}

async function skillUninstall(params: { skillId: string }): Promise<{
  success: boolean;
  message: string;
}> {
  const { skillId } = params;

  if (isBuiltinSkill(skillId)) {
    return {
      success: false,
      message: `${skillId} is a built-in skill and cannot be uninstalled.`,
    };
  }

  if (!isSkillInstalled(skillId)) {
    return {
      success: false,
      message: `${skillId} is not installed.`,
    };
  }

  const skillDir = path.join(WORKSPACE_SKILLS_DIR, skillId);

  try {
    fs.rmSync(skillDir, { recursive: true, force: true });
    return {
      success: true,
      message: `Successfully uninstalled ${skillId}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to uninstall ${skillId}: ${error}`,
    };
  }
}

async function skillUpdate(params: { skillId?: string }): Promise<{
  updated: string[];
  failed: string[];
  message: string;
}> {
  const { skillId } = params;

  const updated: string[] = [];
  const failed: string[] = [];

  const installed = getInstalledSkills();
  const skillsToUpdate = skillId
    ? installed.filter((s) => s.id === skillId)
    : installed;

  for (const skill of skillsToUpdate) {
    // Check for newer version in cloud
    const cloudSkills = await fetchCloudSkills();
    const cloudVersion = cloudSkills.find((s) => s.id === skill.id);

    if (cloudVersion && cloudVersion.version !== skill.version) {
      // Uninstall and reinstall
      await skillUninstall({ skillId: skill.id });
      const result = await skillInstall({ skillId: skill.id, version: cloudVersion.version });

      if (result.success) {
        updated.push(`${skill.id}: ${skill.version} -> ${cloudVersion.version}`);
      } else {
        failed.push(skill.id);
      }
    }
  }

  return {
    updated,
    failed,
    message:
      updated.length > 0
        ? `Updated ${updated.length} skill(s)`
        : 'All skills are up to date',
  };
}

// ============================================================
// Skill Export
// ============================================================

export const findSkillsSkill: Skill = {
  name: 'find-skills',
  description: 'Discover and manage skills for Prismer.AI workspace',
  version: '1.0.0',

  tools: [
    {
      name: 'skill_search',
      description: 'Search for skills by name, description, or capability',
      parameters: {
        query: {
          type: 'string',
          description: 'Free-text search query',
          required: false,
        },
        category: {
          type: 'string',
          description: 'Filter by category',
          required: false,
          enum: ['latex', 'jupyter', 'pdf', 'citation', 'data', 'writing', 'general'],
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 10)',
          required: false,
        },
      },
      execute: skillSearch,
    },
    {
      name: 'skill_info',
      description: 'Get detailed information about a specific skill',
      parameters: {
        skillId: {
          type: 'string',
          description: 'The skill ID or name',
          required: true,
        },
      },
      execute: skillInfo,
    },
    {
      name: 'skill_install',
      description: 'Install a skill to the current workspace',
      parameters: {
        skillId: {
          type: 'string',
          description: 'The skill ID or package name',
          required: true,
        },
        version: {
          type: 'string',
          description: 'Specific version to install (default: latest)',
          required: false,
        },
      },
      execute: skillInstall,
    },
    {
      name: 'skill_list',
      description: 'List all skills installed in the current workspace',
      parameters: {
        category: {
          type: 'string',
          description: 'Filter by category',
          required: false,
          enum: ['latex', 'jupyter', 'pdf', 'citation', 'data', 'writing', 'general'],
        },
        includeBuiltin: {
          type: 'boolean',
          description: 'Include built-in skills (default: true)',
          required: false,
        },
      },
      execute: skillList,
    },
    {
      name: 'skill_uninstall',
      description: 'Remove a skill from the current workspace',
      parameters: {
        skillId: {
          type: 'string',
          description: 'The skill ID to uninstall',
          required: true,
        },
      },
      execute: skillUninstall,
    },
    {
      name: 'skill_update',
      description: 'Update installed skills to their latest versions',
      parameters: {
        skillId: {
          type: 'string',
          description: 'Specific skill to update (omit for all)',
          required: false,
        },
      },
      execute: skillUpdate,
    },
  ],

  initialize: async () => {
    ensureSkillsDirectory();
    console.log('[find-skills] Initialized skill discovery service');
  },
};

export default findSkillsSkill;
