/**
 * Workspace Agent API
 *
 * GET    /api/workspace/[id]/agent - Get the bound agent
 * DELETE /api/workspace/[id]/agent - Unbind the agent
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getStaticAgentConfig } from '@/lib/container/staticAgentConfig';

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/workspace/[id]/agent - Get the bound agent
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;
    const staticAgent = getStaticAgentConfig();

    if (staticAgent.enabled) {
      const workspace = await prisma.workspaceSession.findUnique({
        where: { id: workspaceId },
        select: { id: true, settings: true },
      });

      if (!workspace) {
        return NextResponse.json(
          { success: false, error: 'Workspace not found' },
          { status: 404 }
        );
      }

      let collectionId: number | null = null;
      if (workspace.settings) {
        try {
          const settings = JSON.parse(workspace.settings as string);
          collectionId = settings.collectionId ?? null;
        } catch { /* ignore */ }
      }

      if (!collectionId) {
        try {
          const { workspaceService } = await import('@/lib/services/workspace.service');
          collectionId = await workspaceService.ensureCollectionBinding(workspaceId);
        } catch { /* non-fatal */ }
      }

      return NextResponse.json({
        success: true,
        data: {
          id: staticAgent.agentId,
          workspaceId,
          ownerId: staticAgent.ownerId,
          status: staticAgent.agentStatus,
          gatewayUrl: staticAgent.gatewayWsUrl,
          collectionId,
          jupyterHostPort: staticAgent.hostPort,
          container: {
            id: `static-container-${workspaceId}`,
            status: staticAgent.containerStatus,
            hostPort: staticAgent.hostPort,
            orchestrator: staticAgent.orchestrator,
            imageTag: staticAgent.imageTag,
            healthStatus: null,
          },
        },
      });
    }

    const workspace = await prisma.workspaceSession.findUnique({
      where: { id: workspaceId },
      include: {
        agentInstance: {
          include: {
            config: { select: { id: true, name: true, modelName: true } },
            container: { select: { id: true, status: true, hostPort: true, orchestrator: true, imageTag: true, healthStatus: true } },
          },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json(
        { success: false, error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Extract collectionId from workspace settings
    let collectionId: number | null = null;
    if (workspace.settings) {
      try {
        const settings = JSON.parse(workspace.settings as string);
        collectionId = settings.collectionId ?? null;
      } catch { /* ignore */ }
    }

    // Lazy-create collection if missing (for workspaces created before binding code)
    if (!collectionId && workspace.agentInstance) {
      try {
        const { workspaceService } = await import('@/lib/services/workspace.service');
        collectionId = await workspaceService.ensureCollectionBinding(workspaceId);
      } catch { /* non-fatal */ }
    }

    // Container schema in this repo stores a single hostPort (gateway). Keep API compatible.
    const jupyterHostPort = workspace.agentInstance?.container?.hostPort ?? null;

    return NextResponse.json({
      success: true,
      data: workspace.agentInstance
        ? { ...workspace.agentInstance, collectionId, jupyterHostPort }
        : null,
    });
  } catch (error) {
    console.error('GET /api/workspace/[id]/agent error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/workspace/[id]/agent - Unbind the agent
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id: workspaceId } = await params;

    const workspace = await prisma.workspaceSession.findUnique({
      where: { id: workspaceId },
      include: { agentInstance: { include: { container: true } } },
    });

    if (!workspace) {
      return NextResponse.json(
        { success: false, error: 'Workspace not found' },
        { status: 404 }
      );
    }

    if (!workspace.agentInstance) {
      return NextResponse.json(
        { success: false, error: 'No agent bound to this workspace' },
        { status: 404 }
      );
    }

    // If the container is running, stop it first
    if (workspace.agentInstance.container?.status === 'running') {
      await prisma.container.update({
        where: { id: workspace.agentInstance.container.id },
        data: { status: 'stopped', stoppedAt: new Date() },
      });
    }

    // Delete Agent (cascade deletes container and deployment records)
    await prisma.agentInstance.delete({
      where: { id: workspace.agentInstance.id },
    });

    return NextResponse.json({
      success: true,
      data: { workspaceId, agentId: workspace.agentInstance.id },
    });
  } catch (error) {
    console.error('DELETE /api/workspace/[id]/agent error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
