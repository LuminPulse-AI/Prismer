/**
 * Workspace Service - Workspace CRUD operations
 *
 * Manages WorkspaceSession records using Prisma
 */

import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import type { WorkspaceSession, Prisma } from '@/generated/prisma';

const log = createLogger('WorkspaceService');

// ============================================================================
// Remote User ID
// ============================================================================

/**
 * Legacy numeric owner ID used by asset / collection APIs.
 * Self-host mode keeps a single local owner, so the default stays 1.
 */
export function getRemoteUserId(): number {
  return Number(process.env.REMOTE_USER_ID) || 1;
}

// ============================================================================
// Agent Template Defaults
// ============================================================================

type TemplateType = 'mathematician' | 'finance-researcher' | 'cs-researcher' | 'academic-researcher' | 'data-scientist' | 'paper-reviewer';

interface TemplateDefaults {
  systemPrompt: string;
  skills: string[];
  tools: Record<string, unknown>;
  agentName: string;
  agentDescription: string;
}

/**
 * Get default AgentConfig values from template type.
 * Based on docker/templates/{templateType}/ content.
 */
function getTemplateDefaults(templateType: TemplateType): TemplateDefaults {
  const templates: Record<TemplateType, TemplateDefaults> = {
    'mathematician': {
      systemPrompt: [
        'You are Euler, a mathematics research partner.',
        'Role: Pure & Applied Mathematics Research Partner. Emoji: 🧮',
        '',
        'Core Traits:',
        '- Rigorous and precise in mathematical reasoning',
        '- Enthusiastic about elegant proofs and connections between fields',
        '- Patient when explaining complex mathematical concepts',
        '- Demand formal justification — no hand-waving',
        '',
        'Expertise: Analysis, algebra, number theory, topology, probability, optimization, computational math.',
        '',
        'Approach: Clarify definitions, build proofs step-by-step, verify computationally, typeset in LaTeX.',
      ].join('\n'),
      skills: ['theorem-proving'],
      tools: { profile: 'full' },
      agentName: 'Euler',
      agentDescription: 'Mathematics research agent with theorem proving, LaTeX typesetting, and computational verification',
    },
    'finance-researcher': {
      systemPrompt: [
        'You are Quant, a quantitative finance research partner.',
        'Role: Quantitative Finance & Economics Research Partner. Emoji: 📈',
        '',
        'Core Traits:',
        '- Quantitatively rigorous — every claim backed by data or theory',
        '- Risk-aware — always consider downside scenarios',
        '- Practically minded — models must survive contact with real markets',
        '- Skeptical of overfitting and data snooping',
        '',
        'Expertise: Asset pricing, econometrics, portfolio optimization, derivatives, risk management, ML in finance.',
        '',
        'Approach: Assess data quality, apply statistical tests, use walk-forward analysis, report with confidence intervals.',
      ].join('\n'),
      skills: ['quant-analysis'],
      tools: { profile: 'full' },
      agentName: 'Quant',
      agentDescription: 'Quantitative finance agent with portfolio optimization, econometrics, and risk modeling skills',
    },
    'cs-researcher': {
      systemPrompt: [
        'You are Turing, a computer science research partner.',
        'Role: Computer Science Research Partner. Emoji: 💻',
        '',
        'Core Traits:',
        '- Algorithmically minded — analyze complexity naturally',
        '- Implementation-oriented — theory needs working code',
        '- Benchmark-driven — claims require empirical evidence',
        '- Systems-aware — respect real-world constraints',
        '',
        'Expertise: Algorithms, ML/DL, computer vision, NLP, distributed systems, PL theory.',
        '',
        'Approach: Formulate problem, survey related work, design with complexity analysis, implement and benchmark.',
      ].join('\n'),
      skills: ['ml-experiment'],
      tools: { profile: 'full' },
      agentName: 'Turing',
      agentDescription: 'CS research agent with ML experiments, algorithm design, and systems research skills',
    },
    'academic-researcher': {
      systemPrompt: [
        'You are a Research Assistant, an academic research partner.',
        'Role: Academic Research Partner. Emoji: 📚',
        '',
        'Core Traits:',
        '- Rigorous and precise in literature review and analysis',
        '- Proactive in suggesting relevant papers and methodologies',
        '- Patient when explaining complex research concepts',
        '- Respectful of academic conventions and citation standards',
        '',
        'Expertise: Literature review, academic writing, data analysis, LaTeX typesetting, citation management.',
        '',
        'Approach: Search literature, analyze data with Jupyter, write in LaTeX, manage references systematically.',
      ].join('\n'),
      skills: ['paper-search', 'data-analysis', 'latex-writing'],
      tools: { profile: 'full' },
      agentName: 'Research Assistant',
      agentDescription: 'Academic research agent with paper search, data analysis, and LaTeX writing skills',
    },
    'data-scientist': {
      systemPrompt: [
        'You are a Data Science Assistant, a data analysis and ML partner.',
        'Role: Data Analysis & ML Partner. Emoji: 📊',
        '',
        'Core Traits:',
        '- Analytical and data-driven in decision making',
        '- Practical — focus on actionable insights',
        '- Clear in communicating complex statistical results',
        '- Thorough in validation and reproducibility',
        '',
        'Expertise: Data wrangling, statistical analysis, machine learning, visualization, Jupyter notebooks.',
        '',
        'Approach: Explore data, apply statistical tests, build models, visualize results, document analysis.',
      ].join('\n'),
      skills: ['jupyter'],
      tools: { profile: 'full' },
      agentName: 'Data Science Assistant',
      agentDescription: 'Data science agent with Jupyter notebooks, ML experiments, and visualization skills',
    },
    'paper-reviewer': {
      systemPrompt: [
        'You are a Peer Review Assistant, an academic paper reviewer.',
        'Role: Academic Paper Reviewer. Emoji: 🔍',
        '',
        'Core Traits:',
        '- Critical but constructive in feedback',
        '- Thorough in technical assessment',
        '- Fair and unbiased in evaluation',
        '- Respectful of authors\' efforts',
        '',
        'Expertise: Technical correctness assessment, novelty evaluation, methodology review, writing quality, citation analysis.',
        '',
        'Approach: Initial read for overview, detailed analysis of methods, comparative literature check, structured review report.',
      ].join('\n'),
      skills: ['peer-review'],
      tools: { profile: 'full' },
      agentName: 'Peer Review Assistant',
      agentDescription: 'Paper review agent with structured peer review, technical assessment, and comparative analysis skills',
    },
  };

  return templates[templateType] || templates['mathematician'];
}

// ============================================================================
// Types
// ============================================================================

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  status: 'active' | 'archived';
  settings?: WorkspaceSettings;
  participantCount: number;
  taskCount: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  // Agent connection info
  agentInstanceId?: string;
  agentStatus?: string;
  agentName?: string;
}

export interface WorkspaceSettings {
  autoSave?: boolean;
  notificationsEnabled?: boolean;
  theme?: 'light' | 'dark' | 'system';
  orchestrator?: 'docker' | 'kubernetes';
  imageTag?: string;
}

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
  ownerId: string;
  settings?: WorkspaceSettings;
  templateType?: TemplateType;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string;
  status?: 'active' | 'archived';
  settings?: WorkspaceSettings;
}

export interface ListWorkspacesOptions {
  ownerId?: string;
  status?: 'active' | 'archived';
  limit?: number;
  offset?: number;
  orderBy?: 'updatedAt' | 'createdAt' | 'name';
  orderDir?: 'asc' | 'desc';
}

export interface ListWorkspacesResult {
  workspaces: Workspace[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

type WorkspaceWithCounts = WorkspaceSession & {
  _count: {
    participants: number;
    tasks: number;
    messages: number;
  };
  agentInstance?: { id: string; status: string; name: string } | null;
};

function toWorkspace(ws: WorkspaceWithCounts): Workspace {
  let settings: WorkspaceSettings | undefined;
  if (ws.settings) {
    try {
      settings = JSON.parse(ws.settings) as WorkspaceSettings;
    } catch {
      settings = undefined;
    }
  }

  return {
    id: ws.id,
    name: ws.name,
    description: ws.description ?? undefined,
    ownerId: ws.ownerId,
    status: ws.status as 'active' | 'archived',
    settings,
    participantCount: ws._count.participants,
    taskCount: ws._count.tasks,
    messageCount: ws._count.messages,
    createdAt: ws.createdAt.toISOString(),
    updatedAt: ws.updatedAt.toISOString(),
    agentInstanceId: ws.agentInstance?.id,
    agentStatus: ws.agentInstance?.status,
    agentName: ws.agentInstance?.name,
  };
}

// ============================================================================
// Service
// ============================================================================

export const workspaceService = {
  /**
   * List workspaces with optional filtering and pagination
   */
  async list(options: ListWorkspacesOptions = {}): Promise<ListWorkspacesResult> {
    const {
      ownerId,
      status,
      limit = 20,
      offset = 0,
      orderBy = 'updatedAt',
      orderDir = 'desc',
    } = options;

    const where: Prisma.WorkspaceSessionWhereInput = {};
    if (ownerId) where.ownerId = ownerId;
    if (status) where.status = status;

    const [workspaces, total] = await Promise.all([
      prisma.workspaceSession.findMany({
        where,
        orderBy: { [orderBy]: orderDir },
        skip: offset,
        take: limit,
        include: {
          _count: {
            select: {
              participants: true,
              tasks: true,
              messages: true,
            },
          },
          agentInstance: {
            select: { id: true, status: true, name: true },
          },
        },
      }),
      prisma.workspaceSession.count({ where }),
    ]);

    return {
      workspaces: workspaces.map(toWorkspace),
      total,
      hasMore: offset + limit < total,
    };
  },

  /**
   * Get a single workspace by ID
   */
  async getById(id: string, ownerId?: string): Promise<Workspace | null> {
    const where: Prisma.WorkspaceSessionWhereInput = { id };
    if (ownerId) where.ownerId = ownerId;

    const ws = await prisma.workspaceSession.findFirst({
      where,
      include: {
        _count: {
          select: {
            participants: true,
            tasks: true,
            messages: true,
          },
        },
        agentInstance: {
          select: { id: true, status: true, name: true },
        },
      },
    });

    return ws ? toWorkspace(ws) : null;
  },

  /**
   * Get the most recently updated workspace for a user
   */
  async getMostRecent(ownerId: string): Promise<Workspace | null> {
    const ws = await prisma.workspaceSession.findFirst({
      where: { ownerId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: {
            participants: true,
            tasks: true,
            messages: true,
          },
        },
        agentInstance: {
          select: { id: true, status: true, name: true },
        },
      },
    });

    return ws ? toWorkspace(ws) : null;
  },

  /**
   * Create a new workspace
   */
  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    const template = input.templateType || 'mathematician';
    log.info('Creating workspace', { name: input.name, ownerId: input.ownerId, template });

    const ws = await prisma.workspaceSession.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim(),
        ownerId: input.ownerId,
        status: 'active',
        settings: JSON.stringify({
          autoSave: true,
          notificationsEnabled: true,
          ...input.settings,
        }),
      },
      include: {
        _count: {
          select: {
            participants: true,
            tasks: true,
            messages: true,
          },
        },
        agentInstance: {
          select: { id: true, status: true, name: true },
        },
      },
    });

    // Auto-add owner as participant
    await prisma.workspaceParticipant.create({
      data: {
        workspaceId: ws.id,
        userId: input.ownerId,
        name: 'Owner',
        type: 'user',
        role: 'owner',
        status: 'online',
      },
    });

    // Auto-create AgentConfig + AgentInstance (1:1 binding)
    // Uses template defaults for systemPrompt, skills, and tools
    const defaults = getTemplateDefaults(template);

    log.info('Creating agent config + instance', {
      workspaceId: ws.id,
      template,
      skills: defaults.skills,
      agentName: defaults.agentName,
    });

    const agentConfig = await prisma.agentConfig.create({
      data: {
        name: `${input.name.trim()} Agent Config`,
        description: defaults.agentDescription,
        templateType: template,
        modelProvider: 'prismer-gateway',
        modelName: process.env.AGENT_DEFAULT_MODEL || 'gpt-4o',
        systemPrompt: defaults.systemPrompt,
        skills: JSON.stringify(defaults.skills),
        tools: JSON.stringify(defaults.tools),
      },
    });

    await prisma.agentInstance.create({
      data: {
        name: defaults.agentName,
        description: defaults.agentDescription,
        ownerId: input.ownerId,
        workspaceId: ws.id,
        configId: agentConfig.id,
        status: 'stopped',
        installedSkills: JSON.stringify(defaults.skills),
      },
    });

    // Auto-create workspace collection for file sync
    try {
      const { collectionService } = await import('./collection.service');
      const collection = await collectionService.create({
        userId: getRemoteUserId(),
        name: `${input.name.trim()}`,
        description: `Workspace collection — auto-created`,
        color: '#6366F1',
        icon: 'briefcase',
      });

      // Store collectionId in workspace settings
      {
        const currentSettings = JSON.parse(ws.settings as string || '{}');
        currentSettings.collectionId = collection.id;
        await prisma.workspaceSession.update({
          where: { id: ws.id },
          data: { settings: JSON.stringify(currentSettings) },
        });

        log.info('Workspace collection created', { workspaceId: ws.id, collectionId: collection.id });
      }
    } catch (err) {
      log.warn('Failed to create workspace collection (non-fatal)', {
        workspaceId: ws.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Refresh to get updated count + agent instance
    const updated = await this.getById(ws.id);
    log.info('Workspace created successfully', { workspaceId: ws.id, name: input.name, template });
    return updated!;
  },

  /**
   * Update a workspace
   */
  async update(id: string, ownerId: string, input: UpdateWorkspaceInput): Promise<Workspace | null> {
    // Verify ownership
    const existing = await this.getById(id, ownerId);
    if (!existing) {
      return null;
    }

    const data: Prisma.WorkspaceSessionUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description?.trim() ?? null;
    if (input.status !== undefined) data.status = input.status;
    if (input.settings !== undefined) data.settings = JSON.stringify(input.settings);

    await prisma.workspaceSession.update({
      where: { id },
      data,
    });

    return this.getById(id, ownerId);
  },

  /**
   * Delete a workspace (hard delete with cascading relations)
   */
  async delete(id: string, ownerId: string): Promise<boolean> {
    // Verify ownership
    const existing = await this.getById(id, ownerId);
    if (!existing) {
      return false;
    }

    // Delete in order respecting FK constraints
    await prisma.$transaction([
      // Delete component states
      prisma.workspaceComponentState.deleteMany({ where: { workspaceId: id } }),
      // Delete snapshots
      prisma.workspaceStateSnapshot.deleteMany({ where: { workspaceId: id } }),
      prisma.workspaceSnapshot.deleteMany({ where: { workspaceId: id } }),
      // Delete files
      prisma.workspaceFile.deleteMany({ where: { workspaceId: id } }),
      // Delete timeline events
      prisma.workspaceTimelineEvent.deleteMany({ where: { workspaceId: id } }),
      // Delete tasks
      prisma.workspaceTask.deleteMany({ where: { workspaceId: id } }),
      // Delete messages
      prisma.workspaceMessage.deleteMany({ where: { workspaceId: id } }),
      // Delete participants
      prisma.workspaceParticipant.deleteMany({ where: { workspaceId: id } }),
      // Delete agent instance if exists
      prisma.agentInstance.deleteMany({ where: { workspaceId: id } }),
      // Finally delete the workspace
      prisma.workspaceSession.delete({ where: { id } }),
    ]);

    return true;
  },

  /**
   * Archive a workspace (soft delete)
   */
  async archive(id: string, ownerId: string): Promise<Workspace | null> {
    return this.update(id, ownerId, { status: 'archived' });
  },

  /**
   * Restore an archived workspace
   */
  async restore(id: string, ownerId: string): Promise<Workspace | null> {
    return this.update(id, ownerId, { status: 'active' });
  },

  /**
   * Ensure an AgentInstance exists for a workspace (idempotent).
   * Creates AgentConfig + AgentInstance if missing.
   */
  async ensureAgentBinding(workspaceId: string, ownerId: string): Promise<void> {
    const existing = await prisma.agentInstance.findFirst({ where: { workspaceId } });
    if (existing) return;

    const workspace = await prisma.workspaceSession.findUnique({ where: { id: workspaceId } });
    if (!workspace) return;

    const defaults = getTemplateDefaults('mathematician');

    const agentConfig = await prisma.agentConfig.create({
      data: {
        name: `${workspace.name} Agent Config`,
        description: defaults.agentDescription,
        templateType: 'mathematician',
        modelProvider: 'prismer-gateway',
        modelName: process.env.AGENT_DEFAULT_MODEL || 'gpt-4o',
        systemPrompt: defaults.systemPrompt,
        skills: JSON.stringify(defaults.skills),
        tools: JSON.stringify(defaults.tools),
      },
    });

    await prisma.agentInstance.create({
      data: {
        name: defaults.agentName,
        description: defaults.agentDescription,
        ownerId,
        workspaceId,
        configId: agentConfig.id,
        status: 'stopped',
        installedSkills: JSON.stringify(defaults.skills),
      },
    });
  },

  /**
   * Ensure a workspace has a collection binding. Creates one if missing.
   */
  async ensureCollectionBinding(workspaceId: string): Promise<number | null> {
    const workspace = await prisma.workspaceSession.findUnique({
      where: { id: workspaceId },
      select: { settings: true, name: true },
    });
    if (!workspace) return null;

    const settings = workspace.settings ? JSON.parse(workspace.settings as string) : {};
    if (settings.collectionId) return settings.collectionId;

    try {
      const { collectionService } = await import('./collection.service');
      const collection = await collectionService.create({
        userId: getRemoteUserId(),
        name: workspace.name || 'Workspace',
        description: 'Workspace collection — auto-created',
        color: '#6366F1',
        icon: 'briefcase',
      });

      settings.collectionId = collection.id;
      await prisma.workspaceSession.update({
        where: { id: workspaceId },
        data: { settings: JSON.stringify(settings) },
      });

      log.info('Collection binding created', { workspaceId, collectionId: collection.id });
      return collection.id;
    } catch (err) {
      log.warn('Failed to create collection binding', {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  },

  /**
   * Return the most recent active workspace for a user, creating an
   * initial workspace when none exists yet.
   */
  async getOrCreateDefault(ownerId: string): Promise<Workspace> {
    const mostRecent = await this.getMostRecent(ownerId);
    if (mostRecent) {
      const ws = mostRecent;
      if (!ws.agentInstanceId) {
        await this.ensureAgentBinding(ws.id, ownerId);
        return (await this.getById(ws.id))!;
      }
      return ws;
    }

    // Create initial workspace (auto-creates agent)
    return this.create({
      name: 'Default Workspace',
      description: 'Your first research workspace',
      ownerId,
    });
  },

  /**
   * Count workspaces for a user
   */
  async count(ownerId: string, status?: 'active' | 'archived'): Promise<number> {
    const where: Prisma.WorkspaceSessionWhereInput = { ownerId };
    if (status) where.status = status;
    return prisma.workspaceSession.count({ where });
  },

  /**
   * Get the next workspace to switch to when current is deleted
   */
  async getNextWorkspace(currentId: string, ownerId: string): Promise<Workspace | null> {
    // Get the next most recent workspace that isn't the current one
    const ws = await prisma.workspaceSession.findFirst({
      where: {
        ownerId,
        status: 'active',
        id: { not: currentId },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: {
            participants: true,
            tasks: true,
            messages: true,
          },
        },
        agentInstance: {
          select: { id: true, status: true, name: true },
        },
      },
    });

    return ws ? toWorkspace(ws) : null;
  },
};

export default workspaceService;
