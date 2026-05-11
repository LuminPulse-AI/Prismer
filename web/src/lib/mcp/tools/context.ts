import prisma from '@/lib/prisma';
import { getStaticAgentConfig } from '@/lib/container/staticAgentConfig';
import { workspaceService } from '@/lib/services/workspace.service';
import { McpToolError } from '../errors';

export interface WorkspaceMcpToolContext {
  workspaceId: string;
  baseUrl: string;
  tokenPrefix: string;
}

export async function getAgentIdForWorkspace(workspaceId: string): Promise<string> {
  const staticAgent = getStaticAgentConfig();
  if (staticAgent.enabled) {
    const workspace = await prisma.workspaceSession.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (!workspace) {
      throw new McpToolError('INTERNAL_ERROR', 'Workspace not found');
    }

    return staticAgent.agentId;
  }

  const existing = await prisma.agentInstance.findUnique({
    where: { workspaceId },
    select: { id: true },
  });

  if (existing) return existing.id;

  const workspace = await prisma.workspaceSession.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });

  if (!workspace) {
    throw new McpToolError('INTERNAL_ERROR', 'Workspace not found');
  }

  try {
    await workspaceService.ensureAgentBinding(workspaceId, workspace.ownerId);
  } catch (error) {
    const maybeCreated = await prisma.agentInstance.findUnique({
      where: { workspaceId },
      select: { id: true },
    });
    if (maybeCreated) return maybeCreated.id;
    throw error;
  }

  const agent = await prisma.agentInstance.findUnique({
    where: { workspaceId },
    select: { id: true },
  });

  if (!agent) {
    throw new McpToolError('INTERNAL_ERROR', 'Unable to resolve workspace agent');
  }

  return agent.id;
}

export async function postWorkspaceDirective(
  context: WorkspaceMcpToolContext,
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  const agentId = await getAgentIdForWorkspace(context.workspaceId);
  const url = new URL(`/api/agents/${encodeURIComponent(agentId)}/directive`, context.baseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, payload }),
  });

  if (!response.ok) {
    throw new McpToolError('INTERNAL_ERROR', `Directive enqueue failed with HTTP ${response.status}`);
  }
}
